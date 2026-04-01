import fs from "node:fs";
import path from "node:path";

export const name = "linear";
export const description = "Linear API tokens via OAuth2 client credentials (30-day TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `linear` section with client_id and client_secret_file.
 */
export function check(config, secretsDir) {
  const l = config?.linear;
  if (!l) return null;
  if (!l.client_id || !l.client_secret_file) return null;

  const secretPath = path.join(secretsDir, l.client_secret_file);
  if (!fs.existsSync(secretPath)) return null;

  return {
    clientId: l.client_id,
    secretPath,
    actor: l.actor || "application",
  };
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const clientSecret = fs.readFileSync(providerConfig.secretPath, "utf-8").trim();
  if (!clientSecret) {
    throw new Error("Client secret file is empty");
  }

  return {
    clientId: providerConfig.clientId,
    clientSecret,
    actor: providerConfig.actor,
  };
}

let cachedToken = null;

/**
 * Vend an access token via client credentials grant.
 */
export async function vend(state) {
  // Return cached token if still valid (1 hour buffer on 30-day token)
  if (cachedToken && Date.now() < cachedToken._expiresAt - 60 * 60 * 1000) {
    return {
      token: cachedToken.token,
      expires_at: cachedToken.expires_at,
    };
  }

  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: state.clientId,
      client_secret: state.clientSecret,
      actor: state.actor,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear token endpoint ${res.status}: ${text}`);
  }

  const result = await res.json();
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
