#!/usr/bin/env bash
set -euo pipefail

INSTANCE=${INSTANCE:-op-and-chloe}
GW_CONTAINER=${GW_CONTAINER:-${INSTANCE}-openclaw-gateway}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STACK_DIR=${STACK_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}

printf "== containers ==\n"
docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" \
  | awk "BEGIN{print \"NAME\\tSTATUS\\tIMAGE\"} /^${INSTANCE}-/{print}"

echo
printf "== gateway port mapping ==\n"
docker port "$GW_CONTAINER" 18789/tcp 2>/dev/null || echo "(no port mapping found)"

echo
printf "== CDP smoke test ==\n"
bash "$STACK_DIR/scripts/host/cdp-smoke-test.sh"

echo
printf "== network/security checks ==\n"
if tailscale status >/dev/null 2>&1; then
  echo "✅ Tailscale - Running"
else
  echo "⚠️  Tailscale - Not running"
fi

echo
printf "== token vending ==\n"
TV_CONTAINER=${TV_CONTAINER:-${INSTANCE}-token-vending}
if docker ps -q -f "name=$TV_CONTAINER" 2>/dev/null | grep -q .; then
  # Test health via worker container's socket mount
  health=$(docker exec "$GW_CONTAINER" curl -sf --unix-socket /var/run/token-vending/vending.sock http://localhost/health 2>/dev/null) && \
    echo "✅ Token vending - Running ($(echo "$health" | python3 -c 'import sys,json; p=json.load(sys.stdin).get("providers",{}); print(", ".join(p.keys()) if p else "no providers")' 2>/dev/null || echo 'unknown'))" || \
    echo "⚠️  Token vending - Container running but socket health check failed"
else
  echo "⚪ Token vending - Not running"
fi

echo
printf "== recent gateway logs (tail) ==\n"
docker logs "$GW_CONTAINER" --tail=20
