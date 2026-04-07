#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STACK_DIR=${STACK_DIR:-$SCRIPT_DIR}
ENV_FILE=${ENV_FILE:-/etc/openclaw/stack.env}

cd "$STACK_DIR"

echo "[upgrade] pulling latest code"
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git reset --hard "origin/$BRANCH"

echo "[upgrade] fixing ownership"
chown -R 1000:1000 "$STACK_DIR" 2>/dev/null || true

echo "[upgrade] stopping stack"
"$STACK_DIR/stop.sh"

echo "[upgrade] removing stale containers"
INSTANCE=${INSTANCE:-op-and-chloe}
docker ps -aq --filter "name=${INSTANCE}-" | xargs -r docker rm -f 2>/dev/null || true

echo "[upgrade] starting stack (builds + restarts)"
"$STACK_DIR/start.sh"

echo "[upgrade] done"
