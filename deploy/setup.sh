#!/bin/bash
# Provision an Unbothered host on a fresh Vultr Ubuntu 24.04 instance.
# Run as root (cloud-init user_data does this). Secrets come from /root/unbothered.env:
#   VULTR_INFERENCE_API_KEY=...   ADMIN_TOKEN=...
# Installs Docker + gVisor (the tub runtime), Node 22, Caddy (HTTPS), builds the app and
# the tub image, and installs a systemd service plus a git-pull auto-deploy timer.
set -euxo pipefail
exec >> /var/log/unbothered-setup.log 2>&1

REPO=${REPO:-https://github.com/chinesepowered/hack-vultrslc}
BRANCH=${BRANCH:-claude/dazzling-brahmagupta-fepg3r}
APP=/opt/unbothered
export DEBIAN_FRONTEND=noninteractive

# While provisioning, serve this log (no secrets in it) on port 80 so progress can be
# checked without SSH. Stopped before Caddy takes over the port.
mkdir -p /var/log/unbothered-public
ln -sf /var/log/unbothered-setup.log /var/log/unbothered-public/setup.log
if ! command -v caddy >/dev/null; then
  nohup python3 -m http.server 80 --directory /var/log/unbothered-public >/dev/null 2>&1 &
  echo $! > /run/unbothered-logserver.pid
fi

apt-get update -y
apt-get install -y ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https

# --- Docker
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi

# --- gVisor: the user-space kernel every tub runs under
cd /tmp
URL=https://storage.googleapis.com/gvisor/releases/release/latest/x86_64
curl -fsSLO "$URL/gvisor.tar.bz2" && curl -fsSLO "$URL/gvisor.tar.bz2.sha512"
sha512sum -c gvisor.tar.bz2.sha512
tar -xjf gvisor.tar.bz2
install -m 755 runsc containerd-shim-runsc-v1 /usr/local/bin/
mkdir -p /usr/local/bin/gvisor-bin && cp -a gvisor-bin/. /usr/local/bin/gvisor-bin/
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{ "runtimes": { "runsc": { "path": "/usr/local/bin/runsc", "runtimeArgs": ["--network=sandbox"] } } }
JSON
systemctl restart docker

# --- Node 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# --- Caddy (automatic HTTPS)
if [ -f /run/unbothered-logserver.pid ]; then kill "$(cat /run/unbothered-logserver.pid)" || true; rm -f /run/unbothered-logserver.pid; sleep 1; fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# --- App
if [ ! -d "$APP/.git" ]; then git clone --branch "$BRANCH" "$REPO" "$APP"; fi
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
npm ci --no-audit --no-fund
npm run build
docker build -t unbothered/tub:1.63.0 tub/

cp deploy/unbothered.service /etc/systemd/system/unbothered.service
cp deploy/unbothered-deploy.sh /usr/local/bin/unbothered-deploy && chmod +x /usr/local/bin/unbothered-deploy
cp deploy/unbothered-deploy.service deploy/unbothered-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now unbothered.service unbothered-deploy.timer

sed "s/__HOST__/$HOST/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
echo "UNBOTHERED READY https://$HOST"
