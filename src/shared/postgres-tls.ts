import { X509Certificate } from "node:crypto";

const SUPABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.com"] as const;
const CONNECTION_STRING_SSL_KEYS = ["sslcert", "sslkey", "sslrootcert", "sslmode"] as const;
export const PORTFOLIO_SUPABASE_PROJECT_REF = "qvbpgvazqfyhwjsfulsb";
const SUPABASE_POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/;
const PRODUCTION_POSTGRES_PORT = "5432";

export type PortfolioSearchPath =
  | "portfolio, extensions"
  | "portfolio_staging, extensions"
  | "public";

export interface PostgresConnectionConfig {
  connectionString: string;
  ssl: { rejectUnauthorized: true; ca: string } | undefined;
  options?: string;
}

function normalizeSha256(value: string): string {
  return value.replaceAll(":", "").toLowerCase();
}

export function certificateSha256(certificate: string): string {
  return normalizeSha256(new X509Certificate(certificate.replace(/\\n/g, "\n")).fingerprint256);
}

function postgresOptions(searchPath?: PortfolioSearchPath, capabilityRole?: string): string {
  if (capabilityRole && !/^[a-z_][a-z0-9_]*$/.test(capabilityRole)) {
    throw new Error("PostgreSQL capability role is not a safe identifier");
  }
  return [
    ...(searchPath ? [`-c search_path=${searchPath.replaceAll(" ", "")}`] : []),
    ...(capabilityRole ? [`-c role=${capabilityRole}`] : []),
    "-c TimeZone=UTC",
  ].join(" ");
}

function isSupabaseHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return SUPABASE_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix),
  );
}

function normalizedCertificate(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\\n/g, "\n");
  if (!normalized) return undefined;
  try {
    new X509Certificate(normalized);
    return normalized;
  } catch {
    return undefined;
  }
}

export function postgresConnectionConfig(
  databaseUrl: string,
  supabaseCaCert: string | undefined,
  searchPath?: PortfolioSearchPath,
  expectedCaSha256?: string,
  capabilityRole?: string,
): PostgresConnectionConfig {
  const parsed = new URL(databaseUrl);
  if (!isSupabaseHost(parsed.hostname)) {
    return {
      connectionString: databaseUrl,
      ssl: undefined,
      options: postgresOptions(searchPath, capabilityRole),
    };
  }

  const ca = normalizedCertificate(supabaseCaCert);
  if (!ca) {
    throw new Error("SUPABASE_CA_CERT is required and must be a PEM certificate for Supabase Postgres");
  }
  if (!expectedCaSha256 || !/^[a-fA-F0-9:]{64,95}$/.test(expectedCaSha256)) {
    throw new Error("SUPABASE_CA_SHA256 is required and must be a SHA-256 certificate fingerprint");
  }
  if (certificateSha256(ca) !== normalizeSha256(expectedCaSha256)) {
    throw new Error("SUPABASE_CA_CERT fingerprint does not match SUPABASE_CA_SHA256");
  }

  for (const key of CONNECTION_STRING_SSL_KEYS) parsed.searchParams.delete(key);

  return {
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true, ca },
    options: postgresOptions(searchPath, capabilityRole),
  };
}

export interface ProductionSupabaseConnection {
  databaseUrl: string;
  projectRef: string;
  supabaseCaCert: string | undefined;
  expectedCaSha256: string | undefined;
  expectedRole?: string;
  capabilityRole?: string;
  searchPath?: PortfolioSearchPath;
}

export function productionSupabaseConnectionConfig({
  databaseUrl,
  projectRef,
  supabaseCaCert,
  expectedCaSha256,
  expectedRole,
  capabilityRole,
  searchPath,
}: ProductionSupabaseConnection): PostgresConnectionConfig {
  if (projectRef !== PORTFOLIO_SUPABASE_PROJECT_REF) {
    throw new Error(`SUPABASE_PROJECT_REF must equal ${PORTFOLIO_SUPABASE_PROJECT_REF}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Production DATABASE_URL must be a valid Supabase PostgreSQL URI");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    || !parsed.username
    || !parsed.password
    || parsed.port !== PRODUCTION_POSTGRES_PORT
  ) {
    throw new Error("Production DATABASE_URL must include Supabase PostgreSQL credentials and session-mode port 5432");
  }
  if (parsed.pathname !== "/postgres") {
    throw new Error("Production DATABASE_URL must connect to the Supabase postgres database");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Production DATABASE_URL must not contain query, option, TLS, or fragment overrides");
  }

  const hostname = parsed.hostname.toLowerCase();
  const directHost = "db." + projectRef + ".supabase.co";
  const isDirect = hostname === directHost;
  const isPooler = SUPABASE_POOLER_HOST.test(hostname);
  if (!isDirect && !isPooler) {
    throw new Error("Production DATABASE_URL host does not match the configured Supabase project");
  }

  let username: string;
  try {
    username = decodeURIComponent(parsed.username);
  } catch {
    throw new Error("Production DATABASE_URL contains an invalid Supabase username");
  }
  if (expectedRole) {
    const expectedUsername = isDirect ? expectedRole : expectedRole + "." + projectRef;
    if (username !== expectedUsername) {
      throw new Error("Production DATABASE_URL username does not match its scoped Supabase role and project");
    }
  } else if (isPooler) {
    const tenantSuffix = "." + projectRef;
    if (!username.endsWith(tenantSuffix) || username.length === tenantSuffix.length) {
      throw new Error("Production DATABASE_URL pooler username does not match the configured Supabase project");
    }
  }

  return postgresConnectionConfig(
    parsed.toString(),
    supabaseCaCert,
    searchPath,
    expectedCaSha256,
    capabilityRole,
  );
}
