#!/usr/bin/env bash
# Delete session JSONL files older than 14 days.
# Run via cron: 0 4 * * * /opt/op-and-chloe/scripts/host/cleanup-sessions.sh
set -euo pipefail

RETENTION_DAYS=${1:-14}
ENV_FILE=${ENV_FILE:-/etc/openclaw/stack.env}

CHLOE_SESSIONS="${OPENCLAW_STATE_DIR:-/var/lib/openclaw/chloe/state}/agents/main/sessions"
GUARD_SESSIONS="${OPENCLAW_GUARD_STATE_DIR:-/var/lib/openclaw/guard/state}/agents/main/sessions"

for dir in "$CHLOE_SESSIONS" "$GUARD_SESSIONS"; do
  [ -d "$dir" ] || continue
  count=$(find "$dir" -name '*.jsonl' -o -name '*.jsonl.reset.*' -o -name '*.jsonl.deleted.*' | xargs -r stat --format='%Y %n' 2>/dev/null | awk -v cutoff="$(date -d "-${RETENTION_DAYS} days" +%s)" '$1 < cutoff {print $2}' | wc -l)
  if [ "$count" -gt 0 ]; then
    find "$dir" -name '*.jsonl' -o -name '*.jsonl.reset.*' -o -name '*.jsonl.deleted.*' | xargs -r stat --format='%Y %n' 2>/dev/null | awk -v cutoff="$(date -d "-${RETENTION_DAYS} days" +%s)" '$1 < cutoff {print $2}' | xargs -r rm -v
    echo "[cleanup] removed $count session files older than ${RETENTION_DAYS} days from $dir"
  fi
done
