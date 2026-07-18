import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { productionSupabaseConnectionConfig } from "../shared/postgres-tls";

const RUNTIME_KEYS = [
  "ADMIN_AUTHORITY_URL",
  "ADMIN_IDENTITY_AUDIENCE",
  "ADMIN_IDENTITY_ISSUER",
  "ADMIN_IDENTITY_JWKS_URL",
  "CAREER_PUBSUB_PUSH_AUDIENCE",
  "CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT",
  "CAREER_PUBSUB_SUBSCRIPTION",
  "DATABASE_URL",
  "EDGE_ORIGIN_TOKEN",
  "FIREWORKS_AI_TOKEN",
  "GRADIENT_AI_TOKEN",
  "SUPABASE_CA_CERT",
  "SUPABASE_CA_SHA256",
  "SUPABASE_PROJECT_REF",
] as const;
const OPTIONAL_RUNTIME_KEYS = ["EDGE_ORIGIN_PREVIOUS_TOKEN"] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;
const ADMIN_AUTHORITY = "https://admin.2jog.dev";
const ADMIN_AUDIENCE = "2jog-services";
const ADMIN_JWKS_URL = `${ADMIN_AUTHORITY}/.well-known/jwks.json`;
const PUBSUB_SERVICE_ACCOUNT = /^[a-z0-9][a-z0-9-]{2,62}@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const PUBSUB_SUBSCRIPTION = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/subscriptions\/[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/;

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
  let pushAudience: URL;
  try {
    pushAudience = new URL(target.CAREER_PUBSUB_PUSH_AUDIENCE ?? "");
  } catch {
    throw new Error("Portfolio runtime bundle CAREER_PUBSUB_PUSH_AUDIENCE must be an absolute HTTPS URL");
  }
  if (
    pushAudience.protocol !== "https:"
    || pushAudience.username
    || pushAudience.password
    || pushAudience.search
    || pushAudience.hash
    || pushAudience.pathname !== "/internal/pubsub/career"
  ) {
    throw new Error("Portfolio runtime bundle CAREER_PUBSUB_PUSH_AUDIENCE must be the exact HTTPS career push endpoint");
  }
  if (!PUBSUB_SERVICE_ACCOUNT.test(target.CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT ?? "")) {
    throw new Error("Portfolio runtime bundle CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT must be an exact Google service-account email");
  }
  if (!PUBSUB_SUBSCRIPTION.test(target.CAREER_PUBSUB_SUBSCRIPTION ?? "")) {
    throw new Error("Portfolio runtime bundle CAREER_PUBSUB_SUBSCRIPTION must be an exact Pub/Sub subscription resource");
  }
  try {
    productionSupabaseConnectionConfig({
      databaseUrl: target.DATABASE_URL ?? "",
      projectRef: target.SUPABASE_PROJECT_REF ?? "",
      supabaseCaCert: target.SUPABASE_CA_CERT,
      expectedCaSha256: target.SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
      capabilityRole: "portfolio_runtime",
      searchPath: "portfolio, extensions",
    });
  } catch (error) {
    throw new Error(
      "Portfolio runtime bundle DATABASE_URL, SUPABASE_PROJECT_REF, SUPABASE_CA_CERT, and SUPABASE_CA_SHA256 must identify the scoped Supabase runtime role with CA-backed verify-full TLS",
      { cause: error },
    );
  }
}

export function loadRuntimeEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  const runtimeBundle = target.PORTFOLIO_RUNTIME_BUNDLE;
  if (runtimeBundle) {
    delete target.PORTFOLIO_RUNTIME_BUNDLE;
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
