#!/bin/bash
# Unbothered bootstrap, run once by cloud-init on a fresh Vultr Ubuntu 24.04 instance.
# deploy/create_vm.py fills in the __PLACEHOLDERS__; secrets only ever live in /root/unbothered.env.
exec > /var/log/unbothered-userdata.log 2>&1
chmod 600 /var/log/unbothered-userdata.log
set -x

# Web ports first: Vultr images ship with UFW active and only SSH allowed.
if command -v ufw >/dev/null; then ufw allow 80/tcp; ufw allow 443/tcp; fi

# One line of progress on port 80 (no logs) until Caddy takes the port over.
STATUS=/var/www/unbothered-status
mkdir -p "$STATUS"
echo "bootstrap: started" > "$STATUS/status.txt"
nohup python3 -m http.server 80 --directory "$STATUS" >/dev/null 2>&1 &
echo $! > /run/unbothered-status.pid

(umask 077; cat > /root/unbothered.env <<'EOF'
VULTR_INFERENCE_API_KEY=__INFERENCE_KEY__
ADMIN_TOKEN=__ADMIN_TOKEN__
EOF
)

# Optional owner login (filled in by create_vm.py when requested). Never traced; restarts
# don't wait, because waiting on a service restart from inside cloud-init can hang.
{ set +x; } 2>/dev/null
__OWNER_LOGIN__
set -x

# The code: create_vm.py embeds it here (so a private repo works). Without a bundle it is
# fetched from GitHub with curl, because apt (and so git) is often locked on first boot.
APP=/opt/unbothered
mkdir -p "$APP"
echo "bootstrap: unpacking code" > "$STATUS/status.txt"
base64 -d <<'EOF' | tar -xz -C "$APP"
__CODE_BUNDLE__
EOF
if [ ! -f "$APP/package.json" ]; then
  echo "bootstrap: fetching code" > "$STATUS/status.txt"
  for _ in $(seq 1 30); do
    curl -fsSL "https://codeload.github.com/chinesepowered/hack-vultrslc/tar.gz/refs/heads/__BRANCH__" \
      | tar -xz --strip-components=1 -C "$APP" && break
    sleep 10
  done
fi
if [ ! -f "$APP/package.json" ]; then
  echo "bootstrap: could not get the code (private repo and no embedded bundle?)" > "$STATUS/status.txt"
  exit 1
fi
echo "__CODE_REV__" > "$APP/.deploy-rev"

# Run setup as its own systemd unit so nothing in cloud-init can block or kill it.
echo "bootstrap: starting setup" > "$STATUS/status.txt"
systemd-run --unit=unbothered-setup --no-block \
  --setenv=REGION_LABEL="__REGION_LABEL__" --setenv=BRANCH="__BRANCH__" \
  bash "$APP/deploy/setup.sh"
