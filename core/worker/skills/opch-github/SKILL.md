---
name: opch-github
description: Use GitHub via gh CLI with short-lived tokens from the token-vending sidecar. Never store or hardcode credentials.
metadata: { "openclaw": { "emoji": "🐙" } }
---

# GitHub (token vending)

You interact with GitHub using the **`gh`** CLI. Credentials come from the **token-vending sidecar** — a local service that vends short-lived GitHub tokens via a Unix socket. You never see or store the underlying private key.

## Getting a token

Before any `gh` or `git` command that needs authentication, fetch a fresh token:

```bash
export GITHUB_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github | jq -r .token)
```

The token is valid for **1 hour** and scoped to the repositories the GitHub App is installed on. `gh` automatically uses `GITHUB_TOKEN` when set.

### Down-scoped tokens

If you only need access to specific repos or reduced permissions, request a narrower token:

```bash
export GITHUB_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github \
  -d '{"repos":["myorg/repo-a"],"permissions":{"contents":"read"}}' | jq -r .token)
```

Use down-scoped tokens when you know the task is limited to a specific repo or only needs read access.

## Using gh

Always specify `--repo owner/repo` when not inside a git directory.

### Pull requests

```bash
# List open PRs
gh pr list --repo owner/repo

# View PR details
gh pr view 55 --repo owner/repo

# Check CI status
gh pr checks 55 --repo owner/repo

# Create a PR
gh pr create --repo owner/repo --title "Fix bug" --body "Description"
```

### Issues

```bash
# List issues
gh issue list --repo owner/repo

# Create an issue
gh issue create --repo owner/repo --title "Bug report" --body "Details"

# Comment on an issue
gh issue comment 42 --repo owner/repo --body "Working on this"
```

### Workflow runs

```bash
# List recent runs
gh run list --repo owner/repo --limit 10

# View a run (see which steps failed)
gh run view <run-id> --repo owner/repo

# View logs for failed steps only
gh run view <run-id> --repo owner/repo --log-failed
```

### API for advanced queries

```bash
# Get PR with specific fields
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'

# List collaborators
gh api repos/owner/repo/collaborators --jq '.[].login'
```

### JSON output

Most commands support `--json` for structured output with `--jq` to filter:

```bash
gh pr list --repo owner/repo --json number,title,state --jq '.[] | "\(.number): \(.title) [\(.state)]"'
```

## Using git

For clone/push/pull, use the token as a credential:

```bash
TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github | jq -r .token)

# Clone
git clone https://x-access-token:${TOKEN}@github.com/owner/repo.git

# Or configure for an existing repo
git -C /path/to/repo remote set-url origin https://x-access-token:${TOKEN}@github.com/owner/repo.git
```

## Token lifecycle

- Tokens expire after **1 hour**. If a command fails with a 401, fetch a fresh token.
- The sidecar caches un-scoped tokens and reuses them until near-expiry. Calling the socket repeatedly is cheap.
- For long-running tasks, refresh the token between steps rather than at the start only.

### Refreshing pattern for multi-step work

```bash
# Helper function — call before each step that needs auth
refresh_gh_token() {
  export GITHUB_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github | jq -r .token)
}

refresh_gh_token
gh pr list --repo owner/repo
# ... more work ...
refresh_gh_token
gh pr create --repo owner/repo --title "Done" --body "Description"
```

## Checking token-vending health

```bash
curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/health | jq .
```

If this fails, the sidecar is not running. Ask Op or the user to check `docker ps | grep token-vending`.

## Rules

- **Never** hardcode tokens, store them in files, or commit them to git.
- **Never** ask the user for a PAT or any GitHub credentials.
- **Always** fetch tokens from the socket immediately before use.
- **Never** print or log the raw token value. If you need to verify auth works, use `gh auth status` or `gh api user --jq .login`.
- If the socket is unavailable, say so and ask the user to check the token-vending setup (step 19 in the setup wizard). Do not attempt to work around it.
