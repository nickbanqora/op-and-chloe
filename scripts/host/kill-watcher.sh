#!/usr/bin/env bash
# Kill watcher: monitors the guard-control volume for a "kill" sentinel file.
# When found, restarts the Chloe (gateway) container and cleans up.
# Runs on the HOST (not inside a container) via systemd timer or cron.
set -euo pipefail

COMPOSE_FILE="${OPENCLAW_COMPOSE_FILE:-/opt/op-and-chloe/compose.yml}"
ENV_FILE="${OPENCLAW_ENV_FILE:-/etc/openclaw/stack.env}"
VOLUME_DATA=$(docker volume inspect op-and-chloe_guard-control --format '{{.Mountpoint}}' 2>/dev/null || echo "")

if [ -z "$VOLUME_DATA" ]; then
  exit 0
fi

KILL_FILE="$VOLUME_DATA/kill"

if [ ! -f "$KILL_FILE" ]; then
  exit 0
fi

echo "[kill-watcher] kill sentinel found: $(cat "$KILL_FILE")"

# Remove both sentinel files before restart.
rm -f "$KILL_FILE"
rm -f "$VOLUME_DATA/paused"

echo "[kill-watcher] stopping openclaw-gateway"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop openclaw-gateway

echo "[kill-watcher] done"
