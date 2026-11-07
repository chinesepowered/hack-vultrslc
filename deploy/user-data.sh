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

# Fetch the code with curl: apt (and so git) is often locked by unattended upgrades on first boot.
echo "bootstrap: fetching code" > "$STATUS/status.txt"
mkdir -p /opt/unbothered
for _ in $(seq 1 30); do
  curl -fsSL "https://codeload.github.com/chinesepowered/hack-vultrslc/tar.gz/refs/heads/__BRANCH__" \
    | tar -xz --strip-components=1 -C /opt/unbothered && break
  sleep 10
done

# Run setup as its own systemd unit so nothing in cloud-init can block or kill it.
echo "bootstrap: starting setup" > "$STATUS/status.txt"
systemd-run --unit=unbothered-setup --no-block \
  --setenv=REGION_LABEL="__REGION_LABEL__" --setenv=BRANCH="__BRANCH__" \
  bash /opt/unbothered/deploy/setup.sh

# Optional owner login (filled in by create_vm.py when requested). Never traced; restarts
# don't wait, because waiting on a service restart from inside cloud-init can hang.
{ set +x; } 2>/dev/null
__OWNER_LOGIN__
set -x
