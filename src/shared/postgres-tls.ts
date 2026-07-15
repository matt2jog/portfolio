import { X509Certificate } from "node:crypto";

const SUPABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.com"] as const;
const CONNECTION_STRING_SSL_KEYS = ["sslcert", "sslkey", "sslrootcert", "sslmode"] as const;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
const SUPABASE_POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/;
const POSTGRES_PORTS = new Set(["5432", "6543"]);

export interface PostgresConnectionConfig {
  connectionString: string;
  ssl: { rejectUnauthorized: true; ca: string } | undefined;
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
): PostgresConnectionConfig {
  const parsed = new URL(databaseUrl);
  if (!isSupabaseHost(parsed.hostname)) {
    return { connectionString: databaseUrl, ssl: undefined };
  }

  const ca = normalizedCertificate(supabaseCaCert);
  if (!ca) {
    throw new Error("SUPABASE_CA_CERT is required and must be a PEM certificate for Supabase Postgres");
  }

  for (const key of CONNECTION_STRING_SSL_KEYS) parsed.searchParams.delete(key);

  return {
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true, ca },
  };
}

export interface ProductionSupabaseConnection {
  databaseUrl: string;
  projectRef: string;
  supabaseCaCert: string | undefined;
  expectedRole?: string;
}

export function productionSupabaseConnectionConfig({
  databaseUrl,
  projectRef,
  supabaseCaCert,
  expectedRole,
}: ProductionSupabaseConnection): PostgresConnectionConfig {
  if (!SUPABASE_PROJECT_REF.test(projectRef)) {
    throw new Error("SUPABASE_PROJECT_REF must be a 20-character lowercase Supabase project ref");
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
    || !POSTGRES_PORTS.has(parsed.port)
  ) {
    throw new Error("Production DATABASE_URL must include Supabase PostgreSQL credentials and port 5432 or 6543");
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

  return postgresConnectionConfig(parsed.toString(), supabaseCaCert);
}
