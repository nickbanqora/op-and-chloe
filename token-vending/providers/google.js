import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

export const name = "google";
export const description = "Google OAuth2 access tokens via service account (1hr TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `google` section with service_account_file and default_scopes.
 */
export function check(config, secretsDir) {
  const g = config?.google;
  if (!g) return null;
  if (!g.service_account_file) return null;

  const saPath = path.join(secretsDir, g.service_account_file);
  if (!fs.existsSync(saPath)) return null;

  return {
    saPath,
    subject: g.subject || null,
    defaultScopes: g.default_scopes || [],
  };
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const raw = fs.readFileSync(providerConfig.saPath, "utf-8");
  const sa = JSON.parse(raw);

  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }

  return {
    clientEmail: sa.client_email,
    privateKey: sa.private_key,
    tokenUri: sa.token_uri || "https://oauth2.googleapis.com/token",
    subject: providerConfig.subject,
    defaultScopes: providerConfig.defaultScopes,
  };
}

let cachedToken = null;
let cachedScopes = null;

function createSignedJwt(state, scopes, subject) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: state.clientEmail,
    scope: scopes.join(" "),
    aud: state.tokenUri,
    iat: now,
    exp: now + 3600,
  };

  // Domain-wide delegation: impersonate a user
  if (subject) {
    payload.sub = subject;
  }

  return jwt.sign(payload, state.privateKey, { algorithm: "RS256" });
}

async function exchangeJwtForToken(tokenUri, signedJwt) {
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token endpoint ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Vend a short-lived access token.
 * options.scopes: override default scopes
 * options.subject: override default subject (impersonated user)
 */
export async function vend(state, options = {}) {
  const scopes = options.scopes || state.defaultScopes;
  const subject = options.subject || state.subject;
  const scopeKey = scopes.join(" ");

  // Return cached token if still valid (5 min buffer) and same scopes
  if (cachedToken && cachedScopes === scopeKey) {
    if (Date.now() < cachedToken.expires_at - 5 * 60 * 1000) {
      return cachedToken;
    }
  }

  if (scopes.length === 0) {
    throw new Error("No scopes specified — set default_scopes in config.yaml or pass scopes in the request");
  }

  const signedJwt = createSignedJwt(state, scopes, subject);
  const result = await exchangeJwtForToken(state.tokenUri, signedJwt);

  const token = {
    token: result.access_token,
    token_type: result.token_type,
    expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scopes,
  };

  cachedToken = token;
  cachedScopes = scopeKey;

  return token;
}
