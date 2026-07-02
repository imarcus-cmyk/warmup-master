#!/usr/bin/env bash
# Pull warmup logs from the DigitalOcean runner into this workspace.
# Deployment intentionally excludes logs/ so server history is never deleted;
# this script is the safe reverse sync for local history/debugging.
#
#   bash scripts/syncLogs.sh
#   WARMUP_HOST=root@1.2.3.4 bash scripts/syncLogs.sh
set -euo pipefail

HOST="${WARMUP_HOST:-root@159.223.153.58}"
DEST="${WARMUP_DEST:-/opt/warmup-master}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HERE/logs"

echo ">> syncing logs from $HOST:$DEST/logs/ -> $HERE/logs/"
rsync -az \
  "$HOST:$DEST/logs/" \
  "$HERE/logs/"

echo ">> done. local warmup history is synced."
