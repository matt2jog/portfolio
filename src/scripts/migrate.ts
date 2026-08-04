import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../shared/postgres-tls";
import { applyPortfolioMigrations, loadMigrationPlan } from "./migration-ledger";
import { assertPortfolioMigratorBootstrapSession } from "../shared/postgres-session";
import { portfolioDatabaseBoundary } from "../shared/database-boundary";

const SAFE_RUN_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const containerFolder = path.resolve(process.cwd(), "migrations");
  if (existsSync(containerFolder)) return containerFolder;
  return path.resolve(process.cwd(), "src", "migrations");
}

function migrationRunId(): string {
  const execution = process.env.CLOUD_RUN_EXECUTION?.trim() ?? "";
  return SAFE_RUN_ID.test(execution) ? execution : randomUUID();
}

async function runConfiguredMigrations(): Promise<{ applied: number; total: number }> {
  const databaseBoundary = portfolioDatabaseBoundary(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");
  if (
    process.env.NODE_ENV !== "production"
    && (!process.env.TEST_DATABASE_URL || databaseUrl !== process.env.TEST_DATABASE_URL)
  ) {
    throw new Error("Non-production migration is allowed only against the exact TEST_DATABASE_URL");
  }

  const pool = new Pool({
    ...(process.env.NODE_ENV === "production"
      ? productionSupabaseConnectionConfig({
        databaseUrl,
        projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
        supabaseCaCert: process.env.SUPABASE_CA_CERT,
        expectedCaSha256: process.env.SUPABASE_CA_SHA256,
        expectedRole: databaseBoundary.migratorLogin,
        capabilityRole: databaseBoundary.migratorRole,
        searchPath: databaseBoundary.searchPath,
      })
      : postgresConnectionConfig(
        databaseUrl,
        process.env.SUPABASE_CA_CERT,
        databaseBoundary.searchPath,
      )),
    max: 1,
  });

  const client = await pool.connect();
  try {
    if (process.env.NODE_ENV === "production") {
      await assertPortfolioMigratorBootstrapSession(client, databaseBoundary);
    } else {
      await client.query(`SET ROLE ${databaseBoundary.migratorRole}`);
    }
    const plan = loadMigrationPlan(migrationsFolder());
    return await applyPortfolioMigrations(client, plan, databaseBoundary);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<number> {
  const started = performance.now();
  const runId = migrationRunId();
  try {
    const result = await runConfiguredMigrations();
    console.log(JSON.stringify({
      applied_count: result.applied,
      duration_ms: Math.round(performance.now() - started),
      event: "job_completed",
      job: "portfolio_migration",
      run_id: runId,
      status: "succeeded",
      total_count: result.total,
    }));
    return 0;
  } catch {
    console.log(JSON.stringify({
      duration_ms: Math.round(performance.now() - started),
      event: "job_completed",
      failure_code: "migration_failed",
      job: "portfolio_migration",
      run_id: runId,
      status: "failed",
    }));
    return 1;
  }
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
