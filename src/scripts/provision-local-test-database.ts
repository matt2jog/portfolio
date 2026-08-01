import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !process.env.TEST_DATABASE_URL || databaseUrl !== process.env.TEST_DATABASE_URL) {
    throw new Error("Local role provisioning requires identical DATABASE_URL and TEST_DATABASE_URL");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local role provisioning is disabled in production");
  }
  const sql = await readFile(
    path.resolve(process.cwd(), "infra", "supabase", "bootstrap.sql"),
    "utf8",
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions");
    await client.query(`
      DO $resume_test_role$
      BEGIN
        IF to_regrole('resume_app') IS NULL THEN
          CREATE ROLE resume_app NOLOGIN NOINHERIT;
        END IF;
      END
      $resume_test_role$
    `);
    await client.query(`
      DO $admin_test_role$
      BEGIN
        IF to_regrole('admin_runtime') IS NULL THEN
          CREATE ROLE admin_runtime NOLOGIN NOINHERIT;
        END IF;
      END
      $admin_test_role$
    `);
    await client.query(sql);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local test database provisioning failed");
  process.exit(1);
});
