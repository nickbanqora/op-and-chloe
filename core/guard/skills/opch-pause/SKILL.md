# opch-pause — Pause/Resume Chloe

Control Chloe's execution via a sentinel file on a shared volume.

## How it works

A background watcher in Chloe's container checks `/var/run/guard-control/paused` every 5 seconds. When the file exists, Chloe's process is frozen (SIGSTOP). When removed, it resumes (SIGCONT).

## Pause Chloe

Create the sentinel file with a reason:

```bash
echo '{"reason": "Suspicious Twitter posting scripts", "ts": "'$(date -Iseconds)'", "by": "op"}' > /var/run/guard-control/paused
```

Chloe will be frozen within 5 seconds. Any in-flight API calls may still complete server-side, but Chloe will not process responses or take new actions.

## Resume Chloe

Remove the sentinel file:

```bash
rm /var/run/guard-control/paused
```

Chloe resumes within 5 seconds.

## Check status

```bash
if [ -f /var/run/guard-control/paused ]; then
  echo "Chloe is PAUSED:"
  cat /var/run/guard-control/paused
else
  echo "Chloe is RUNNING"
fi
```

## Workflow

1. Detect suspicious activity (see `opch-monitor`)
2. Pause Chloe immediately
3. Alert the user (see `opch-alert`)
4. Wait for the user to reply with a decision
5. If user says resume: remove the pause file
6. If user says investigate: keep paused, provide details
