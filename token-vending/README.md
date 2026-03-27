# Token Vending Service

A sidecar that vends short-lived credentials to Chloe without exposing long-lived secrets.

Chloe never sees private keys or service account files. She requests tokens via a Unix socket;
the token-vending container holds the secrets in an isolated filesystem namespace and returns
short-lived tokens.

## Architecture

```
Host filesystem
  /etc/token-vending/
    config.yaml              <- provider configuration
    github-key.pem           <- secret files (one per provider)
    google-sa.json
    ...

token-vending container                  Chloe container
  mounts /etc/token-vending (ro)          mounts socket (ro)
  auto-discovers configured providers     curl --unix-socket ...
  listens on Unix socket                  gets short-lived tokens
  calls provider APIs                     never sees secrets
```

**Chloe cannot access the secret files.** Docker filesystem namespace isolation ensures
the secrets directory is invisible to every other container. The Unix socket volume is
the only shared surface, and it only returns tokens.

## Quick start

### 1. Create the secrets directory

```bash
sudo mkdir -p /etc/token-vending
sudo chmod 700 /etc/token-vending
```

Or run `sudo ./setup.sh` and select step **19 (token vending)**.

### 2. Create config.yaml

```bash
sudo cp token-vending/config.example.yaml /etc/token-vending/config.yaml
sudo nano /etc/token-vending/config.yaml
```

Example:

```yaml
github:
  app_id: "123456"
  installation_id: "78901234"
  key_file: github-key.pem
```

### 3. Place secret files

Copy secret files into `/etc/token-vending/` alongside config.yaml:

```bash
sudo cp your-github-app.pem /etc/token-vending/github-key.pem
sudo chmod 600 /etc/token-vending/github-key.pem
```

### 4. Start

```bash
sudo ./restart.sh
```

The service auto-discovers which providers are configured and enables them.
Providers with missing config or secret files are silently skipped.

## Providers

### GitHub

Vends short-lived GitHub App installation tokens (1hr TTL). Supports down-scoping
to fewer repos/permissions per request.

**Config:**

```yaml
github:
  app_id: "123456"                # from GitHub App settings page
  installation_id: "78901234"     # from installation URL
  key_file: github-key.pem       # relative to secrets dir
```

**Secret file:** The App's private key (.pem), downloaded from GitHub App settings > Private keys.

**Setup:**

1. Go to **GitHub > Settings > Developer settings > GitHub Apps > New GitHub App**
2. Set permissions to only what Chloe needs (e.g. Contents: RW, Pull requests: RW, Issues: RW)
3. Uncheck Webhook "Active" (not needed)
4. Create, then **Install App** on your org — select only the repos Chloe needs
5. Note the App ID (settings page) and Installation ID (from URL after installing)
6. Generate a private key and place it in the secrets dir

**Usage:**

```bash
# Full permissions
curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github

# Down-scoped
curl -s --unix-socket /var/run/token-vending/vending.sock http://localhost/token/github \
  -d '{"repos":["myorg/repo-a"],"permissions":{"contents":"read"}}'

# Use with gh CLI
export GITHUB_TOKEN=$(curl -s --unix-socket /var/run/token-vending/vending.sock \
  http://localhost/token/github | jq -r .token)
gh pr list --repo myorg/repo-a
```

## Adding a new provider

1. Create `providers/<name>.js` exporting:
   - `name` — string identifier (used in URL path)
   - `description` — human-readable description
   - `check(config, secretsDir)` — return config object if configured, null otherwise
   - `init(providerConfig)` — return provider state (called once at startup)
   - `vend(state, options)` — return a token object (called per request)

2. Add a section to `config.example.yaml` documenting the config shape

3. That's it — the server auto-discovers providers from the `providers/` directory

## API

### `GET /health`

Returns service status and enabled providers.

```json
{"status":"ok","providers":{"github":"GitHub App installation tokens (1hr TTL)"}}
```

### `GET|POST /token/:provider`

Vend a short-lived token. POST body is passed to the provider's `vend()` as options
(provider-specific, e.g. `repos` and `permissions` for GitHub).

### Error responses

- `404` — provider not configured (includes list of configured providers)
- `500` — provider API call failed (includes error message)

## Security model

| Component | Can access secrets? | Can access tokens? |
|-----------|--------------------|--------------------|
| Token vending | Yes (mounted dir) | Yes (generates them) |
| Chloe (worker) | No | Yes (via socket, ro) |
| Op (guard) | No | No (socket not mounted) |
| Browser | No | No |

## Troubleshooting

**No providers enabled:** Check that `/etc/token-vending/config.yaml` exists and has valid
provider sections, and that the referenced secret files exist alongside it.

**Socket not found in Chloe:** The token-vending container may not be running.
Check `docker ps | grep token-vending`.

**GitHub 401:** The private key may have been rotated. Generate a new one from the
GitHub App settings and replace the file in the secrets dir, then restart.
