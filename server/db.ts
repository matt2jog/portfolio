import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool);
