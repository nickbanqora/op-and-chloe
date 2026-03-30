#!/usr/bin/env bash
# Pause watcher: monitors a sentinel file and sends SIGSTOP/SIGCONT to
# the main process (PID passed as $1). Op creates the file to pause Chloe;
# removing it resumes her.
set -euo pipefail

MAIN_PID="$1"
PAUSE_FILE="/var/run/guard-control/paused"
PAUSED=false

while true; do
  if [ -f "$PAUSE_FILE" ] && [ "$PAUSED" = "false" ]; then
    echo "[pause-watcher] pause file detected — sending SIGSTOP to PID $MAIN_PID"
    kill -STOP "$MAIN_PID" 2>/dev/null || true
    PAUSED=true
  elif [ ! -f "$PAUSE_FILE" ] && [ "$PAUSED" = "true" ]; then
    echo "[pause-watcher] pause file removed — sending SIGCONT to PID $MAIN_PID"
    kill -CONT "$MAIN_PID" 2>/dev/null || true
    PAUSED=false
  fi
  sleep 5
done
