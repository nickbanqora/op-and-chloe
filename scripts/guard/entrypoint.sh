#!/usr/bin/env bash
# Guard (Op) entrypoint: start OpenClaw, then launch the session watcher
# that monitors Chloe's activity in real-time.
set -euo pipefail

# Forward localhost:18789 to the worker container so the OpenClaw CLI
# (which hardcodes ws://127.0.0.1:$port) can reach Chloe's gateway.
if [ -n "${WORKER_HOST:-}" ]; then
  socat TCP-LISTEN:18789,fork,reuseaddr,bind=127.0.0.1 TCP:"${WORKER_HOST}":18789 &
fi

# Start OpenClaw in the background.
"$@" &
MAIN_PID=$!

SESSION_WATCHER="/opt/op-and-chloe/scripts/guard/session-watcher.sh"
if [ -f "$SESSION_WATCHER" ]; then
  bash "$SESSION_WATCHER" &
fi

wait "$MAIN_PID"
