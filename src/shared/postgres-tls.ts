const SUPABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.com"] as const;
const CONNECTION_STRING_SSL_KEYS = ["sslcert", "sslkey", "sslrootcert", "sslmode"] as const;

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
  return /^-----BEGIN CERTIFICATE-----\r?\n[\s\S]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(normalized)
    ? normalized
    : undefined;
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
