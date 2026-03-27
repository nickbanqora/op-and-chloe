import fs from "node:fs";
import yaml from "js-yaml";

/**
 * Parse config.yaml from the given path. Returns an empty object if the file
 * doesn't exist (service starts with zero providers — useful for first deploy
 * before any secrets are placed).
 */
export function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.warn(`Config file not found: ${configPath} — no providers will be enabled`);
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw);

  if (!parsed || typeof parsed !== "object") {
    console.warn(`Config file is empty or invalid: ${configPath}`);
    return {};
  }

  return parsed;
}
