---
name: opch-slack-files
description: Download Slack file attachments on demand using the bot token from the token-vending sidecar. Never auto-download — only fetch files the user explicitly wants you to read or process.
metadata: { "openclaw": { "emoji": "📎" } }
---

# Slack files (token vending)

Slack message events that include uploads expose each attachment as an entry in the `files` array (with `id`, `name`, `mimetype`, `url_private`, `filetype`, `size`, etc.). This skill lets you **fetch a file's bytes on demand** so you can read or process it with another skill (e.g. `opch-office-docs` for `.xlsx` / `.docx` / `.pptx`).

## When to download

Download a Slack attachment **only when the current user request requires reading or processing its contents** — for example, "summarise this spreadsheet" or "fill in the missing rows". Never download files speculatively or in the background; if you are unsure whether the user wants the file used, ask.

## Getting a token

```bash
export SLACK_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/slack | jq -r .token)
```

The token is a long-lived bot token (`xoxb-…`). Required scopes:

- `files:read` — to call `files.info` and download `url_private` bytes
- `files:write` — only if you also need to upload a file back to Slack via `files.getUploadURLExternal` + `files.completeUploadExternal`

If a request returns `"missing_scope"`, the Slack app needs the scope added in the workspace's app config and re-installed; do not work around it.

## Resolving a file from the message context

When a Slack `message` event includes an upload, the inbound payload contains a `files` array. You will see the file's `id` in the conversation context (or you can list recent files in the channel). Fetch full metadata first — never assume `url_private` from the event payload alone is current:

```bash
curl -s "https://slack.com/api/files.info?file=FILE_ID" \
  -H "Authorization: Bearer $SLACK_TOKEN"
```

Useful fields on the response: `file.url_private`, `file.url_private_download`, `file.name`, `file.filetype`, `file.mimetype`, `file.size`.

## Downloading the file

`url_private` and `url_private_download` are **not** public URLs — they require the bot token as a Bearer header. A plain `curl` without auth returns an HTML login page, not the file.

```bash
SLUG=$(echo "FILE_NAME" | tr -c 'A-Za-z0-9._-' '_')
OUT="/tmp/openclaw/slack/${SLUG}"
mkdir -p /tmp/openclaw/slack
curl -sSL -H "Authorization: Bearer $SLACK_TOKEN" \
  -o "$OUT" "URL_PRIVATE"
```

After download, verify the bytes match the expected size from `files.info`:

```bash
test "$(stat -c%s "$OUT")" = "EXPECTED_SIZE" || echo "size mismatch — abort"
```

Mime/filetype to expected handler:

| `filetype` | Handler |
|------------|---------|
| `xlsx`     | `opch-office-docs` (openpyxl) |
| `docx`     | `opch-office-docs` (python-docx) |
| `pptx`     | `opch-office-docs` (python-pptx) |
| `csv`      | python `csv` (stdlib) |
| `text`/`md`/`json` | `read` tool with the local path |
| `pdf`      | not supported in this image; tell the user |
| `png`/`jpg`/image | `read` tool can render the local path |

## Listing or finding files

If you need to look up a file the user mentioned but did not just upload:

```bash
# Recent files in a channel
curl -s "https://slack.com/api/files.list?channel=CHANNEL_ID&count=10" \
  -H "Authorization: Bearer $SLACK_TOKEN"

# Files shared by a specific user
curl -s "https://slack.com/api/files.list?user=USER_ID&count=10" \
  -H "Authorization: Bearer $SLACK_TOKEN"
```

## Uploading a file back to Slack

Modern uploads use a two-step API. Requires `files:write`.

```bash
SIZE=$(stat -c%s "$OUT")

# 1. Request an upload URL
RESP=$(curl -s -G "https://slack.com/api/files.getUploadURLExternal" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  --data-urlencode "filename=$(basename "$OUT")" \
  --data-urlencode "length=$SIZE")
UPLOAD_URL=$(echo "$RESP" | jq -r .upload_url)
FILE_ID=$(echo "$RESP" | jq -r .file_id)

# 2. PUT the bytes
curl -sS -X POST -T "$OUT" "$UPLOAD_URL" >/dev/null

# 3. Complete + share into a channel
curl -s -X POST "https://slack.com/api/files.completeUploadExternal" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"files\":[{\"id\":\"$FILE_ID\",\"title\":\"$(basename "$OUT")\"}],\"channel_id\":\"CHANNEL_ID\"}"
```

## Rules

- **Never** auto-download. The user must have asked for the file's contents to be used.
- **Never** download to a path the user did not implicitly authorise (`/tmp/openclaw/slack/` is fine; do not write into the user's home or shared volumes).
- **Never** print or log the raw token, the `url_private` (it contains team-scoped routing), or the file bytes.
- **Always** verify the downloaded size against `files.info`.
- **Always** delete temp files when the turn is finished if the file contained sensitive data.
- If `files:read` is missing, stop and tell the user — do not try alternative endpoints.
