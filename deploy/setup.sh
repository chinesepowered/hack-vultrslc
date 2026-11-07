#!/bin/bash
# Provision an Unbothered host on a fresh Vultr Ubuntu 24.04 instance.
# Run as root (deploy/user-data.sh does this). Secrets come from /root/unbothered.env:
#   VULTR_INFERENCE_API_KEY=...   ADMIN_TOKEN=...
# Installs Docker + gVisor (the tub runtime), Node 22, Caddy (HTTPS), builds the app and
# the tub image, and installs a systemd service plus a git-pull auto-deploy timer.
set -euxo pipefail
umask 022
exec >> /var/log/unbothered-setup.log 2>&1

REPO=${REPO:-https://github.com/chinesepowered/hack-vultrslc}
BRANCH=${BRANCH:-main}
APP=/opt/unbothered
export DEBIAN_FRONTEND=noninteractive

# Vultr images ship with UFW active and only SSH allowed: open the web ports first.
if command -v ufw >/dev/null; then ufw allow 80/tcp || true; ufw allow 443/tcp || true; fi

# While provisioning, port 80 shows one line: the current step (no logs). Caddy takes the
# port over at the end.
STATUS=/var/www/unbothered-status
mkdir -p "$STATUS"
step() { echo "$(date -u +%H:%M:%S) $*" > "$STATUS/status.txt"; }
step "provisioning started"
if ! command -v caddy >/dev/null; then
  nohup python3 -m http.server 80 --directory "$STATUS" >/dev/null 2>&1 &
  echo $! > /run/unbothered-status.pid
fi

# First boot usually has unattended-upgrades holding the apt lock: retry instead of failing.
APT="apt-get -o DPkg::Lock::Timeout=600"
retry() { for _ in $(seq 1 30); do "$@" && return 0; sleep 10; done; return 1; }

step "installing base packages"
retry $APT update -y
retry $APT install -y ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https

step "installing Docker"
if ! command -v docker >/dev/null; then retry sh -c 'curl -fsSL https://get.docker.com | sh'; fi

step "installing gVisor"
cd /tmp
URL=https://storage.googleapis.com/gvisor/releases/release/latest/x86_64
retry curl -fsSLO "$URL/gvisor.tar.bz2"
retry curl -fsSLO "$URL/gvisor.tar.bz2.sha512"
sha512sum -c gvisor.tar.bz2.sha512
tar -xjf gvisor.tar.bz2
install -m 755 runsc containerd-shim-runsc-v1 /usr/local/bin/
mkdir -p /usr/local/bin/gvisor-bin && cp -a gvisor-bin/. /usr/local/bin/gvisor-bin/
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{ "runtimes": { "runsc": { "path": "/usr/local/bin/runsc", "runtimeArgs": ["--network=sandbox"] } } }
JSON
systemctl restart docker

step "installing Node 22"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  retry sh -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
  retry $APT install -y nodejs
fi

step "installing Caddy"
if [ -f /run/unbothered-status.pid ]; then kill "$(cat /run/unbothered-status.pid)" || true; rm -f /run/unbothered-status.pid; sleep 1; fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  retry $APT update -y
  retry $APT install -y caddy
fi

# --- App. User data may have fetched a tarball; make it a git checkout so the auto-deploy
# timer can pull updates.
if [ ! -d "$APP/.git" ]; then
  if [ -f "$APP/package.json" ]; then
    git -C "$APP" init -q
    git -C "$APP" remote add origin "$REPO"
    retry git -C "$APP" fetch -q origin "$BRANCH"
    git -C "$APP" reset -q --hard FETCH_HEAD
    git -C "$APP" checkout -q -B "$BRANCH"
  else
    retry git clone --branch "$BRANCH" "$REPO" "$APP"
  fi
fi
cd "$APP"
IP=$(curl -fs http://169.254.169.254/v1/interfaces/0/ipv4/address || hostname -I | awk '{print $1}')
HOST="$(echo "$IP" | tr . -).sslip.io"
cp /root/unbothered.env .env
cat >> .env <<ENV
PUBLIC_URL=https://$HOST
REGION_LABEL=${REGION_LABEL:-Vultr Cloud Compute}
NODE_ENV=production
ENV
chmod 600 .env

step "building the app"
retry npm ci --no-audit --no-fund
npm run build
step "building the tub image"
retry docker build -t unbothered/tub:1.63.0 tub/

step "starting services"
cp deploy/unbothered.service /etc/systemd/system/unbothered.service
cp deploy/unbothered-deploy.sh /usr/local/bin/unbothered-deploy && chmod +x /usr/local/bin/unbothered-deploy
cp deploy/unbothered-deploy.service deploy/unbothered-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now unbothered.service unbothered-deploy.timer

sed "s/__HOST__/$HOST/; s/__IP__/$IP/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
echo "UNBOTHERED READY https://$HOST"
