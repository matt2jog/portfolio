import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";

const DATA_MIGRATION_KEYS = [
  "LEGACY_PORTFOLIO_DATABASE_URL",
  "LEGACY_PORTFOLIO_SUPABASE_CA_CERT",
  "LEGACY_PORTFOLIO_SUPABASE_CA_SHA256",
  "LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF",
  "SOURCE_FENCE_DATABASE_URL",
  "TARGET_PORTFOLIO_DATABASE_URL",
  "TARGET_PORTFOLIO_SUPABASE_CA_CERT",
  "TARGET_PORTFOLIO_SUPABASE_CA_SHA256",
  "TARGET_PORTFOLIO_SUPABASE_PROJECT_REF",
] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioDataMigrationBundle {
  LEGACY_PORTFOLIO_DATABASE_URL: string;
  LEGACY_PORTFOLIO_SUPABASE_CA_CERT: string;
  LEGACY_PORTFOLIO_SUPABASE_CA_SHA256: string;
  LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF: string;
  SOURCE_FENCE_DATABASE_URL: string;
  TARGET_PORTFOLIO_DATABASE_URL: string;
  TARGET_PORTFOLIO_SUPABASE_CA_CERT: string;
  TARGET_PORTFOLIO_SUPABASE_CA_SHA256: string;
  TARGET_PORTFOLIO_SUPABASE_PROJECT_REF: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !(key in value));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`Portfolio data-migration bundle ${subject} does not match its schema`);
  }
}

export function parseDataMigrationBundle(raw: string): PortfolioDataMigrationBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Portfolio data-migration bundle is not valid JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("Portfolio data-migration bundle must be a JSON object");
  }
  assertExactKeys(parsed, ["_meta", ...DATA_MIGRATION_KEYS], "root");
  if (!isRecord(parsed._meta)) {
    throw new Error("Portfolio data-migration bundle metadata is invalid");
  }
  assertExactKeys(parsed._meta, METADATA_KEYS, "metadata");
  if (
    parsed._meta.schema_version !== 1
    || parsed._meta.service !== "portfolio"
    || parsed._meta.environment !== "prod"
    || parsed._meta.boundary !== "data_migration"
  ) {
    throw new Error("Portfolio data-migration bundle metadata is invalid");
  }
  for (const key of DATA_MIGRATION_KEYS) {
    if (typeof parsed[key] !== "string" || parsed[key].length === 0) {
      throw new Error(`Portfolio data-migration bundle is missing required key: ${key}`);
    }
  }

  const bundle = parsed as unknown as PortfolioDataMigrationBundle;
  if (bundle.LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF !== bundle.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF) {
    throw new Error("Portfolio data migration requires one shared Supabase project with database-enforced role and schema isolation");
  }
  if (bundle.LEGACY_PORTFOLIO_SUPABASE_CA_CERT !== bundle.TARGET_PORTFOLIO_SUPABASE_CA_CERT) {
    throw new Error("Portfolio data migration requires the same pinned certificate for both roles in the shared Supabase project");
  }
  if (bundle.LEGACY_PORTFOLIO_SUPABASE_CA_SHA256 !== bundle.TARGET_PORTFOLIO_SUPABASE_CA_SHA256) {
    throw new Error("Portfolio data migration requires the same pinned CA fingerprint for every shared-project connection");
  }
  try {
    productionSupabaseConnectionConfig({
      databaseUrl: bundle.LEGACY_PORTFOLIO_DATABASE_URL,
      projectRef: bundle.LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF,
      supabaseCaCert: bundle.LEGACY_PORTFOLIO_SUPABASE_CA_CERT,
      expectedCaSha256: bundle.LEGACY_PORTFOLIO_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_legacy_reader_login",
      capabilityRole: "portfolio_legacy_reader",
      searchPath: "public",
    });
    productionSupabaseConnectionConfig({
      databaseUrl: bundle.TARGET_PORTFOLIO_DATABASE_URL,
      projectRef: bundle.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF,
      supabaseCaCert: bundle.TARGET_PORTFOLIO_SUPABASE_CA_CERT,
      expectedCaSha256: bundle.TARGET_PORTFOLIO_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_migrator_login",
      capabilityRole: "portfolio_migrator",
      searchPath: "portfolio, extensions",
    });
    productionSupabaseConnectionConfig({
      databaseUrl: bundle.SOURCE_FENCE_DATABASE_URL,
      projectRef: bundle.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF,
      supabaseCaCert: bundle.TARGET_PORTFOLIO_SUPABASE_CA_CERT,
      expectedCaSha256: bundle.TARGET_PORTFOLIO_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_fence_login",
      capabilityRole: "portfolio_fence_operator",
      searchPath: "portfolio, extensions",
    });
  } catch (error) {
    throw new Error(
      "Portfolio data-migration bundle must identify the scoped source reader and target migrator with CA-backed verify-full TLS",
      { cause: error },
    );
  }
  return {
    LEGACY_PORTFOLIO_DATABASE_URL: bundle.LEGACY_PORTFOLIO_DATABASE_URL,
    LEGACY_PORTFOLIO_SUPABASE_CA_CERT: bundle.LEGACY_PORTFOLIO_SUPABASE_CA_CERT,
    LEGACY_PORTFOLIO_SUPABASE_CA_SHA256: bundle.LEGACY_PORTFOLIO_SUPABASE_CA_SHA256,
    LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF: bundle.LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF,
    SOURCE_FENCE_DATABASE_URL: bundle.SOURCE_FENCE_DATABASE_URL,
    TARGET_PORTFOLIO_DATABASE_URL: bundle.TARGET_PORTFOLIO_DATABASE_URL,
    TARGET_PORTFOLIO_SUPABASE_CA_CERT: bundle.TARGET_PORTFOLIO_SUPABASE_CA_CERT,
    TARGET_PORTFOLIO_SUPABASE_CA_SHA256: bundle.TARGET_PORTFOLIO_SUPABASE_CA_SHA256,
    TARGET_PORTFOLIO_SUPABASE_PROJECT_REF: bundle.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF,
  };
}
