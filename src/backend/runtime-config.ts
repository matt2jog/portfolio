import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const RUNTIME_KEYS = [
  "ADMIN_AUTHORITY_URL",
  "ADMIN_IDENTITY_AUDIENCE",
  "ADMIN_IDENTITY_ISSUER",
  "ADMIN_IDENTITY_JWKS_URL",
  "DATABASE_URL",
  "EDGE_ORIGIN_TOKEN",
  "FIREWORKS_AI_TOKEN",
  "GRADIENT_AI_TOKEN",
  "SUPABASE_CA_CERT",
] as const;
const OPTIONAL_RUNTIME_KEYS = ["EDGE_ORIGIN_PREVIOUS_TOKEN"] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;
const ADMIN_AUTHORITY = "https://admin.2jog.dev";
const ADMIN_AUDIENCE = "2jog-services";
const ADMIN_JWKS_URL = `${ADMIN_AUTHORITY}/.well-known/jwks.json`;

interface RuntimeBundleMetadata {
  schema_version: number;
  service: string;
  environment: string;
  boundary: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBundle(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error("Portfolio runtime bundle must be a JSON object");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "Portfolio runtime bundle must be a JSON object") {
      throw error;
    }
    throw new Error("Portfolio runtime bundle is not valid JSON");
  }
}

function validateMetadata(value: unknown): asserts value is RuntimeBundleMetadata {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== METADATA_KEYS.length ||
    METADATA_KEYS.some((key) => !(key in value)) ||
    value.schema_version !== 1 ||
    value.service !== "portfolio" ||
    value.environment !== "prod" ||
    value.boundary !== "runtime"
  ) {
    throw new Error("Portfolio runtime bundle metadata is invalid");
  }
}

function isPostgresUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isPemCertificate(value: string): boolean {
  return /^-----BEGIN CERTIFICATE-----\r?\n[\s\S]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(value);
}

export function applyRuntimeBundle(raw: string, target: NodeJS.ProcessEnv = process.env): void {
  const bundle = parseBundle(raw);
  validateMetadata(bundle._meta);

  const allowed = new Set<string>(["_meta", ...RUNTIME_KEYS, ...OPTIONAL_RUNTIME_KEYS]);
  const unexpected = Object.keys(bundle).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`Portfolio runtime bundle contains unexpected key(s): ${unexpected.join(", ")}`);
  }

  for (const key of RUNTIME_KEYS) {
    const value = bundle[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Portfolio runtime bundle is missing required key: ${key}`);
    }
    target[key] = value;
  }

  const previousEdgeToken = bundle.EDGE_ORIGIN_PREVIOUS_TOKEN;
  if (previousEdgeToken === undefined) {
    delete target.EDGE_ORIGIN_PREVIOUS_TOKEN;
  } else if (typeof previousEdgeToken === "string" && previousEdgeToken.length > 0) {
    target.EDGE_ORIGIN_PREVIOUS_TOKEN = previousEdgeToken;
  } else {
    throw new Error("Portfolio runtime bundle EDGE_ORIGIN_PREVIOUS_TOKEN must be a non-empty string when provided");
  }

  if (!/^[A-Za-z0-9_-]{32,256}$/.test(target.EDGE_ORIGIN_TOKEN ?? "")) {
    throw new Error("Portfolio runtime bundle EDGE_ORIGIN_TOKEN must be a 32-256 character URL-safe token");
  }
  if (
    target.EDGE_ORIGIN_PREVIOUS_TOKEN !== undefined
    && !/^[A-Za-z0-9_-]{32,256}$/.test(target.EDGE_ORIGIN_PREVIOUS_TOKEN)
  ) {
    throw new Error("Portfolio runtime bundle EDGE_ORIGIN_PREVIOUS_TOKEN must be a 32-256 character URL-safe token");
  }
  if (target.ADMIN_AUTHORITY_URL !== ADMIN_AUTHORITY) {
    throw new Error(`Portfolio runtime bundle ADMIN_AUTHORITY_URL must match the shared authority`);
  }
  if (target.ADMIN_IDENTITY_ISSUER !== ADMIN_AUTHORITY) {
    throw new Error(`Portfolio runtime bundle ADMIN_IDENTITY_ISSUER must match the shared issuer`);
  }
  if (target.ADMIN_IDENTITY_AUDIENCE !== ADMIN_AUDIENCE) {
    throw new Error(`Portfolio runtime bundle ADMIN_IDENTITY_AUDIENCE must match the shared audience`);
  }
  if (target.ADMIN_IDENTITY_JWKS_URL !== ADMIN_JWKS_URL) {
    throw new Error(`Portfolio runtime bundle ADMIN_IDENTITY_JWKS_URL must match the shared JWKS endpoint`);
  }
  if (!isPostgresUri(target.DATABASE_URL ?? "")) {
    throw new Error("Portfolio runtime bundle DATABASE_URL must be a PostgreSQL URI");
  }
  if (!isPemCertificate(target.SUPABASE_CA_CERT ?? "")) {
    throw new Error("Portfolio runtime bundle SUPABASE_CA_CERT must be a PEM certificate");
  }
}

export function loadRuntimeEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  const runtimeBundle = target.PORTFOLIO_RUNTIME_BUNDLE;
  if (runtimeBundle) {
    applyRuntimeBundle(runtimeBundle, target);
    return;
  }

  if (target.NODE_ENV === "production") {
    throw new Error("PORTFOLIO_RUNTIME_BUNDLE is required in production");
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (target === process.env && fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}
