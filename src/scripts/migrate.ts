import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createPortfolioClient } from "../shared/turso-connection";
import { applyPortfolioMigrations, loadMigrationPlan } from "./migration-ledger";

const SAFE_RUN_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const containerFolder = path.resolve(process.cwd(), "migrations");
  if (existsSync(containerFolder)) return containerFolder;
  return path.resolve(process.cwd(), "src", "migrations");
}

async function runConfiguredMigrations(): Promise<{ applied: number; total: number }> {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  if (!databaseUrl) throw new Error("TURSO_DATABASE_URL is required for migrations");
  if (
    process.env.NODE_ENV !== "production"
    && process.env.TEST_TURSO_DATABASE_URL !== databaseUrl
  ) {
    throw new Error("Local migration requires TURSO_DATABASE_URL to equal TEST_TURSO_DATABASE_URL");
  }
  const client = createPortfolioClient({
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    return await applyPortfolioMigrations(client, loadMigrationPlan(migrationsFolder()));
  } finally {
    client.close();
  }
}

async function main(): Promise<number> {
  const started = performance.now();
  const configuredRunId = process.env.CLOUD_RUN_EXECUTION?.trim() ?? "";
  const runId = SAFE_RUN_ID.test(configuredRunId) ? configuredRunId : randomUUID();
  try {
    const result = await runConfiguredMigrations();
    console.log(JSON.stringify({
      applied_count: result.applied,
      duration_ms: Math.round(performance.now() - started),
      event: "job_completed",
      job: "portfolio_career_migration",
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
      job: "portfolio_career_migration",
      run_id: runId,
      status: "failed",
    }));
    return 1;
  }
}

void main().then((exitCode) => { process.exitCode = exitCode; });
