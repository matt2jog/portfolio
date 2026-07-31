import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../../shared/postgres-tls";
import { portfolioDatabaseBoundary } from "../../shared/database-boundary";

const databaseUrl = process.env.DATABASE_URL;
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
const caCertInline = process.env.SUPABASE_CA_CERT;
const caCertFromPath = caCertPath ? readFileSync(caCertPath, "utf8") : undefined;
const caCertInlineNormalized = caCertInline ? caCertInline.replace(/\\n/g, "\n") : undefined;
const caCert = caCertInlineNormalized || caCertFromPath;
const databaseBoundary = portfolioDatabaseBoundary(process.env);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  ...(process.env.NODE_ENV === "production"
    ? productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      supabaseCaCert: caCert,
      expectedCaSha256: process.env.SUPABASE_CA_SHA256,
      expectedRole: databaseBoundary.runtimeLogin,
      capabilityRole: databaseBoundary.runtimeRole,
      searchPath: databaseBoundary.searchPath,
    })
    : postgresConnectionConfig(databaseUrl, caCert, databaseBoundary.searchPath)),
});

pool.on("error", (error) => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
  console.error(JSON.stringify({
    event: "portfolio.database.pool_error",
    code,
  }));
});

export const db = drizzle(pool);
