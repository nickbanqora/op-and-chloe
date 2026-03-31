import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "./config.js";

const SOCKET_PATH = process.env.SOCKET_PATH || "/var/run/token-vending/vending.sock";
const SECRETS_DIR = process.env.SECRETS_DIR || "/etc/token-vending";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const entry = { ts: new Date().toISOString(), method, path, status, ...extra };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

/**
 * Load config.yaml from secrets dir, then discover and initialise providers.
 */
async function discoverProviders(config) {
  const providersDir = path.join(__dirname, "providers");
  const files = fs.readdirSync(providersDir).filter((f) => f.endsWith(".js"));
  const providers = new Map();

  for (const file of files) {
    const mod = await import(path.join(providersDir, file));

    if (!mod.name || !mod.check || !mod.init || !mod.vend) {
      console.warn(`Skipping ${file}: missing required exports (name, check, init, vend)`);
      continue;
    }

    const providerConfig = mod.check(config, SECRETS_DIR);
    if (!providerConfig) {
      console.log(`Provider ${mod.name}: not configured, skipping`);
      continue;
    }

    try {
      const state = await mod.init(providerConfig);
      providers.set(mod.name, { mod, state, description: mod.description });
      console.log(`Provider ${mod.name}: enabled`);
    } catch (err) {
      console.error(`Provider ${mod.name}: init failed - ${err.message}`);
    }
  }

  return providers;
}

async function main() {
  const configPath = path.join(SECRETS_DIR, "config.yaml");
  const config = parseConfig(configPath);
  const providers = await discoverProviders(config);

  if (providers.size === 0) {
    console.error("No providers configured. Add provider config to " + configPath + " and place secret files in " + SECRETS_DIR);
    console.error("The service will start and serve /health but no /token/* routes.");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    try {
      if (pathname === "/health") {
        const providerStatus = {};
        for (const [name, { description }] of providers) {
          providerStatus[name] = description;
        }
        return json(res, 200, { status: "ok", providers: providerStatus });
      }

      const match = pathname.match(/^\/token\/([a-z0-9_-]+)$/);
      if (match && (req.method === "GET" || req.method === "POST")) {
        const providerName = match[1];
        const provider = providers.get(providerName);

        if (!provider) {
          log(req.method, pathname, 404, { error: "provider not configured" });
          return json(res, 404, {
            error: `provider "${providerName}" is not configured`,
            configured: [...providers.keys()],
          });
        }

        const body = await parseBody(req);
        const result = await provider.mod.vend(provider.state, body);

        log(req.method, pathname, 200, { provider: providerName });
        return json(res, 200, result);
      }

      log(req.method, pathname, 404);
      return json(res, 404, { error: "not found", routes: ["/health", "/token/:provider"] });
    } catch (err) {
      log(req.method, pathname, 500, { error: err.message });
      return json(res, 500, { error: err.message });
    }
  });

  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  const socketDir = SOCKET_PATH.substring(0, SOCKET_PATH.lastIndexOf("/"));
  fs.mkdirSync(socketDir, { recursive: true });

  server.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o666);
    console.log(`Token vending service listening on ${SOCKET_PATH}`);
  });

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
