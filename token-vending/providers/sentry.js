import fs from "node:fs";
import path from "node:path";

export const name = "sentry";
export const description = "Sentry OAuth2 access tokens (30-day TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `sentry` section with client_id,
 * client_secret_file, and refresh_token_file.
 */
export function check(config, secretsDir, refreshDir) {
  const s = config?.sentry;
  if (!s) return null;
  if (!s.client_id || !s.client_secret_file || !s.refresh_token_file) return null;

  const secretPath = path.join(secretsDir, s.client_secret_file);
  const refreshWritePath = path.join(refreshDir, s.refresh_token_file);
  const refreshSeedPath = path.join(secretsDir, s.refresh_token_file);

  if (!fs.existsSync(secretPath)) return null;
  if (!fs.existsSync(refreshWritePath) && !fs.existsSync(refreshSeedPath)) return null;

  return {
    clientId: s.client_id,
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

  let refreshToken;
  if (fs.existsSync(providerConfig.refreshWritePath)) {
    refreshToken = fs.readFileSync(providerConfig.refreshWritePath, "utf-8").trim();
  } else {
    refreshToken = fs.readFileSync(providerConfig.refreshSeedPath, "utf-8").trim();
  }

  if (!refreshToken) {
    throw new Error("Refresh token file is empty — run the OAuth flow first");
  }

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
 * Vend a short-lived access token via refresh token grant.
 */
export async function vend(state) {
  // Return cached token if still valid (1 hour buffer)
  if (cachedToken && Date.now() < cachedToken._expiresAt - 60 * 60 * 1000) {
    return {
      token: cachedToken.token,
      expires_at: cachedToken.expires_at,
    };
  }

  const res = await fetch("https://sentry.io/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: state.refreshToken,
      client_id: state.clientId,
      client_secret: state.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry token endpoint ${res.status}: ${text}`);
  }

  const result = await res.json();

  // Persist new refresh token if rotated
  if (result.refresh_token && result.refresh_token !== state.refreshToken) {
    state.refreshToken = result.refresh_token;
    fs.writeFileSync(state.refreshWritePath, result.refresh_token, "utf-8");
  }

  const expiresAt = Date.now() + (result.expires_in || 2592000) * 1000;

  cachedToken = {
    token: result.access_token,
    expires_at: new Date(expiresAt).toISOString(),
    _expiresAt: expiresAt,
  };

  return {
    token: cachedToken.token,
    expires_at: cachedToken.expires_at,
  };
}
