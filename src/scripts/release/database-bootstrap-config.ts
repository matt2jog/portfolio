import { productionSupabaseConnectionConfig, type PortfolioSearchPath } from "../../shared/postgres-tls";

const DATABASE_BOOTSTRAP_KEYS = [
  "DATABASE_ADMIN_URL",
  "RUNTIME_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "LEGAL_AUDIT_DATABASE_URL",
  "LEGACY_READER_DATABASE_URL",
  "SOURCE_FENCE_DATABASE_URL",
  "SUPABASE_CA_CERT",
  "SUPABASE_CA_SHA256",
  "SUPABASE_PROJECT_REF",
] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioDatabaseBootstrapBundle {
  DATABASE_ADMIN_URL: string;
  RUNTIME_DATABASE_URL: string;
  MIGRATION_DATABASE_URL: string;
  LEGAL_AUDIT_DATABASE_URL: string;
  LEGACY_READER_DATABASE_URL: string;
  SOURCE_FENCE_DATABASE_URL: string;
  SUPABASE_CA_CERT: string;
  SUPABASE_CA_SHA256: string;
  SUPABASE_PROJECT_REF: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], subject: string): void {
  const unexpected = Object.keys(value).filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !(key in value));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`Portfolio database-bootstrap bundle ${subject} does not match its schema`);
  }
}

function assertConnection(
  bundle: PortfolioDatabaseBootstrapBundle,
  databaseUrl: string,
  expectedRole: string,
  searchPath: PortfolioSearchPath,
  capabilityRole?: string,
): void {
  productionSupabaseConnectionConfig({
    databaseUrl,
    projectRef: bundle.SUPABASE_PROJECT_REF,
    supabaseCaCert: bundle.SUPABASE_CA_CERT,
    expectedCaSha256: bundle.SUPABASE_CA_SHA256,
    expectedRole,
    capabilityRole,
    searchPath,
  });
}

export function parseDatabaseBootstrapBundle(raw: string): PortfolioDatabaseBootstrapBundle {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Portfolio database-bootstrap bundle is not valid JSON");
  }
  if (!isRecord(value)) throw new Error("Portfolio database-bootstrap bundle must be a JSON object");
  assertExactKeys(value, ["_meta", ...DATABASE_BOOTSTRAP_KEYS], "root");
  if (!isRecord(value._meta)) throw new Error("Portfolio database-bootstrap bundle metadata is invalid");
  assertExactKeys(value._meta, METADATA_KEYS, "metadata");
  if (
    value._meta.schema_version !== 1
    || value._meta.service !== "portfolio"
    || value._meta.environment !== "prod"
    || value._meta.boundary !== "database_bootstrap"
  ) {
    throw new Error("Portfolio database-bootstrap bundle metadata is invalid");
  }
  for (const key of DATABASE_BOOTSTRAP_KEYS) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      throw new Error(`Portfolio database-bootstrap bundle is missing required key: ${key}`);
    }
  }

  const bundle = value as unknown as PortfolioDatabaseBootstrapBundle;
  try {
    assertConnection(bundle, bundle.DATABASE_ADMIN_URL, "postgres", "portfolio, extensions");
    assertConnection(bundle, bundle.RUNTIME_DATABASE_URL, "portfolio_runtime_login", "portfolio, extensions", "portfolio_runtime");
    assertConnection(bundle, bundle.MIGRATION_DATABASE_URL, "portfolio_migrator_login", "portfolio, extensions", "portfolio_migrator");
    assertConnection(bundle, bundle.LEGAL_AUDIT_DATABASE_URL, "portfolio_legal_login", "portfolio, extensions", "legal_audit_writer");
    assertConnection(bundle, bundle.LEGACY_READER_DATABASE_URL, "portfolio_legacy_reader_login", "public", "portfolio_legacy_reader");
    assertConnection(bundle, bundle.SOURCE_FENCE_DATABASE_URL, "portfolio_fence_login", "portfolio, extensions", "portfolio_fence_operator");
  } catch (error) {
    throw new Error(
      "Portfolio database-bootstrap bundle must identify the admin and every exact scoped login in one CA-pinned Supabase project",
      { cause: error },
    );
  }
  return Object.fromEntries(DATABASE_BOOTSTRAP_KEYS.map((key) => [key, bundle[key]])) as unknown as PortfolioDatabaseBootstrapBundle;
}
