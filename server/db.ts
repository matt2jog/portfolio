import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseUrl = process.env.DATABASE_URL;
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
const caCertInline = process.env.SUPABASE_CA_CERT;
const caCert = caCertInline || caCertPath;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.com")
    ? caCert
      ? { rejectUnauthorized: true, ca: caCert }
      : { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool);
