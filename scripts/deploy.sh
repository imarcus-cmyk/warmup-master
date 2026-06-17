#!/usr/bin/env bash
# Deploy this repo to the DigitalOcean droplet that runs the daily warmup cron.
# The server copy is NOT a git checkout, so code changes only land via this sync.
#
#   bash scripts/deploy.sh            # sync + npm ci + validate
#   WARMUP_HOST=root@1.2.3.4 bash scripts/deploy.sh
#
# Never deletes server-side .env, logs/, or node_modules (excluded from --delete).
set -euo pipefail

HOST="${WARMUP_HOST:-root@159.223.153.58}"
DEST="${WARMUP_DEST:-/opt/warmup-master}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo ">> deploying $HERE  ->  $HOST:$DEST"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'logs' \
  --exclude '.env' \
  "$HERE/" "$HOST:$DEST/"

echo ">> installing deps + validating registry on server"
ssh "$HOST" "cd '$DEST' && npm ci --omit=dev && node src/orchestrator.js --validate"

echo ">> done. server is synced. crontab unchanged."
echo "   manual full run:  ssh $HOST 'cd $DEST && npm run warmup:daily'"
