import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPortfolioClient } from "../../shared/turso-connection";
import { githubTimelineEvents, projects } from "../../shared/schema";
import { applyPortfolioMigrations, loadMigrationPlan } from "../../scripts/migration-ledger";

const folder = mkdtempSync(path.join(tmpdir(), "portfolio-turso-"));
const databaseUrl = `file:${path.join(folder, "career.db").replace(/\\/gu, "/")}`;
process.env.TURSO_DATABASE_URL = databaseUrl;

before(async () => {
  const client = createPortfolioClient({ url: databaseUrl });
  try {
    const plan = loadMigrationPlan(path.resolve("src", "migrations"));
    assert.deepEqual(await applyPortfolioMigrations(client, plan), { applied: 1, total: 1 });
    assert.deepEqual(await applyPortfolioMigrations(client, plan), { applied: 0, total: 1 });
  } finally {
    client.close();
  }
});

after(async () => {
  const { pool } = await import("../../backend/data/db");
  await pool.end();
});

test("canonical career tables and Resume compatibility views exist", async () => {
  const client = createPortfolioClient({ url: databaseUrl });
  try {
    const result = await client.execute(`
      SELECT name, type FROM sqlite_master
      WHERE name IN (
        'projects', 'experiences', 'experience_bullets', 'all_skills',
        'resume_projects', 'resume_experiences', 'resume_experience_bullets',
        'resume_skill_variants', 'career_schema_migrations'
      ) ORDER BY name
    `);
    assert.equal(result.rows.length, 9);
    assert.equal(result.rows.filter((row) => row.type === "view").length, 4);
  } finally {
    client.close();
  }
});

test("Portfolio reads career rows and can append GitHub activity", async () => {
  const seed = createPortfolioClient({ url: databaseUrl });
  await seed.execute({
    sql: "INSERT INTO projects (id, title, category, description) VALUES (?, ?, ?, ?)",
    args: ["project-1", "Project", "Build", "Description"],
  });
  seed.close();

  const { db } = await import("../../backend/data/db");
  const rows = await db.select().from(projects).where(eq(projects.id, "project-1"));
  assert.equal(rows[0]?.title, "Project");

  await db.insert(githubTimelineEvents).values({
    extId: "event-1",
    type: "PushEvent",
    title: "Commit",
    repo: "matt2jog/portfolio",
    timestamp: new Date("2026-01-02T03:04:05Z"),
    meta: {},
  }).onConflictDoNothing({ target: githubTimelineEvents.extId });
  const events = await db.select().from(githubTimelineEvents);
  assert.equal(events.length, 1);
});

test("canonical career mutation and false messaging data fail closed", async () => {
  const { db } = await import("../../backend/data/db");
  await assert.rejects(
    db.update(projects).set({ title: "Changed" }).where(eq(projects.id, "project-1")),
    (error: unknown) => {
      const cause = error instanceof Error && "cause" in error ? String(error.cause) : "";
      return cause.includes("only read career data or append GitHub activity");
    },
  );
  const client = createPortfolioClient({ url: databaseUrl });
  try {
    await assert.rejects(
      client.execute({
        sql: "INSERT INTO all_skills (id, name) VALUES (?, ?)",
        args: ["skill-1", "GCP PubSub"],
      }),
      /CHECK constraint/,
    );
  } finally {
    client.close();
  }
});
