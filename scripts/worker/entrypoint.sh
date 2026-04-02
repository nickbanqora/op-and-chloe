#!/usr/bin/env bash
# Worker (Chloe) entrypoint: load Bitwarden session into environment so all processes
# (including agent-invoked shells) see it. Then exec OpenClaw.
set -euo pipefail
BW_ENV="/home/node/.openclaw/secrets/bitwarden.env"
BW_SESSION_FILE="/home/node/.openclaw/secrets/bw-session"
export BITWARDENCLI_APPDATA_DIR="/home/node/.openclaw/bitwarden-cli"
[ -f "$BW_ENV" ] && . "$BW_ENV"
[ -f "$BW_SESSION_FILE" ] && export BW_SESSION=$(cat "$BW_SESSION_FILE")

# Resolve Gemini API key from token vending so the memory embedding provider
# can find it via the GOOGLE_API_KEY env var (auth-profiles.json SecretRef
# is not resolved by the memory indexer — OpenClaw bug).
SOCK="/var/run/token-vending/vending.sock"
for i in $(seq 1 30); do
  curl -sf --unix-socket "$SOCK" http://localhost/health >/dev/null 2>&1 && break
  sleep 1
done
if curl -sf --unix-socket "$SOCK" http://localhost/health >/dev/null 2>&1; then
  GEMINI_API_KEY=$(curl -sf --unix-socket "$SOCK" http://localhost/token/keychain \
    -d '{"name":"gemini"}' | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["token"])' 2>/dev/null)
  if [ -n "$GEMINI_API_KEY" ]; then
    export GEMINI_API_KEY
    # Patch auth-profiles so the memory indexer can resolve the key
    # (it reads auth-profiles.json directly and doesn't resolve SecretRefs)
    python3 -c "
import json, pathlib
ap = pathlib.Path('/home/node/.openclaw/agents/main/agent/auth-profiles.json')
if ap.exists():
    d = json.loads(ap.read_text())
    p = d.setdefault('profiles', {}).setdefault('google:default', {})
    p['type'] = 'api_key'
    p['provider'] = 'google'
    p['key'] = '$GEMINI_API_KEY'
    ap.write_text(json.dumps(d, indent=2) + '\n')
" 2>/dev/null
    echo "[entrypoint] GEMINI_API_KEY injected" >&2
  fi
fi

# Start OpenClaw in the background, then launch pause-watcher
"$@" &
MAIN_PID=$!

PAUSE_WATCHER="/opt/op-and-chloe/scripts/worker/pause-watcher.sh"
if [ -f "$PAUSE_WATCHER" ]; then
  bash "$PAUSE_WATCHER" "$MAIN_PID" &
fi

wait "$MAIN_PID"
