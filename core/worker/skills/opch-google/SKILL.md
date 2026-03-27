---
name: opch-google
description: Use Google Workspace APIs (Gmail, Calendar, Drive) with short-lived tokens from the token-vending sidecar. Never store or hardcode credentials.
metadata: { "openclaw": { "emoji": "🔵" } }
---

# Google Workspace (token vending)

You interact with Google Workspace APIs using short-lived OAuth2 access tokens from the **token-vending sidecar**. The service account credentials stay in the sidecar — you never see them.

## Getting a token

```bash
export GOOGLE_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/google | jq -r .token)
```

The token is valid for **1 hour** and scoped to the default scopes configured in the sidecar.

### Requesting specific scopes

If you only need a subset of APIs, request narrower scopes:

```bash
export GOOGLE_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/google \
  -d '{"scopes":["https://www.googleapis.com/auth/gmail.readonly"]}' | jq -r .token)
```

### Impersonating a different user

If the sidecar is configured with domain-wide delegation, you can request a token for a specific user:

```bash
export GOOGLE_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/google \
  -d '{"subject":"other-user@company.com"}' | jq -r .token)
```

## Using the token with curl

All Google APIs accept the token as a Bearer header:

### Gmail

```bash
# List messages
curl -s -H "Authorization: Bearer $GOOGLE_TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10"

# Read a message
curl -s -H "Authorization: Bearer $GOOGLE_TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/MSG_ID"

# Send a message (base64url-encoded RFC 2822)
curl -s -X POST -H "Authorization: Bearer $GOOGLE_TOKEN" \
  -H "Content-Type: application/json" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" \
  -d '{"raw":"BASE64URL_ENCODED_MESSAGE"}'
```

### Calendar

```bash
# List upcoming events
curl -s -H "Authorization: Bearer $GOOGLE_TOKEN" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&timeMin=$(date -u +%Y-%m-%dT%H:%M:%SZ)&orderBy=startTime&singleEvents=true"

# Create an event
curl -s -X POST -H "Authorization: Bearer $GOOGLE_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events" \
  -d '{"summary":"Meeting","start":{"dateTime":"2026-03-28T10:00:00Z"},"end":{"dateTime":"2026-03-28T11:00:00Z"}}'
```

### Drive

```bash
# List files
curl -s -H "Authorization: Bearer $GOOGLE_TOKEN" \
  "https://www.googleapis.com/drive/v3/files?pageSize=10"

# Download a file
curl -s -H "Authorization: Bearer $GOOGLE_TOKEN" \
  "https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media" -o output.txt

# Upload a file
curl -s -X POST -H "Authorization: Bearer $GOOGLE_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
  -F "metadata={\"name\":\"file.txt\"};type=application/json" \
  -F "file=@localfile.txt"
```

## Using with gcloud CLI

If `gcloud` is installed, you can set the access token directly:

```bash
TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/google | jq -r .token)

# Use for a single command
gcloud auth print-access-token  # won't work — use the token directly instead:
curl -H "Authorization: Bearer $TOKEN" ...

# Or configure gcloud to use the token
gcloud config set auth/access_token_file <(echo "$TOKEN")
```

Note: `gcloud` is primarily designed for GCP infrastructure, not Workspace APIs. For Gmail/Calendar/Drive, direct curl with the Bearer token is simpler and more reliable.

## Token lifecycle

- Tokens expire after **1 hour**. If a request returns 401, fetch a fresh token.
- The sidecar caches tokens and reuses them until near-expiry.
- For long-running tasks, refresh between steps.

```bash
refresh_google_token() {
  export GOOGLE_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/google | jq -r .token)
}
```

## Rules

- **Never** hardcode tokens, store them in files, or commit them.
- **Never** ask the user for Google credentials or service account keys.
- **Always** fetch tokens from the socket immediately before use.
- **Never** print or log the raw token value.
- If the socket is unavailable, say so and ask the user to check the token-vending setup (step 19 in the setup wizard). Do not attempt to work around it.
