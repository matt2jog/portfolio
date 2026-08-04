import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import {
  portfolioDatabaseBoundary,
  renderPortfolioMigrationSql,
  type PortfolioDatabaseBoundary,
} from "../shared/database-boundary";

export interface Migration {
  version: string;
  checksum: string;
  sql: string;
}

export interface MigrationResult {
  applied: number;
  total: number;
}

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK = "portfolio-schema-migrations";

export function loadMigrationPlan(folder: string): Migration[] {
  const files = readdirSync(folder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No Portfolio migrations were found");
  }
  for (const file of files) {
    if (!MIGRATION_FILE.test(file)) {
      throw new Error(`Invalid Portfolio migration filename: ${file}`);
    }
  }

  return files.map((file) => {
    const sql = readFileSync(path.join(folder, file), "utf8").replace(/\r\n/g, "\n");
    return {
      version: file.slice(0, -4),
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  });
}

export async function applyPortfolioMigrations(
  client: Pick<PoolClient, "query">,
  migrations: readonly Migration[],
  boundary: PortfolioDatabaseBoundary = portfolioDatabaseBoundary(),
): Promise<MigrationResult> {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))", [
      `${MIGRATION_LOCK}:${boundary.schema}`,
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${boundary.schema}.schema_migrations (
        version text PRIMARY KEY,
        checksum character(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const existing = await client.query<{ version: string; checksum: string }>(
      `SELECT version, checksum FROM ${boundary.schema}.schema_migrations ORDER BY version`,
    );
    const known = new Map(migrations.map((migration) => [migration.version, migration]));
    for (const row of existing.rows) {
      const migration = known.get(row.version);
      if (!migration) {
        throw new Error(`Database contains unknown Portfolio migration: ${row.version}`);
      }
      if (migration.checksum !== row.checksum) {
        throw new Error(`Portfolio migration checksum mismatch: ${row.version}`);
      }
    }

    const appliedVersions = new Set(existing.rows.map((row) => row.version));
    let applied = 0;
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query(renderPortfolioMigrationSql(migration.sql, boundary));
      await client.query(
        `INSERT INTO ${boundary.schema}.schema_migrations (version, checksum) VALUES ($1, $2)`,
        [migration.version, migration.checksum],
      );
      applied += 1;
    }

    await client.query("COMMIT");
    return { applied, total: migrations.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
