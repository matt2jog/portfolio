import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { postgresConnectionConfig } from "../shared/postgres-tls";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");

  const pool = new Pool({
    ...postgresConnectionConfig(databaseUrl, process.env.SUPABASE_CA_CERT),
    max: 1,
  });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: process.env.MIGRATIONS_DIR || path.resolve(process.cwd(), "migrations"),
    });
    console.log("Portfolio migrations complete.");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("Portfolio migrations failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
