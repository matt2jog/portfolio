import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";

const LEGAL_AUDIT_KEYS = [
  "LEGAL_AUDIT_DATABASE_URL",
  "SUPABASE_CA_CERT",
  "SUPABASE_PROJECT_REF",
] as const;
const METADATA_KEYS = ["schema_version", "service", "environment", "boundary"] as const;

export interface PortfolioLegalAuditBundle {
  LEGAL_AUDIT_DATABASE_URL: string;
  SUPABASE_CA_CERT: string;
  SUPABASE_PROJECT_REF: string;
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
  try {
    productionSupabaseConnectionConfig({
      databaseUrl: parsed.LEGAL_AUDIT_DATABASE_URL as string,
      projectRef: parsed.SUPABASE_PROJECT_REF as string,
      supabaseCaCert: parsed.SUPABASE_CA_CERT as string,
      expectedRole: "legal_audit_writer",
    });
  } catch (error) {
    throw new Error(
      "Portfolio legal audit bundle LEGAL_AUDIT_DATABASE_URL, SUPABASE_PROJECT_REF, and SUPABASE_CA_CERT must identify the scoped Supabase legal writer role with CA-backed verify-full TLS",
      { cause: error },
    );
  }
  return {
    LEGAL_AUDIT_DATABASE_URL: parsed.LEGAL_AUDIT_DATABASE_URL as string,
    SUPABASE_CA_CERT: parsed.SUPABASE_CA_CERT as string,
    SUPABASE_PROJECT_REF: parsed.SUPABASE_PROJECT_REF as string,
  };
}
