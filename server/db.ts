import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
const caCertInline = process.env.SUPABASE_CA_CERT;
const caCertFromPath = caCertPath ? readFileSync(caCertPath, "utf8") : undefined;
const caCertInlineNormalized = caCertInline ? caCertInline.replace(/\\n/g, "\n") : undefined;
const caCert = caCertInlineNormalized || caCertFromPath;

if (caCert) {
  console.log("SUPABASE_CA_CERT loaded:\n", caCert);
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  family: databaseUrl.includes("supabase.com") ? 4 : undefined,
  ssl: databaseUrl.includes("supabase.com")
    ? caCert
      ? { rejectUnauthorized: true, ca: caCert }
      : { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool);
