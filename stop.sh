#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-/etc/openclaw/stack.env}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STACK_DIR=${STACK_DIR:-$SCRIPT_DIR}
COMPOSE_FILE=${COMPOSE_FILE:-$STACK_DIR/compose.yml}

cd "$STACK_DIR"

PROFILE_FLAGS=""
if [ -f "${TOKEN_VENDING_SECRETS_DIR:-/etc/token-vending}/config.yaml" ]; then
  PROFILE_FLAGS="--profile token-vending"
fi

echo "[stop] stopping and removing containers (volumes preserved)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" $PROFILE_FLAGS down
