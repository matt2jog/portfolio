import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { createPortfolioClient } from "../shared/turso-connection";

interface TableContract {
  name: string;
  columns: readonly string[];
  json?: readonly string[];
  timestamps?: readonly string[];
  booleans?: readonly string[];
}

const TABLES: readonly TableContract[] = [
  { name: "users", columns: ["id", "email", "auth0_sub", "name", "role", "created_at"], timestamps: ["created_at"] },
  { name: "projects", columns: ["id", "title", "category", "description", "long_description", "tech", "image", "hover_image", "deployed_url", "github_url", "ai_system_prompt", "position", "created_at", "updated_at", "deleted_at", "archived_by"], json: ["tech"], timestamps: ["created_at", "updated_at", "deleted_at"] },
  { name: "xyz_bullets", columns: ["id", "project_id", "bullet_text", "position", "created_at", "updated_at"], timestamps: ["created_at", "updated_at"] },
  { name: "ai_models", columns: ["id", "label", "model_id", "provider", "fireworks_model_id", "enabled", "position", "created_at"], timestamps: ["created_at"], booleans: ["enabled"] },
  { name: "bio", columns: ["id", "headline", "created_at", "updated_at"], timestamps: ["created_at", "updated_at"] },
  { name: "bio_paragraphs", columns: ["id", "bio_id", "content", "position"] },
  { name: "skills_group", columns: ["id", "name", "position", "created_at", "updated_at"], timestamps: ["created_at", "updated_at"] },
  { name: "all_skills", columns: ["id", "name", "grouping_id", "embedding", "embedding_model"], json: ["embedding"] },
  { name: "portfolio_skills", columns: ["id", "all_skill_id", "group_id", "position", "deleted_at", "archived_by"], timestamps: ["deleted_at"] },
  { name: "experiences", columns: ["id", "role", "company", "location", "duration", "description", "technologies", "is_active", "position", "created_at", "updated_at"], json: ["technologies"], timestamps: ["created_at", "updated_at"], booleans: ["is_active"] },
  { name: "experience_bullets", columns: ["id", "experience_id", "bullet_text", "position", "created_at", "updated_at"], timestamps: ["created_at", "updated_at"] },
  { name: "education", columns: ["id", "school", "location", "degree", "dates", "position", "created_at", "updated_at"], timestamps: ["created_at", "updated_at"] },
  { name: "personal_information", columns: ["id", "name", "title", "location", "short_bio", "email", "phone", "phone_formatted", "linkedin_url", "github_url", "devpost_url", "portfolio_url", "updated_at"], timestamps: ["updated_at"] },
  { name: "github_timeline_events", columns: ["id", "ext_id", "type", "title", "description", "url", "repo", "timestamp", "meta", "created_at"], json: ["meta"], timestamps: ["timestamp", "created_at"] },
  { name: "linkedin_timeline_events", columns: ["id", "ext_id", "type", "title", "description", "url", "source", "timestamp", "meta", "created_at"], json: ["meta"], timestamps: ["timestamp", "created_at"] },
  { name: "admin_policy_acceptance", columns: ["id", "admin_id", "timestamp", "policy_version", "terms_version", "privacy_version", "accepted"], timestamps: ["timestamp"], booleans: ["accepted"] },
  { name: "audit_logs", columns: ["id", "user_id", "action", "payload", "created_at"], json: ["payload"], timestamps: ["created_at"] },
  { name: "browser_tracking", columns: ["id", "hashed_uuid", "tr_en", "consented_at", "created_at", "updated_at"], timestamps: ["consented_at", "created_at", "updated_at"] },
  { name: "welcome_messages", columns: ["id", "slug", "label", "message", "archived_at", "created_at", "updated_at"], timestamps: ["archived_at", "created_at", "updated_at"] },
  { name: "legal_document_versions", columns: ["id", "doc_type", "content", "content_hash", "commit_sha", "committed_at", "recorded_at"], timestamps: ["committed_at", "recorded_at"] },
] as const;

