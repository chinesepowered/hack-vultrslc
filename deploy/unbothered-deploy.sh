#!/bin/bash
# Pull-based deploy: fetch the branch, and if it moved, rebuild what changed and restart.
set -euo pipefail
cd /opt/unbothered
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$BRANCH"
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse FETCH_HEAD)
[ "$OLD" = "$NEW" ] && exit 0
CHANGED=$(git diff --name-only "$OLD" "$NEW")
git reset -q --hard "$NEW"
if echo "$CHANGED" | grep -q '^package'; then npm ci --no-audit --no-fund; fi
if echo "$CHANGED" | grep -qE '^(web/|package)'; then npm run build; fi
if echo "$CHANGED" | grep -q '^tub/'; then docker build -t unbothered/tub:1.63.0 tub/; fi
if echo "$CHANGED" | grep -q '^deploy/Caddyfile'; then
  HOST=$(grep '^PUBLIC_URL=' .env | sed 's#PUBLIC_URL=https://##')
  sed "s/__HOST__/$HOST/" deploy/Caddyfile > /etc/caddy/Caddyfile && systemctl reload caddy
fi
# Don't interrupt a Capybara Test that is running.
if curl -fs http://127.0.0.1:8080/api/eval | grep -q '"running":true'; then
  echo "eval running, restart deferred"; git reset -q --hard "$OLD"; exit 0
fi
systemctl restart unbothered
echo "deployed $NEW"
