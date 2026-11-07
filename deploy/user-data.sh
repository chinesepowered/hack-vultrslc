#!/bin/bash
# Unbothered bootstrap, run once by cloud-init on a fresh Vultr Ubuntu 24.04 instance.
# deploy/create_vm.py fills in the __PLACEHOLDERS__; secrets only ever live in /root/unbothered.env.
exec > /var/log/unbothered-userdata.log 2>&1
chmod 600 /var/log/unbothered-userdata.log
set -x

# Web ports first: Vultr images ship with UFW active and only SSH allowed.
if command -v ufw >/dev/null; then ufw allow 80/tcp; ufw allow 443/tcp; fi

(umask 077; cat > /root/unbothered.env <<'EOF'
VULTR_INFERENCE_API_KEY=__INFERENCE_KEY__
ADMIN_TOKEN=__ADMIN_TOKEN__
EOF
)

{ set +x; } 2>/dev/null   # never trace secrets
__OWNER_LOGIN__
set -x

export REGION_LABEL="__REGION_LABEL__" BRANCH="__BRANCH__"

# Fetch the code with curl: apt (and so git) is often locked by unattended upgrades on first boot.
mkdir -p /opt/unbothered
for _ in $(seq 1 30); do
  curl -fsSL "https://codeload.github.com/chinesepowered/hack-vultrslc/tar.gz/refs/heads/__BRANCH__" \
    | tar -xz --strip-components=1 -C /opt/unbothered && break
  sleep 10
done
bash /opt/unbothered/deploy/setup.sh
