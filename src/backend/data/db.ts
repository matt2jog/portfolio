import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { postgresConnectionConfig } from "../../shared/postgres-tls";

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
  ...postgresConnectionConfig(databaseUrl, caCert),
});

export const db = drizzle(pool);
