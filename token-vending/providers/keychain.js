import fs from "node:fs";
import path from "node:path";

export const name = "keychain";
export const description = "Static secrets from files (API keys, etc.)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `keychain` section mapping key names to files.
 */
export function check(config, secretsDir) {
  const k = config?.keychain;
  if (!k || typeof k !== "object") return null;

  const resolved = {};
  for (const [name, file] of Object.entries(k)) {
    const filePath = path.join(secretsDir, file);
    if (!fs.existsSync(filePath)) continue;
    resolved[name] = filePath;
  }

  return Object.keys(resolved).length > 0 ? resolved : null;
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const keys = {};
  for (const [name, filePath] of Object.entries(providerConfig)) {
    keys[name] = fs.readFileSync(filePath, "utf-8").trim();
  }
  return { keys };
}

/**
 * Vend a secret. options.name selects which key.
 */
export function vend(state, options = {}) {
  const name = options.name;
  if (!name) {
    return { keys: Object.keys(state.keys) };
  }
  const value = state.keys[name];
  if (!value) {
    throw new Error(`Key "${name}" not configured. Available: ${Object.keys(state.keys).join(", ")}`);
  }
  return { token: value, type: "static" };
}
