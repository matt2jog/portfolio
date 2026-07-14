const LEGAL_AUDIT_KEYS = ["DATABASE_URL", "LEGAL_AUDIT_WRITE_ROLE_PASSWORD", "SUPABASE_CA_CERT"] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioLegalAuditBundle {
  DATABASE_URL: string;
  LEGAL_AUDIT_WRITE_ROLE_PASSWORD: string;
  SUPABASE_CA_CERT: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], subject: string): void {
  const allowed = new Set(expected);
  if (Object.keys(value).some((key) => !allowed.has(key)) || expected.some((key) => !(key in value))) {
    throw new Error(`Portfolio legal audit bundle ${subject} does not match its schema`);
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

export function parseLegalAuditBundle(raw: string): PortfolioLegalAuditBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Portfolio legal audit bundle is not valid JSON");
  }
  if (!isRecord(parsed)) throw new Error("Portfolio legal audit bundle must be a JSON object");
  assertExactKeys(parsed, ["_meta", ...LEGAL_AUDIT_KEYS], "root");
  if (!isRecord(parsed._meta)) throw new Error("Portfolio legal audit bundle metadata is invalid");
  assertExactKeys(parsed._meta, METADATA_KEYS, "metadata");
  if (
    parsed._meta.schema_version !== 1
    || parsed._meta.service !== "portfolio"
    || parsed._meta.environment !== "prod"
    || parsed._meta.boundary !== "legal_audit"
  ) {
    throw new Error("Portfolio legal audit bundle metadata is invalid");
  }
  for (const key of LEGAL_AUDIT_KEYS) {
    if (typeof parsed[key] !== "string" || parsed[key].length === 0) {
      throw new Error(`Portfolio legal audit bundle is missing required key: ${key}`);
    }
  }
  if (!isPostgresUri(parsed.DATABASE_URL as string)) {
    throw new Error("Portfolio legal audit bundle DATABASE_URL must be a PostgreSQL URI");
  }
  if (!isPemCertificate(parsed.SUPABASE_CA_CERT as string)) {
    throw new Error("Portfolio legal audit bundle SUPABASE_CA_CERT must be a PEM certificate");
  }
  return {
    DATABASE_URL: parsed.DATABASE_URL as string,
    LEGAL_AUDIT_WRITE_ROLE_PASSWORD: parsed.LEGAL_AUDIT_WRITE_ROLE_PASSWORD as string,
    SUPABASE_CA_CERT: parsed.SUPABASE_CA_CERT as string,
  };
}
