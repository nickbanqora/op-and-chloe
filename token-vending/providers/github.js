import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

export const name = "github";
export const description = "GitHub App installation tokens (1hr TTL)";

/**
 * Check if this provider is configured. Returns config object or null.
 * Expects config.yaml to have a `github` section with app_id, installation_id, key_file.
 */
export function check(config, secretsDir) {
  const gh = config?.github;
  if (!gh) return null;
  if (!gh.app_id || !gh.installation_id || !gh.key_file) return null;

  const keyPath = path.join(secretsDir, gh.key_file);
  if (!fs.existsSync(keyPath)) return null;

  return { appId: String(gh.app_id), installationId: String(gh.installation_id), keyPath };
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const privateKey = fs.readFileSync(providerConfig.keyPath, "utf-8");
  return { privateKey, appId: providerConfig.appId, installationId: providerConfig.installationId };
}

let cachedToken = null;

function generateAppJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 10 * 60, iss: appId },
    privateKey,
    { algorithm: "RS256" }
  );
}

async function createInstallationToken(appJwt, installationId, body) {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Vend a short-lived token. options.repos and options.permissions allow down-scoping.
 */
export async function vend(state, options = {}) {
  if (cachedToken && !options.repos && !options.permissions) {
    const expiresAt = new Date(cachedToken.expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return cachedToken;
    }
  }

  const appJwt = generateAppJwt(state.appId, state.privateKey);

  const body = {};
  if (options.repos) body.repositories = options.repos;
  if (options.permissions) body.permissions = options.permissions;

  const result = await createInstallationToken(
    appJwt,
    state.installationId,
    Object.keys(body).length > 0 ? body : undefined
  );

  const token = {
    token: result.token,
    expires_at: result.expires_at,
    permissions: result.permissions,
    repositories: result.repositories?.map((r) => r.full_name),
  };

  if (!options.repos && !options.permissions) {
    cachedToken = token;
  }

  return token;
}
