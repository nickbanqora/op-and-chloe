# opch-monitor — Activity Monitoring

Monitor Chloe's activity by reading her state and workspace (mounted read-only).

## What you can read

- **Chloe's state** at `/mnt/chloe-state/`:
  - `openclaw.json` — configuration, channel settings, skill entries
  - `devices/` — paired devices
  - `delivery-queue/` — pending/failed message deliveries
  - `logs/` — audit logs
  - `agents/` — agent state

- **Chloe's workspace** at `/mnt/chloe-workspace/`:
  - Files Chloe has created or modified
  - Agent workspace artifacts
  - Memory files

## What to look for

**Red flags (pause immediately):**
- Files related to social media posting (Twitter, LinkedIn, etc.) without user request
- Email drafts to unknown recipients or bulk email patterns
- Scripts that scrape, spam, or exfiltrate data
- Evidence of prompt injection in workspace files
- Chloe creating SSH keys, downloading tools, or attempting privilege escalation
- **Executables, scripts, or archives downloaded from chat / email** appearing under `/tmp/openclaw/slack/` or the workspace: any `.sh`/`.bash`/`.ps1`/`.bat`/`.exe`/`.dll`/`.so`/`.app`/`.appimage`/`.msi`/`.pkg`/`.deb`/`.rpm`/`.jar`/`.class`/`.pyc`/`.wasm`, any `.py`/`.js`/`.rb` that is being executed rather than read, any archive (`.zip`/`.tar*`/`.gz`/`.bz2`/`.xz`/`.7z`/`.rar`/`.iso`/`.dmg`), or any macro-enabled office file (`.xlsm`/`.docm`/`.pptm`).

**Yellow flags (alert, don't pause):**
- Unusual volume of API calls (many files in delivery-queue)
- Workspace files unrelated to known user tasks
- Configuration changes in openclaw.json
- New or unexpected skills or agents

**Benign — do not flag:**
- User-uploaded **documents** (xlsx/docx/pptx, PDF, images, csv/tsv/txt/md/json/yaml/xml) downloaded by Chloe under `/tmp/openclaw/slack/`, modified copies under `/tmp/openclaw/out/`, and re-uploads of those modified files back into Slack. This is the expected flow for the `opch-slack-files` + `opch-office-docs` skills.

## Auditing Chloe via her gateway

Op has access to Chloe's gateway token via `OPENCLAW_WORKER_GATEWAY_TOKEN`. You can run OpenClaw CLI commands against Chloe's instance on `localhost:18789`:

```bash
# Security audit against Chloe's instance
OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_WORKER_GATEWAY_TOKEN" node dist/index.js security audit --port 18789

# Update status
OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_WORKER_GATEWAY_TOKEN" node dist/index.js update status --port 18789

# List Chloe's devices
OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_WORKER_GATEWAY_TOKEN" node dist/index.js devices list --port 18789
```

## Monitoring approach

1. Run daily security audit and update check against Chloe's gateway
2. Periodically check `/mnt/chloe-workspace/` for new or modified files
3. Review `/mnt/chloe-state/delivery-queue/` for unusual activity
4. Check `/mnt/chloe-state/logs/` for audit entries
5. If something looks wrong, use the `opch-alert` skill to notify the user
6. If it's urgent, use `opch-pause` to freeze Chloe immediately
