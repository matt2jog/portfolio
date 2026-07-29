const MIGRATION_FIELDS = [
  "MIGRATION_DATABASE_URL",
  "SUPABASE_CA_CERT",
  "SUPABASE_CA_SHA256",
  "SUPABASE_PROJECT_REF",
] as const;

function parseBundle(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Portfolio database bootstrap bundle must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "Portfolio database bootstrap bundle must be a JSON object"
    ) {
      throw error;
    }
    throw new Error("Portfolio database bootstrap bundle is not valid JSON");
  }
}

export function applyMigrationBundle(
  raw: string,
  target: NodeJS.ProcessEnv = process.env,
): void {
  const bundle = parseBundle(raw);
  for (const field of MIGRATION_FIELDS) {
    const value = bundle[field];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Portfolio database bootstrap bundle is missing required key: ${field}`);
    }
    const targetField = field === "MIGRATION_DATABASE_URL" ? "DATABASE_URL" : field;
    target[targetField] = value;
  }
}

export function loadMigrationEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  const raw = target.PORTFOLIO_DATABASE_BOOTSTRAP_BUNDLE;
  if (!raw) return;
  delete target.PORTFOLIO_DATABASE_BOOTSTRAP_BUNDLE;
  applyMigrationBundle(raw, target);
}
