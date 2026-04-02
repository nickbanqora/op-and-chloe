---
name: opch-sentry
description: Use Sentry API with OAuth2 tokens from the token-vending sidecar. Never store or hardcode credentials.
metadata: { "openclaw": { "emoji": "🐛" } }
---

# Sentry (token vending)

You interact with Sentry using the **REST API** via `curl`. Credentials come from the **token-vending sidecar** via OAuth2 refresh tokens. You never see or store the underlying client secret.

## Getting a token

Before any Sentry API call, fetch a fresh token:

```bash
export SENTRY_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/sentry | jq -r .token)
```

The token is valid for **30 days**. The sidecar caches it and auto-refreshes via the OAuth2 refresh token.

## Region

Sentry uses regional API endpoints. Default to **EU** (`de.sentry.io`):

```bash
SENTRY_BASE="https://de.sentry.io/api/0"
```

**If `/organizations/` returns an empty list**, the org is on a different region. Try:
- US: `https://us.sentry.io/api/0`
- Legacy: `https://sentry.io/api/0`

Ask the user which region if unsure.

## Discovering the org

```bash
curl -s "$SENTRY_BASE/organizations/" -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[].slug'
```

## Common queries

### List projects

```bash
curl -s "$SENTRY_BASE/organizations/{org_slug}/projects/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[] | {slug, name, platform}'
```

### List recent issues

```bash
curl -s "$SENTRY_BASE/projects/{org_slug}/{project_slug}/issues/?query=is:unresolved&sort=date" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[] | {id, title, culprit, count, lastSeen}'
```

### Get issue details

```bash
curl -s "$SENTRY_BASE/issues/{issue_id}/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '{title, metadata, count, firstSeen, lastSeen, status}'
```

### Get latest event for an issue

```bash
curl -s "$SENTRY_BASE/issues/{issue_id}/events/latest/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '{eventID, title, message, tags, entries}'
```

### List events for a project

```bash
curl -s "$SENTRY_BASE/projects/{org_slug}/{project_slug}/events/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" | jq '.[] | {eventID, title, dateCreated}'
```

## Mutations

### Resolve an issue

```bash
curl -s -X PUT "$SENTRY_BASE/issues/{issue_id}/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}' | jq .
```

### Assign an issue

```bash
curl -s -X PUT "$SENTRY_BASE/issues/{issue_id}/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignedTo": "user@example.com"}' | jq .
```

### Ignore an issue

```bash
curl -s -X PUT "$SENTRY_BASE/issues/{issue_id}/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ignored"}' | jq .
```

## Token lifecycle

- Tokens are valid for **30 days**. The sidecar caches and auto-refreshes via OAuth2.
- If a command fails with a 401, fetch a fresh token.

## Helper pattern

```bash
sentry_api() {
  local path="$1"; shift
  export SENTRY_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/sentry | jq -r .token)
  curl -s "https://de.sentry.io/api/0${path}" \
    -H "Authorization: Bearer $SENTRY_TOKEN" \
    "$@" | jq .
}

# Usage
sentry_api "/organizations/"
sentry_api "/issues/{issue_id}/" -X PUT -H "Content-Type: application/json" -d '{"status":"resolved"}'
```

## Rules

- **Never** hardcode tokens, store them in files, or commit them to git.
- **Never** ask the user for a Sentry auth token or credentials.
- **Always** fetch tokens from the socket immediately before use.
- **Never** print or log the raw token value.
- If the socket is unavailable, say so and ask the user to check the token-vending setup. Do not attempt to work around it.
