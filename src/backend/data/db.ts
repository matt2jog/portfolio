import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { createAuditedPool } from "./database-audit";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../../shared/postgres-tls";
import { assertRuntimeDatabaseSession } from "./runtime-database-boundary";

const databaseUrl = process.env.DATABASE_URL;
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
const caCertInline = process.env.SUPABASE_CA_CERT;
const caCertFromPath = caCertPath ? readFileSync(caCertPath, "utf8") : undefined;
const caCertInlineNormalized = caCertInline ? caCertInline.replace(/\\n/g, "\n") : undefined;
const caCert = caCertInlineNormalized || caCertFromPath;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = createAuditedPool({
  ...(process.env.NODE_ENV === "production"
    ? productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      supabaseCaCert: caCert,
      expectedCaSha256: process.env.SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
      capabilityRole: "portfolio_runtime",
      searchPath: "portfolio, extensions",
    })
    : postgresConnectionConfig(databaseUrl, caCert, "portfolio, extensions")),
}, {
  databaseActor: "portfolio_runtime",
  initializeConnection: process.env.NODE_ENV === "production"
    ? assertRuntimeDatabaseSession
    : undefined,
  capabilityRole: process.env.NODE_ENV === "production"
    ? "portfolio_runtime"
    : undefined,
});

export const db = drizzle(pool);
