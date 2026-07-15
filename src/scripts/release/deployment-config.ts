import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";

const DEPLOYMENT_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "EDGE_ORIGIN_TOKEN",
  "MIGRATION_DATABASE_URL",
  "SUPABASE_CA_CERT",
  "SUPABASE_PROJECT_REF",
] as const;
const OPTIONAL_DEPLOYMENT_KEYS = ["EDGE_ORIGIN_PREVIOUS_TOKEN"] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioDeploymentBundle {
  CLOUDFLARE_API_TOKEN: string;
  EDGE_ORIGIN_TOKEN: string;
  EDGE_ORIGIN_PREVIOUS_TOKEN?: string;
  MIGRATION_DATABASE_URL: string;
  SUPABASE_CA_CERT: string;
  SUPABASE_PROJECT_REF: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...expected, ...optional]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = expected.filter((key) => !(key in value));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`Portfolio deployment bundle ${subject} does not match its schema`);
  }
}

export function parseDeploymentBundle(raw: string): PortfolioDeploymentBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Portfolio deployment bundle is not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("Portfolio deployment bundle must be a JSON object");
  }
  assertExactKeys(parsed, ["_meta", ...DEPLOYMENT_KEYS], "root", OPTIONAL_DEPLOYMENT_KEYS);

  if (!isRecord(parsed._meta)) {
    throw new Error("Portfolio deployment bundle metadata is invalid");
  }
  assertExactKeys(parsed._meta, METADATA_KEYS, "metadata");
  if (
    parsed._meta.schema_version !== 1 ||
    parsed._meta.service !== "portfolio" ||
    parsed._meta.environment !== "prod" ||
    parsed._meta.boundary !== "deployment"
  ) {
    throw new Error("Portfolio deployment bundle metadata is invalid");
  }

  for (const key of DEPLOYMENT_KEYS) {
    if (typeof parsed[key] !== "string" || parsed[key].length === 0) {
      throw new Error(`Portfolio deployment bundle is missing required key: ${key}`);
    }
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(parsed.EDGE_ORIGIN_TOKEN as string)) {
    throw new Error("Portfolio deployment bundle EDGE_ORIGIN_TOKEN must be a 32-256 character URL-safe token");
  }
  if (
    parsed.EDGE_ORIGIN_PREVIOUS_TOKEN !== undefined
    && (
      typeof parsed.EDGE_ORIGIN_PREVIOUS_TOKEN !== "string"
      || !/^[A-Za-z0-9_-]{32,256}$/.test(parsed.EDGE_ORIGIN_PREVIOUS_TOKEN)
    )
  ) {
    throw new Error("Portfolio deployment bundle EDGE_ORIGIN_PREVIOUS_TOKEN must be a 32-256 character URL-safe token when provided");
  }
  if ((parsed.CLOUDFLARE_API_TOKEN as string).length < 20) {
    throw new Error("Portfolio deployment bundle CLOUDFLARE_API_TOKEN must be at least 20 characters");
  }
  try {
    productionSupabaseConnectionConfig({
      databaseUrl: parsed.MIGRATION_DATABASE_URL as string,
      projectRef: parsed.SUPABASE_PROJECT_REF as string,
      supabaseCaCert: parsed.SUPABASE_CA_CERT as string,
    });
  } catch (error) {
    throw new Error(
      "Portfolio deployment bundle MIGRATION_DATABASE_URL, SUPABASE_PROJECT_REF, and SUPABASE_CA_CERT must identify the configured Supabase migration boundary with CA-backed verify-full TLS",
      { cause: error },
    );
  }

  return {
    CLOUDFLARE_API_TOKEN: parsed.CLOUDFLARE_API_TOKEN as string,
    EDGE_ORIGIN_TOKEN: parsed.EDGE_ORIGIN_TOKEN as string,
    EDGE_ORIGIN_PREVIOUS_TOKEN: parsed.EDGE_ORIGIN_PREVIOUS_TOKEN as string | undefined,
    MIGRATION_DATABASE_URL: parsed.MIGRATION_DATABASE_URL as string,
    SUPABASE_CA_CERT: parsed.SUPABASE_CA_CERT as string,
    SUPABASE_PROJECT_REF: parsed.SUPABASE_PROJECT_REF as string,
  };
}
