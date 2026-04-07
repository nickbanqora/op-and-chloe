import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const name = "aws";
export const description = "AWS STS temporary credentials via AssumeRole (1hr TTL)";

/**
 * Check if this provider is configured.
 * Expects config.yaml to have an `aws` section with role_arn and credential files.
 */
export function check(config, secretsDir) {
  const aws = config?.aws;
  if (!aws) return null;
  if (!aws.role_arn) return null;
  if (!aws.access_key_id_file || !aws.secret_access_key_file) return null;

  const keyIdPath = path.join(secretsDir, aws.access_key_id_file);
  const secretPath = path.join(secretsDir, aws.secret_access_key_file);
  if (!fs.existsSync(keyIdPath) || !fs.existsSync(secretPath)) return null;

  return {
    keyIdPath,
    secretPath,
    roleArn: aws.role_arn,
    region: aws.region || "eu-west-2",
    sessionDuration: aws.session_duration || 3600,
    sessionName: aws.session_name || "openclaw-agent",
  };
}

/**
 * Initialise provider state (called once at startup).
 */
export function init(providerConfig) {
  const accessKeyId = fs.readFileSync(providerConfig.keyIdPath, "utf-8").trim();
  const secretAccessKey = fs.readFileSync(providerConfig.secretPath, "utf-8").trim();

  return {
    accessKeyId,
    secretAccessKey,
    roleArn: providerConfig.roleArn,
    region: providerConfig.region,
    sessionDuration: providerConfig.sessionDuration,
    sessionName: providerConfig.sessionName,
  };
}

function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  let key = sign(`AWS4${secretKey}`, dateStamp);
  key = sign(key, region);
  key = sign(key, service);
  key = sign(key, "aws4_request");
  return key;
}

/**
 * Make a Sigv4-signed request to AWS STS without any SDK dependency.
 */
async function stsAssumeRole(state, options = {}) {
  const host = `sts.${state.region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const params = new URLSearchParams({
    Action: "AssumeRole",
    Version: "2011-06-15",
    RoleArn: options.role_arn || state.roleArn,
    RoleSessionName: options.session_name || state.sessionName,
    DurationSeconds: String(options.duration || state.sessionDuration),
  });
  if (options.policy) {
    params.set("Policy", JSON.stringify(options.policy));
  }

  const body = params.toString();
  const payloadHash = sha256(body);

  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${state.region}/sts/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;

  const signingKey = getSignatureKey(state.secretAccessKey, dateStamp, state.region, "sts");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${state.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Host: host,
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STS AssumeRole ${res.status}: ${text}`);
  }

  return res.text();
}

function parseXml(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return match ? match[1] : null;
}

let cachedToken = null;

/**
 * Vend short-lived AWS credentials.
 * options.role_arn: override default role
 * options.session_name: override session name
 * options.duration: override duration (seconds)
 * options.policy: inline session policy for down-scoping
 */
export async function vend(state, options = {}) {
  const isScoped = options.role_arn || options.policy;

  if (cachedToken && !isScoped) {
    const expiresAt = new Date(cachedToken.expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return cachedToken;
    }
  }

  const xml = await stsAssumeRole(state, options);

  const token = {
    access_key_id: parseXml(xml, "AccessKeyId"),
    secret_access_key: parseXml(xml, "SecretAccessKey"),
    session_token: parseXml(xml, "SessionToken"),
    expires_at: parseXml(xml, "Expiration"),
    role_arn: options.role_arn || state.roleArn,
  };

  if (!token.access_key_id) {
    throw new Error(`STS response missing credentials: ${xml.slice(0, 500)}`);
  }

  if (!isScoped) {
    cachedToken = token;
  }

  return token;
}
