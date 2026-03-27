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

The setup wizard (`sudo ./setup.sh`, step 19) handles steps 1-2 automatically.
You only need to do the provider-specific steps (creating apps, downloading keys) manually.

### 1. Create the secrets directory and config (wizard step 19)

The wizard creates `/etc/token-vending/`, seeds `config.yaml` from the example,
and opens it in an editor. You can also do this manually:

```bash
sudo mkdir -p /etc/token-vending
sudo chmod 700 /etc/token-vending
sudo cp token-vending/config.example.yaml /etc/token-vending/config.yaml
sudo nano /etc/token-vending/config.yaml
```

### 2. Set up providers and place secret files (manual)

This is the part you do outside the wizard — creating GitHub Apps, Google service
accounts, etc. and placing their keys on the host. See the provider sections below
for specific instructions.

Example for GitHub:

```bash
# After creating a GitHub App and downloading its private key:
sudo cp your-github-app.pem /etc/token-vending/github-key.pem
sudo chmod 600 /etc/token-vending/github-key.pem
```

Then edit `/etc/token-vending/config.yaml` with the provider details:

```yaml
github:
  client_id: "Iv1.abc123def456"
  key_file: github-key.pem
```

### 3. Start (wizard step 18, or manual)

```bash
sudo ./restart.sh
```

The service auto-discovers which providers are configured and enables them.
Providers with missing config or secret files are silently skipped.
The wizard's test option (step 19 > option 2) can verify the socket is working.

## Providers

### GitHub

Vends short-lived GitHub App installation tokens (1hr TTL). Supports down-scoping
to fewer repos/permissions per request.

**Config:**

```yaml
github:
  client_id: "Iv1.abc123def456"   # from GitHub App settings page
  key_file: github-key.pem       # relative to secrets dir
```

Installation ID is auto-discovered at startup. Set `installation_id` explicitly only if the App is installed on multiple orgs.

**Secret file:** The App's private key (.pem), downloaded from GitHub App settings > Private keys.

**Setup (manual — these steps are done on GitHub, not the wizard):**

1. Go to **GitHub > Settings > Developer settings > GitHub Apps > New GitHub App**
2. Set permissions to only what Chloe needs (e.g. Contents: RW, Pull requests: RW, Issues: RW)
3. Uncheck Webhook "Active" (not needed)
4. Create, then **Install App** on your org — select only the repos Chloe needs
5. Note the **Client ID** from the App settings page
6. Generate a private key, copy it to `/etc/token-vending/github-key.pem` on the host
7. Add the `github` section to `/etc/token-vending/config.yaml` (wizard step 19 opens the editor)

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
