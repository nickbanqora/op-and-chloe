#!/usr/bin/env bash
# Resume watcher: monitors the guard-control volume for a "resume" sentinel file.
# When found, starts the Chloe (gateway) container and cleans up.
# Runs on the HOST (not inside a container) via systemd timer.
set -euo pipefail

COMPOSE_FILE="${OPENCLAW_COMPOSE_FILE:-/opt/op-and-chloe/compose.yml}"
ENV_FILE="${OPENCLAW_ENV_FILE:-/etc/openclaw/stack.env}"
VOLUME_DATA=$(docker volume inspect op-and-chloe_guard-control --format '{{.Mountpoint}}' 2>/dev/null || echo "")

if [ -z "$VOLUME_DATA" ]; then
  exit 0
fi

RESUME_FILE="$VOLUME_DATA/resume"

if [ ! -f "$RESUME_FILE" ]; then
  exit 0
fi

echo "[resume-watcher] resume sentinel found: $(cat "$RESUME_FILE")"

rm -f "$RESUME_FILE"
rm -f "$VOLUME_DATA/paused"
rm -f "$VOLUME_DATA/kill"

echo "[resume-watcher] starting openclaw-gateway"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start openclaw-gateway

echo "[resume-watcher] done"
