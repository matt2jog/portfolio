import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { InfisicalSDK } from "@infisical/sdk";

const SERVICE_PREFIXES = [
  "PORTFOLIO",
  "ADMIN_DASHBOARD",
  "AUTO_JOBS",
  "RESUME_VCS_CLOUD",
] as const;

let loaded = false;

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

function normalizeToken(token: string): string {
  if (token.startsWith("st.") && token.split(".").length >= 4) {
    return token.split(".").slice(0, 3).join(".");
  }
  return token;
}

function resolveTargetKeys(secretKey: string, servicePrefix: string): string[] {
  for (const prefix of SERVICE_PREFIXES) {
    if (secretKey.startsWith(`${prefix}_`)) {
      return prefix === servicePrefix
        ? [secretKey, secretKey.slice(prefix.length + 1)]
        : [secretKey];
    }
  }
  return [secretKey];
}

export async function ensureRuntimeEnv(servicePrefix: (typeof SERVICE_PREFIXES)[number]) {
  if (loaded) return;

  loadLocalEnv();

  const token = process.env.INFISICAL_TOKEN;
  const projectId = process.env.INFISICAL_PROJECT_ID;
  if (!token || !projectId) {
    loaded = true;
    return;
  }

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || "https://app.infisical.com",
  });

  client.auth().accessToken(normalizeToken(token));

  const response = await client.secrets().listSecrets({
    projectId,
    environment: process.env.INFISICAL_ENV || "prod",
    secretPath: process.env.INFISICAL_SECRET_PATH || "/",
    includeImports: true,
    viewSecretValue: true,
    expandSecretReferences: true,
    recursive: false,
  });

  for (const secret of response.secrets) {
    for (const targetKey of resolveTargetKeys(secret.secretKey, servicePrefix)) {
      if (process.env[targetKey]) continue;
      process.env[targetKey] = secret.secretValue;
    }
  }

  loaded = true;
}
