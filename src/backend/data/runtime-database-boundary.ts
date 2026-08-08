import type { Client } from "@libsql/client";

export async function assertRuntimeDatabaseClient(client: Client): Promise<void> {
  const result = await client.execute(`
    SELECT count(*) AS table_count
    FROM sqlite_master
    WHERE type IN ('table', 'view')
      AND name IN ('projects', 'experiences', 'resume_projects', 'career_schema_migrations')
  `);
  if (Number(result.rows[0]?.table_count ?? 0) !== 4) {
    throw new Error("Portfolio career schema is unavailable");
  }
}
