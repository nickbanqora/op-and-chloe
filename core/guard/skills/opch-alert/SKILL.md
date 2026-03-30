# opch-alert — Alerting

Send alerts through your configured Slack/Telegram channel when you observe suspicious activity from Chloe.

## How to alert

You communicate through your native OpenClaw channel (Slack bot or Telegram bot). Just send a message. No special scripts needed — it's how you normally talk.

## What to include

1. **What you observed** — specific files, logs, or behavior
2. **Severity** — red flag (you paused Chloe) or yellow flag (informational)
3. **Evidence** — quote the relevant file content or log entry
4. **Action taken** — whether you paused Chloe or not
5. **What you need** — e.g. "reply 'resume' to unpause Chloe"

## Alert format

Keep alerts concise and actionable:

```
[RED FLAG] Chloe creating Twitter posting scripts in workspace
- File: /mnt/chloe-workspace/post_tweets.py
- Contains: bulk posting logic targeting 50+ accounts
- Action taken: PAUSED Chloe
- Waiting for your decision: reply "resume" or "investigate"
```

## Daily audit

Run a daily security and update audit and post the results to your channel:

1. Check Chloe's security posture (config, exposed tools, sandbox mode)
2. Check for OpenClaw updates
3. Review Chloe's recent workspace activity for anything unusual
4. Summarise findings in a single message

Example daily report:

```
Daily Security & Update Audit

1. Security Audit
   - 0 critical issues, 1 warning, 1 info
   - Warning: [description and recommendation]
   - Info: [attack surface summary]

2. Update Status
   - Current version: [version]
   - Updates available: [yes/no]

3. Chloe Activity Review
   - Workspace files modified: [count]
   - New files: [list any notable ones]
   - Delivery queue: [status]
   - Nothing suspicious / [flag any concerns]
```
