import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../../shared/postgres-tls";

const databaseUrl = process.env.DATABASE_URL;
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
const caCertInline = process.env.SUPABASE_CA_CERT;
const caCertFromPath = caCertPath ? readFileSync(caCertPath, "utf8") : undefined;
const caCertInlineNormalized = caCertInline ? caCertInline.replace(/\\n/g, "\n") : undefined;
const caCert = caCertInlineNormalized || caCertFromPath;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  ...(process.env.NODE_ENV === "production"
    ? productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      supabaseCaCert: caCert,
      expectedRole: "portfolio_runtime",
    })
    : postgresConnectionConfig(databaseUrl, caCert)),
});

export const db = drizzle(pool);
