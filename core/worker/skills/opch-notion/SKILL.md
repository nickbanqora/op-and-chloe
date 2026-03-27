---
name: opch-notion
description: Use the Notion API with short-lived tokens from the token-vending sidecar. Never store or hardcode credentials.
metadata: { "openclaw": { "emoji": "📝" } }
---

# Notion (token vending)

You interact with the Notion API using short-lived OAuth2 access tokens from the **token-vending sidecar**. The client secret and refresh token stay in the sidecar — you never see them.

## Getting a token

```bash
export NOTION_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/notion | jq -r .token)
```

The token is valid for **1 hour**. The integration can only access pages the user explicitly shared with it during the OAuth flow.

## Using the Notion API

All requests go to `https://api.notion.com/v1/` with the token as a Bearer header and a Notion-Version header.

### Search

```bash
curl -s -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"query":"meeting notes","page_size":10}'
```

### Read a page

```bash
curl -s "https://api.notion.com/v1/pages/PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28"
```

### Read page content (blocks)

```bash
curl -s "https://api.notion.com/v1/blocks/PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28"
```

### Query a database

```bash
curl -s -X POST "https://api.notion.com/v1/databases/DB_ID/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"page_size":10}'
```

### Create a page

```bash
curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"database_id": "DB_ID"},
    "properties": {
      "Name": {"title": [{"text": {"content": "New item"}}]}
    }
  }'
```

### Add content to a page

```bash
curl -s -X PATCH "https://api.notion.com/v1/blocks/PAGE_ID/children" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "children": [
      {"paragraph": {"rich_text": [{"text": {"content": "Hello from Chloe"}}]}}
    ]
  }'
```

### Comments

```bash
# List comments on a page
curl -s "https://api.notion.com/v1/comments?block_id=PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28"

# Add a comment
curl -s -X POST "https://api.notion.com/v1/comments" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"parent":{"page_id":"PAGE_ID"},"rich_text":[{"text":{"content":"A comment"}}]}'
```

## Token lifecycle

- Tokens expire after **1 hour**. If a request returns 401, fetch a fresh token.
- The sidecar caches tokens and reuses them until near-expiry.
- For long-running tasks, refresh between steps.

```bash
refresh_notion_token() {
  export NOTION_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/notion | jq -r .token)
}
```

## Rules

- **Never** hardcode tokens, store them in files, or commit them.
- **Never** ask the user for Notion credentials or integration secrets.
- **Always** fetch tokens from the socket immediately before use.
- **Never** print or log the raw token value.
- **Always** include `Notion-Version: 2022-06-28` in requests.
- If the socket is unavailable, say so and ask the user to check the token-vending setup (step 19 in the setup wizard). Do not attempt to work around it.
