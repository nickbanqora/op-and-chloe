#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-/etc/openclaw/stack.env}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STACK_DIR=${STACK_DIR:-$SCRIPT_DIR}
COMPOSE_FILE=${COMPOSE_FILE:-$STACK_DIR/compose.yml}
[ -f "$ENV_FILE" ] && INSTANCE=$(grep -E '^INSTANCE=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | head -1)
INSTANCE=${INSTANCE:-op-and-chloe}

cd "$STACK_DIR"

# Enable token-vending profile if configured
TV_SECRETS_DIR="${TOKEN_VENDING_SECRETS_DIR:-/etc/token-vending}"
PROFILE_FLAGS=""
if [ -f "$TV_SECRETS_DIR/config.yaml" ]; then
  PROFILE_FLAGS="--profile token-vending"
  echo "[start] token-vending: config found, enabling profile"
else
  echo "[start] token-vending: no config found, skipping"
fi

echo "[start] syncing core instructions into workspaces"
bash "$STACK_DIR/scripts/host/sync-workspaces.sh"

# Fix ownership of scripts that OpenClaw references in secrets providers.
# After git pull these are owned by root, but OpenClaw requires them to be
# owned by the container user (UID 1000).
echo "[start] fixing script ownership for container user"
chown -R 1000:1000 "$STACK_DIR/scripts/worker/" "$STACK_DIR/scripts/guard/" 2>/dev/null || true

echo "[start] building images"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" $PROFILE_FLAGS build openclaw-guard openclaw-gateway

echo "[start] pulling images (browser only; guard/worker are local builds)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" $PROFILE_FLAGS pull browser

echo "[start] bringing stack up"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" $PROFILE_FLAGS up -d

echo "[start] container status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" $PROFILE_FLAGS ps

echo "[start] warming up browser/CDP"
sleep 10

# Refresh worker state with current browser container CDP URL so Chloe's browser tool works
if docker ps -q -f "name=${INSTANCE:-op-and-chloe}-browser" | grep -q . 2>/dev/null; then
  echo "[start] updating webtop CDP URL in worker state"
  STACK_DIR="$STACK_DIR" ENV_FILE="$ENV_FILE" bash "$STACK_DIR/scripts/host/update-webtop-cdp-url.sh" 2>/dev/null || true
fi

echo "[start] waiting for gateways to listen (guard 18790, worker 18789)..."
max=120
for i in $(seq 1 "$max"); do
  w="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 http://127.0.0.1:18789/ 2>/dev/null || echo 000)"
  g="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 http://127.0.0.1:18790/ 2>/dev/null || echo 000)"
  if [ "$w" = "200" ] && [ "$g" = "200" ]; then
    echo "[start] gateways ready after ${i}s"
    break
  fi
  [ "$i" -eq "$max" ] && { echo "[start] WARN: gateways not ready after ${max}s"; break; }
  sleep 1
done

if tailscale status >/dev/null 2>&1; then
  echo "[start] applying Tailscale serve (Guard, Worker, Webtop)"
  bash "$STACK_DIR/scripts/host/apply-tailscale-serve.sh" 2>/dev/null || true
fi
echo "[start] healthcheck"
STACK_DIR="$STACK_DIR" ENV_FILE="$ENV_FILE" "$STACK_DIR/healthcheck.sh"
