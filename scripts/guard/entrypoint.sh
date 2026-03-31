#!/usr/bin/env bash
# Guard (Op) entrypoint: start OpenClaw, then launch the session watcher
# that monitors Chloe's activity in real-time.
set -euo pipefail

# Start OpenClaw in the background.
"$@" &
MAIN_PID=$!

SESSION_WATCHER="/opt/op-and-chloe/scripts/guard/session-watcher.sh"
if [ -f "$SESSION_WATCHER" ]; then
  bash "$SESSION_WATCHER" &
fi

wait "$MAIN_PID"
