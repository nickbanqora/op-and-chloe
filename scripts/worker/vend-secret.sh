#!/usr/local/bin/node
// SecretRef exec provider: fetches a token from the token-vending sidecar.
// Usage: vend-secret.sh <provider/type>
// Examples:
//   vend-secret.sh slack/bot    -> outputs the Slack bot token
//   vend-secret.sh slack/app    -> outputs the Slack app token
//   vend-secret.sh github       -> outputs a GitHub installation token
//   vend-secret.sh google       -> outputs a Google OAuth2 token

const http = require("node:http");
const refId = process.argv[2];
if (!refId) {
  process.stderr.write("usage: vend-secret.sh <provider/type>\n");
  process.exit(1);
}

const parts = refId.split("/");
const provider = parts[0];
const type = parts[1] || null;

const fs = require("node:fs");
const socketPath = "/var/run/token-vending/vending.sock";
const urlPath = `/token/${provider}`;

// Wait up to 15s for the socket to appear (token-vending may still be starting).
const deadline = Date.now() + 15000;
while (!fs.existsSync(socketPath) && Date.now() < deadline) {
  const { execSync } = require("node:child_process");
  execSync("sleep 1");
}
if (!fs.existsSync(socketPath)) {
  process.stderr.write("socket not found: " + socketPath + "\n");
  process.exit(1);
}

const options = { socketPath, path: urlPath, method: type ? "POST" : "GET" };

const req = http.request(options, (res) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => {
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (data.token) {
        // SecretRef exec contract: protocolVersion 1, values map keyed by ref id.
        process.stdout.write(JSON.stringify({ protocolVersion: 1, values: { token: data.token } }));
      } else {
        process.stderr.write(JSON.stringify(data) + "\n");
        process.exit(1);
      }
    } catch (e) {
      process.stderr.write("parse error: " + e.message + "\n");
      process.exit(1);
    }
  });
});

if (type) {
  req.setHeader("Content-Type", "application/json");
  req.write(JSON.stringify({ type }));
}

req.on("error", (e) => {
  process.stderr.write("socket error: " + e.message + "\n");
  process.exit(1);
});

req.end();
