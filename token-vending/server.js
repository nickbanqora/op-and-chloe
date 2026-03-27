import http from "node:http";
import fs from "node:fs";
import { vendGitHubToken } from "./providers/github.js";

const SOCKET_PATH = process.env.SOCKET_PATH || "/var/run/token-vending/vending.sock";

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method === "GET") return resolve({});
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function log(method, path, status, extra) {
  const entry = {
    ts: new Date().toISOString(),
    method,
    path,
    status,
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

async function main() {
  // --- Load config ---
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH || "/etc/token-vending/github-key.pem";

  if (!appId || !installationId) {
    console.error("GITHUB_APP_ID and GITHUB_APP_INSTALLATION_ID are required");
    process.exit(1);
  }

  // --- Read private key from mounted file ---
  let privateKey;
  try {
    privateKey = fs.readFileSync(keyPath, "utf-8");
  } catch (err) {
    console.error(`Failed to read private key from ${keyPath}: ${err.message}`);
    process.exit(1);
  }
  console.log("Private key loaded successfully");

  // --- HTTP server ---
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    try {
      // Health check
      if (path === "/health") {
        return json(res, 200, { status: "ok" });
      }

      // Vend a GitHub installation token
      if (path === "/token/github" && (req.method === "GET" || req.method === "POST")) {
        const body = await parseBody(req);

        const token = await vendGitHubToken(appId, installationId, privateKey, {
          repos: body.repos,
          permissions: body.permissions,
        });

        log(req.method, path, 200, {
          repos: body.repos || "all",
          permissions: body.permissions || "app-default",
          expires_at: token.expires_at,
        });

        return json(res, 200, {
          token: token.token,
          expires_at: token.expires_at,
          permissions: token.permissions,
          repositories: token.repositories?.map((r) => r.full_name),
        });
      }

      log(req.method, path, 404);
      return json(res, 404, { error: "not found" });
    } catch (err) {
      log(req.method, path, 500, { error: err.message });
      return json(res, 500, { error: err.message });
    }
  });

  // Clean up stale socket
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);

  // Ensure socket directory exists
  const socketDir = SOCKET_PATH.substring(0, SOCKET_PATH.lastIndexOf("/"));
  fs.mkdirSync(socketDir, { recursive: true });

  server.listen(SOCKET_PATH, () => {
    // rw for owner and group, nothing for others
    fs.chmodSync(SOCKET_PATH, 0o660);
    console.log(`Token vending service listening on ${SOCKET_PATH}`);
  });

  // Graceful shutdown
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      console.log(`Received ${sig}, shutting down`);
      server.close();
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
      process.exit(0);
    });
  }
}

main();
