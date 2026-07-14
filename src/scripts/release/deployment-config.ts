const DEPLOYMENT_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "DATABASE_URL",
  "EDGE_ORIGIN_TOKEN",
  "SUPABASE_CA_CERT",
] as const;
const OPTIONAL_DEPLOYMENT_KEYS = ["EDGE_ORIGIN_PREVIOUS_TOKEN"] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioDeploymentBundle {
  CLOUDFLARE_API_TOKEN: string;
  DATABASE_URL: string;
  EDGE_ORIGIN_TOKEN: string;
  EDGE_ORIGIN_PREVIOUS_TOKEN?: string;
  SUPABASE_CA_CERT: string;
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
  if (!isPostgresUri(parsed.DATABASE_URL as string)) {
    throw new Error("Portfolio deployment bundle DATABASE_URL must be a PostgreSQL URI");
  }
  if (!isPemCertificate(parsed.SUPABASE_CA_CERT as string)) {
    throw new Error("Portfolio deployment bundle SUPABASE_CA_CERT must be a PEM certificate");
  }

  return {
    CLOUDFLARE_API_TOKEN: parsed.CLOUDFLARE_API_TOKEN as string,
    DATABASE_URL: parsed.DATABASE_URL as string,
    EDGE_ORIGIN_TOKEN: parsed.EDGE_ORIGIN_TOKEN as string,
    EDGE_ORIGIN_PREVIOUS_TOKEN: parsed.EDGE_ORIGIN_PREVIOUS_TOKEN as string | undefined,
    SUPABASE_CA_CERT: parsed.SUPABASE_CA_CERT as string,
  };
}
