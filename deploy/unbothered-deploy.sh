#!/bin/bash
# Pull-based deploy: fetch the branch, and if it moved, rebuild what changed and restart.
# A box set up from the embedded code bundle has no .git yet. It becomes a checkout on the
# first run that can read the repo, so while the repo is private this quietly does nothing.
set -euo pipefail
export GIT_TERMINAL_PROMPT=0
cd /opt/unbothered
REPO=https://github.com/chinesepowered/hack-vultrslc
BRANCH=$(cat .deploy-branch 2>/dev/null || git rev-parse --abbrev-ref HEAD)
if [ ! -d .git ]; then
  git ls-remote --exit-code "$REPO" "refs/heads/$BRANCH" >/dev/null 2>&1 || exit 0
  git init -q -b "$BRANCH" && git remote add origin "$REPO"
fi
git fetch -q origin "$BRANCH"
OLD=$(git rev-parse -q --verify HEAD || cat .deploy-rev 2>/dev/null || true)
NEW=$(git rev-parse FETCH_HEAD)
if [ "$OLD" = "$NEW" ]; then
  # Same code as the bundle: just adopt the commit so later runs can diff against it.
  git rev-parse -q --verify HEAD >/dev/null || git reset -q --hard "$NEW"
  exit 0
fi
# Don't interrupt a Capybara Test that is running: the next tick tries again.
if curl -fs http://127.0.0.1:8080/api/eval | grep -q '"running":true'; then
  echo "eval running, deploy deferred"; exit 0
fi
if git cat-file -e "$OLD^{commit}" 2>/dev/null; then
  CHANGED=$(git diff --name-only "$OLD" "$NEW")
else
  CHANGED=$(git ls-tree -r --name-only "$NEW")
fi
git reset -q --hard "$NEW"
if echo "$CHANGED" | grep -q '^package'; then npm ci --no-audit --no-fund; fi
if echo "$CHANGED" | grep -qE '^(web/|package)'; then npm run build; fi
if echo "$CHANGED" | grep -q '^tub/'; then docker build -t unbothered/tub:1.63.0 tub/; fi
if echo "$CHANGED" | grep -q '^deploy/Caddyfile'; then
  HOST=$(grep '^PUBLIC_URL=' .env | sed 's#PUBLIC_URL=https://##')
  IP=$(echo "$HOST" | cut -d. -f1 | tr - .)
  sed "s/__HOST__/$HOST/; s/__IP__/$IP/" deploy/Caddyfile > /etc/caddy/Caddyfile && systemctl reload caddy
fi
if echo "$CHANGED" | grep -q '^deploy/unbothered-deploy.sh'; then install -m 755 deploy/unbothered-deploy.sh /usr/local/bin/unbothered-deploy; fi
systemctl restart unbothered
echo "deployed $NEW"
