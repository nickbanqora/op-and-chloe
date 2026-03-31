import fs from "node:fs";
import path from "node:path";

export const name = "notion";
export const description = "Notion OAuth2 access tokens via public integration (1hr TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `notion` section with client_id,
 * client_secret_file, and refresh_token_file.
 */
export function check(config, secretsDir, refreshDir) {
  const n = config?.notion;
  if (!n) return null;
  if (!n.client_id || !n.client_secret_file || !n.refresh_token_file) return null;

  const secretPath = path.join(secretsDir, n.client_secret_file);

  // Read refresh token from writable refreshDir first, fall back to secretsDir for initial seed
  const refreshWritePath = path.join(refreshDir, n.refresh_token_file);
  const refreshSeedPath = path.join(secretsDir, n.refresh_token_file);

  if (!fs.existsSync(secretPath)) return null;
  if (!fs.existsSync(refreshWritePath) && !fs.existsSync(refreshSeedPath)) return null;

  return {
    clientId: n.client_id,
    secretPath,
    refreshWritePath,
    refreshSeedPath,
  };
}

/**
 * Initialise provider state (called once at startup).
 */
export async function init(providerConfig) {
  const clientSecret = fs.readFileSync(providerConfig.secretPath, "utf-8").trim();

  // Read from writable path first, fall back to seed in secrets dir
  let refreshToken;
  if (fs.existsSync(providerConfig.refreshWritePath)) {
    refreshToken = fs.readFileSync(providerConfig.refreshWritePath, "utf-8").trim();
  } else {
    refreshToken = fs.readFileSync(providerConfig.refreshSeedPath, "utf-8").trim();
  }

  if (!refreshToken) {
    throw new Error("Refresh token file is empty — complete the OAuth flow first");
  }

  // Ensure refresh dir exists
  const refreshDir = path.dirname(providerConfig.refreshWritePath);
  fs.mkdirSync(refreshDir, { recursive: true });

  return {
    clientId: providerConfig.clientId,
    clientSecret,
    refreshToken,
    refreshWritePath: providerConfig.refreshWritePath,
  };
}

let cachedToken = null;

/**
 * Vend a short-lived access token.
 * Refreshes the token pair and persists the new refresh token to the writable dir.
 */
export async function vend(state) {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken) {
    if (Date.now() < cachedToken._expiresAt - 5 * 60 * 1000) {
      return {
        token: cachedToken.token,
        expires_at: cachedToken.expires_at,
        workspace_id: cachedToken.workspace_id,
        workspace_name: cachedToken.workspace_name,
      };
    }
  }

  const credentials = Buffer.from(`${state.clientId}:${state.clientSecret}`).toString("base64");

  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: state.refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion token endpoint ${res.status}: ${text}`);
  }

  const result = await res.json();

  // Notion rotates the refresh token on every use — persist to writable dir
  if (result.refresh_token) {
    state.refreshToken = result.refresh_token;
    fs.writeFileSync(state.refreshWritePath, result.refresh_token, "utf-8");
  }

  const expiresAt = Date.now() + (result.expires_in || 3600) * 1000;

  cachedToken = {
    token: result.access_token,
    expires_at: new Date(expiresAt).toISOString(),
    _expiresAt: expiresAt,
    workspace_id: result.workspace_id,
    workspace_name: result.workspace_name,
  };

  return {
    token: cachedToken.token,
    expires_at: cachedToken.expires_at,
    workspace_id: cachedToken.workspace_id,
    workspace_name: cachedToken.workspace_name,
  };
}
