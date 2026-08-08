import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "@libsql/client";

export interface Migration {
  version: string;
  checksum: string;
  sql: string;
}

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

export function loadMigrationPlan(folder: string): Migration[] {
  const files = readdirSync(folder).filter((file) => file.endsWith(".sql")).sort();
  if (files.length !== 1 || files[0] !== "001_initial.sql") {
    throw new Error("Portfolio must contain exactly one canonical career migration");
  }
  if (!files.every((file) => MIGRATION_FILE.test(file))) {
    throw new Error("Portfolio contains an invalid migration filename");
  }
  return files.map((file) => {
    const sql = readFileSync(path.join(folder, file), "utf8").replace(/\r\n?/g, "\n");
    return {
      version: file.slice(0, -4),
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  });
}

export async function applyPortfolioMigrations(
  client: Client,
  migrations: readonly Migration[],
): Promise<{ applied: number; total: number }> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS career_schema_migrations (
      migration_id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      checksum TEXT NOT NULL CHECK (
        length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'
      ),
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  const existing = await client.execute(
    "SELECT migration_id, checksum FROM career_schema_migrations ORDER BY migration_id",
  );
  const expected = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of existing.rows) {
    const version = String(row.migration_id);
    const migration = expected.get(version);
    if (!migration) throw new Error(`Database contains unknown career migration: ${version}`);
    if (migration.checksum !== row.checksum) {
      throw new Error(`Career migration checksum mismatch: ${version}`);
    }
  }

  const appliedVersions = new Set(existing.rows.map((row) => String(row.migration_id)));
  let applied = 0;
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    const transaction = await client.transaction("write");
    try {
      await transaction.executeMultiple(migration.sql);
      await transaction.execute({
        sql: `INSERT INTO career_schema_migrations
              (migration_id, source_name, checksum) VALUES (?, ?, ?)`,
        args: [migration.version, `${migration.version}.sql`, migration.checksum],
      });
      await transaction.commit();
      applied += 1;
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    } finally {
      transaction.close();
    }
  }
  return { applied, total: migrations.length };
}
