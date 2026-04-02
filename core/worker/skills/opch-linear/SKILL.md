---
name: opch-linear
description: Use Linear API with short-lived tokens from the token-vending sidecar. Never store or hardcode credentials.
metadata: { "openclaw": { "emoji": "📐" } }
---

# Linear (token vending)

You interact with Linear using the **GraphQL API** via `curl`. Credentials come from the **token-vending sidecar** — a local service that vends tokens via a Unix socket. You never see or store the underlying client secret.

## Getting a token

Before any Linear API call, fetch a fresh token:

```bash
export LINEAR_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/linear | jq -r .token)
```

The token is valid for **30 days** and scoped to all public teams in the workspace. The sidecar caches it and reuses until near-expiry.

## API basics

Linear uses a single GraphQL endpoint:

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}' | jq .
```

## Common queries

### List issues assigned to the app

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(first: 20, orderBy: updatedAt) { nodes { id identifier title state { name } assignee { name } priority priorityLabel } } }"}' | jq .
```

### Search issues

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issueSearch(query: \"bug\", first: 10) { nodes { id identifier title state { name } } } }"}' | jq .
```

### Get a specific issue by identifier

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issue(id: \"ISSUE-UUID\") { id identifier title description state { name } assignee { name } comments { nodes { body user { name } createdAt } } } }"}' | jq .
```

### List teams

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id name key } } }"}' | jq .
```

### List workflow states for a team

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ team(id: \"TEAM-UUID\") { states { nodes { id name type } } } }"}' | jq .
```

## Mutations

### Create an issue

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { issueCreate(input: { teamId: \"TEAM-UUID\", title: \"Issue title\", description: \"Details\" }) { success issue { id identifier url } } }"}' | jq .
```

### Add a comment

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { commentCreate(input: { issueId: \"ISSUE-UUID\", body: \"Comment text\" }) { success comment { id } } }"}' | jq .
```

### Update issue state

```bash
curl -s https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { issueUpdate(id: \"ISSUE-UUID\", input: { stateId: \"STATE-UUID\" }) { success issue { id identifier state { name } } } }"}' | jq .
```

## Token lifecycle

- Tokens are valid for **30 days**. The sidecar caches the token and only fetches a new one when approaching expiry.
- If a command fails with a 401, fetch a fresh token.
- Linear only allows **one active token per OAuth app** — fetching a new one invalidates the previous. The sidecar handles this.

## Helper pattern

```bash
linear_query() {
  local query="$1"
  export LINEAR_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/linear | jq -r .token)
  curl -s https://api.linear.app/graphql \
    -H "Authorization: Bearer $LINEAR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$query\"}" | jq .
}

# Usage
linear_query "{ viewer { id name } }"
linear_query "{ teams { nodes { id name key } } }"
```

## Rules

- **Never** hardcode tokens, store them in files, or commit them to git.
- **Never** ask the user for a Linear API key or credentials.
- **Always** fetch tokens from the socket immediately before use.
- **Never** print or log the raw token value.
- If the socket is unavailable, say so and ask the user to check the token-vending setup. Do not attempt to work around it.
