import jwt from "jsonwebtoken";

let cachedToken = null;

function generateAppJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60, // clock drift allowance
      exp: now + 10 * 60, // 10 minute max for app JWTs
      iss: appId,
    },
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

export async function vendGitHubToken(appId, installationId, privateKey, options = {}) {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && !options.repos && !options.permissions) {
    const expiresAt = new Date(cachedToken.expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return cachedToken;
    }
  }

  const appJwt = generateAppJwt(appId, privateKey);

  // Optional down-scoping: caller can request fewer repos/permissions
  // than the App installation has. GitHub will reject if you ask for MORE.
  const body = {};
  if (options.repos) body.repositories = options.repos;
  if (options.permissions) body.permissions = options.permissions;

  const token = await createInstallationToken(
    appJwt,
    installationId,
    Object.keys(body).length > 0 ? body : undefined
  );

  // Only cache un-scoped tokens (scoped ones may vary per request)
  if (!options.repos && !options.permissions) {
    cachedToken = token;
  }

  return token;
}
