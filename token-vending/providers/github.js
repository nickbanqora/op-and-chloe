import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

export const name = "github";
export const description = "GitHub App installation tokens (1hr TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `github` section with client_id and key_file.
 * installation_id is optional — discovered automatically if omitted.
 */
export function check(config, secretsDir) {
  const gh = config?.github;
  if (!gh) return null;
  if (!gh.client_id || !gh.key_file) return null;

  const keyPath = path.join(secretsDir, gh.key_file);
  if (!fs.existsSync(keyPath)) return null;

  return {
    clientId: String(gh.client_id),
    installationId: gh.installation_id ? String(gh.installation_id) : null,
    keyPath,
  };
}

function generateAppJwt(clientId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 10 * 60, iss: clientId },
    privateKey,
    { algorithm: "RS256" }
  );
}

async function discoverInstallationId(appJwt) {
  const res = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list installations: ${res.status}: ${text}`);
  }
  const installations = await res.json();
  if (installations.length === 0) {
    throw new Error("GitHub App has no installations — install it on your org/repos first");
  }
  if (installations.length > 1) {
    const ids = installations.map((i) => `${i.id} (${i.account?.login})`).join(", ");
    console.warn(`Multiple installations found: ${ids} — using first. Set installation_id in config.yaml to choose.`);
  }
  return String(installations[0].id);
}

/**
 * Initialise provider state (called once at startup).
 */
export async function init(providerConfig) {
  const privateKey = fs.readFileSync(providerConfig.keyPath, "utf-8");
  const clientId = providerConfig.clientId;

  let installationId = providerConfig.installationId;
  if (!installationId) {
    const appJwt = generateAppJwt(clientId, privateKey);
    installationId = await discoverInstallationId(appJwt);
    console.log(`GitHub: auto-discovered installation ID: ${installationId}`);
  }

  return { privateKey, clientId, installationId };
}

let cachedToken = null;

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

  const appJwt = generateAppJwt(state.clientId, state.privateKey);

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
