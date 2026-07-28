import { existsSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../shared/postgres-tls";
import { applyPortfolioMigrations, loadMigrationPlan } from "./migration-ledger";
import { assertPortfolioMigratorBootstrapSession } from "../shared/postgres-session";

function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const containerFolder = path.resolve(process.cwd(), "migrations");
  if (existsSync(containerFolder)) return containerFolder;
  return path.resolve(process.cwd(), "src", "migrations");
}

async function main(): Promise<void> {
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
        expectedRole: "portfolio_migrator_login",
        capabilityRole: "portfolio_migrator",
        searchPath: "portfolio, extensions",
      })
      : postgresConnectionConfig(
        databaseUrl,
        process.env.SUPABASE_CA_CERT,
        "portfolio, extensions",
      )),
    max: 1,
  });

  const client = await pool.connect();
  try {
    if (process.env.NODE_ENV === "production") {
      await assertPortfolioMigratorBootstrapSession(client);
    } else {
      await client.query("SET ROLE portfolio_migrator");
    }
    const plan = loadMigrationPlan(migrationsFolder());
    const result = await applyPortfolioMigrations(client, plan);
    console.log(
      `Portfolio migrations complete: applied=${result.applied} total=${result.total}.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("Portfolio migrations failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