type TransferRow = Record<string, unknown>;
interface TransferArtifact {
  format: "personal-brand-career-v1";
  content_sha256: string;
  tables: Record<string, TransferRow[]>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(tables: Record<string, TransferRow[]>): string {
  return createHash("sha256").update(canonical(tables)).digest("hex");
}

function normalizeValue(value: unknown, column: string, contract: TableContract): unknown {
  if (value === null || value === undefined) return null;
  if (contract.timestamps?.includes(column)) {
    const millis = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "bigint"
          ? Number(value)
          : /^\d+$/.test(String(value))
            ? Number(value)
            : new Date(String(value)).getTime();
    if (!Number.isFinite(millis)) throw new Error(`Invalid timestamp in ${contract.name}.${column}`);
    return millis;
  }
  if (contract.booleans?.includes(column)) return value ? 1 : 0;
  if (contract.json?.includes(column)) {
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return { base64: value.toString("base64") };
  return value;
}

function normalizeRow(row: TransferRow, contract: TableContract): TransferRow {
  return Object.fromEntries(contract.columns.map((column) => [
    column,
    normalizeValue(row[column], column, contract),
  ]));
}

async function exportLegacy(outputPath: string): Promise<void> {
  const connectionString = process.env.LEGACY_DATABASE_URL;
  if (!connectionString) throw new Error("LEGACY_DATABASE_URL is required for export");
  const ca = process.env.LEGACY_DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const pool = new Pool({
    connectionString,
    max: 1,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  });
  const tables: Record<string, TransferRow[]> = {};
  try {
    for (const contract of TABLES) {
      const columns = contract.columns.map((column) => `"${column}"`).join(", ");
      const result = await pool.query<TransferRow>(
        `SELECT ${columns} FROM portfolio."${contract.name}" ORDER BY id`,
      );
      tables[contract.name] = result.rows.map((row) => normalizeRow(row, contract));
    }
  } finally {
    await pool.end();
  }
  const artifact: TransferArtifact = {
    format: "personal-brand-career-v1",
    content_sha256: digest(tables),
    tables,
  };
  await writeFile(outputPath, `${canonical(artifact)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ event: "career_export_completed", rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0), tables: TABLES.length }));
}

async function readArtifact(inputPath: string): Promise<TransferArtifact> {
  const artifact = JSON.parse(await readFile(inputPath, "utf8")) as TransferArtifact;
  if (artifact.format !== "personal-brand-career-v1" || artifact.content_sha256 !== digest(artifact.tables)) {
    throw new Error("Career transfer artifact is invalid or has changed");
  }
  if (Object.keys(artifact.tables).sort().join("\0") !== TABLES.map(({ name }) => name).sort().join("\0")) {
    throw new Error("Career transfer artifact has missing or unexpected tables");
  }
  return artifact;
}

function bindValue(value: unknown, column: string, contract: TableContract): string | number | null {
  if (value === null || value === undefined) return null;
  if (contract.json?.includes(column)) return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number") return value;
  throw new Error(`Unsupported value in ${contract.name}.${column}`);
}

async function targetClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required");
  return createPortfolioClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

async function importArtifact(inputPath: string): Promise<void> {
  const artifact = await readArtifact(inputPath);
  const client = await targetClient();
  try {
    for (const contract of TABLES) {
      const current = await client.execute(`SELECT count(*) AS count FROM "${contract.name}"`);
      if (Number(current.rows[0]?.count ?? 0) !== 0) {
        throw new Error(`Refusing to import into non-empty table ${contract.name}`);
      }
    }
    const transaction = await client.transaction("write");
    try {
      for (const contract of TABLES) {
        const columns = contract.columns.map((column) => `"${column}"`).join(", ");
        const placeholders = contract.columns.map(() => "?").join(", ");
        for (const row of artifact.tables[contract.name] ?? []) {
          await transaction.execute({
            sql: `INSERT INTO "${contract.name}" (${columns}) VALUES (${placeholders})`,
            args: contract.columns.map((column) => bindValue(row[column], column, contract)),
          });
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    } finally {
      transaction.close();
    }
  } finally {
    client.close();
  }
  await verifyTarget(inputPath);
}

async function verifyTarget(inputPath: string): Promise<void> {
  const artifact = await readArtifact(inputPath);
  const client = await targetClient();
  const tables: Record<string, TransferRow[]> = {};
  try {
    for (const contract of TABLES) {
      const columns = contract.columns.map((column) => `"${column}"`).join(", ");
      const result = await client.execute(`SELECT ${columns} FROM "${contract.name}" ORDER BY id`);
      tables[contract.name] = result.rows.map((row) => normalizeRow(row as TransferRow, contract));
    }
  } finally {
    client.close();
  }
  if (digest(tables) !== artifact.content_sha256) {
    throw new Error("Target career data does not match the transfer artifact");
  }
  console.log(JSON.stringify({ event: "career_transfer_verified", rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0), tables: TABLES.length }));
}

async function main(): Promise<void> {
  const [command, file] = process.argv.slice(2);
  if (!file || !["export", "import", "verify"].includes(command ?? "")) {
    throw new Error("Usage: npm run db:transfer -- <export|import|verify> <artifact.json>");
  }
  if (command === "export") await exportLegacy(file);
  else if (command === "import") await importArtifact(file);
  else await verifyTarget(file);
}

void main().catch(() => {
  console.error(JSON.stringify({ event: "career_transfer_failed", remediation: "Check the command, scoped database credentials, schema migration, and unopened output path." }));
  process.exitCode = 1;
});
