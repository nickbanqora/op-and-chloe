import fs from "node:fs";
import path from "node:path";

export const name = "slack";
export const description = "Slack bot and app tokens from secure storage";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have a `slack` section with bot_token_file and app_token_file.
 */
export function check(config, secretsDir) {
  const s = config?.slack;
  if (!s) return null;
  if (!s.bot_token_file) return null;

  const botPath = path.join(secretsDir, s.bot_token_file);
  if (!fs.existsSync(botPath)) return null;

  const appPath = s.app_token_file
    ? path.join(secretsDir, s.app_token_file)
    : null;
  if (appPath && !fs.existsSync(appPath)) return null;

  return { botPath, appPath };
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const botToken = fs.readFileSync(providerConfig.botPath, "utf-8").trim();
  if (!botToken) {
    throw new Error("Bot token file is empty");
  }

  const appToken = providerConfig.appPath
    ? fs.readFileSync(providerConfig.appPath, "utf-8").trim()
    : null;

  return { botToken, appToken };
}

/**
 * Vend a token. options.type selects which token: "bot" (default) or "app".
 */
export function vend(state, options = {}) {
  const type = options.type || "bot";

  if (type === "app") {
    if (!state.appToken) {
      throw new Error("App token not configured");
    }
    return { token: state.appToken, type: "app" };
  }

  return { token: state.botToken, type: "bot" };
}
