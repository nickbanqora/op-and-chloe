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

echo "[upgrade] fixing script ownership"
chown -R 1000:1000 "$STACK_DIR/scripts/" 2>/dev/null || true

echo "[upgrade] stopping stack"
"$STACK_DIR/stop.sh"

echo "[upgrade] starting stack (builds + restarts)"
"$STACK_DIR/start.sh"

echo "[upgrade] done"
