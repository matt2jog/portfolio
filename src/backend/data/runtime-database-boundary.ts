import type { Client } from "@libsql/client";

export const PORTFOLIO_RUNTIME_DATABASE_OBJECTS = [
  "ai_models",
  "all_skills",
  "bio",
  "bio_paragraphs",
  "experiences",
  "github_timeline_events",
  "linkedin_timeline_events",
  "personal_information",
  "portfolio_skills",
  "projects",
  "skills_group",
  "welcome_messages",
  "xyz_bullets",
] as const;

export async function assertRuntimeDatabaseClient(client: Client): Promise<void> {
  const result = await client.execute({
    sql: `
      SELECT count(*) AS object_count
      FROM sqlite_master
      WHERE type IN ('table', 'view')
        AND name IN (${PORTFOLIO_RUNTIME_DATABASE_OBJECTS.map(() => "?").join(", ")})
    `,
    args: [...PORTFOLIO_RUNTIME_DATABASE_OBJECTS],
  });
  if (Number(result.rows[0]?.object_count ?? 0) !== PORTFOLIO_RUNTIME_DATABASE_OBJECTS.length) {
    throw new Error("Portfolio career schema is unavailable");
  }
}
