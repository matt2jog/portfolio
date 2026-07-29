import assert from "node:assert/strict";
import path from "node:path";
import { after, test } from "node:test";
import { Pool } from "pg";
import {
  applyPortfolioMigrations,
  loadMigrationPlan,
} from "../../scripts/migration-ledger";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const plan = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"));

after(async () => {
  await pool.end();
});

test("all migrations are checksummed and idempotent", async () => {
  assert.ok(plan.length >= 3);
  assert.equal(plan[0]?.version, "001_initial");
  assert.ok(plan.some((migration) => migration.version === "002_portfolio_skill_groups"));
  assert.ok(plan.some((migration) => migration.version === "003_canonical_skill_presentation"));
  assert.ok(plan.some((migration) => migration.version === "004_remove_raw_request_tracking"));

  const ledger = await pool.query<{ version: string; checksum: string }>(
    "SELECT version, checksum FROM portfolio.schema_migrations ORDER BY version",
  );
  assert.deepEqual(
    ledger.rows,
    plan.map(({ version, checksum }) => ({ version, checksum })),
  );

  const client = await pool.connect();
  try {
    const result = await applyPortfolioMigrations(client, plan);
    assert.deepEqual(result, { applied: 0, total: plan.length });
  } finally {
    client.release();
  }
});

test("the baseline contains only current tables, views, and ordinary RLS", async () => {
  const tables = await pool.query<{ relname: string }>(`
    SELECT relation.relname
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'portfolio'::regnamespace
      AND relation.relkind = 'r'
    ORDER BY relation.relname
  `);
  assert.deepEqual(tables.rows.map((row) => row.relname), [
    "admin_policy_acceptance",
    "ai_models",
    "all_skills",
    "audit_logs",
    "bio",
    "bio_paragraphs",
    "browser_tracking",
    "education",
    "experiences",
    "github_timeline_events",
    "legal_document_versions",
    "linkedin_timeline_events",
    "personal_information",
    "portfolio_skills",
    "projects",
    "schema_migrations",
    "skills_group",
    "users",
    "welcome_messages",
    "xyz_bullets",
  ]);

  const views = await pool.query<{ relname: string }>(`
    SELECT relation.relname
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'portfolio'::regnamespace
      AND relation.relkind = 'v'
    ORDER BY relation.relname
  `);
  assert.deepEqual(views.rows.map((row) => row.relname), [
    "legal_document_active_ranges",
    "resume_cv_profile",
    "resume_education",
    "resume_experience_bullets",
    "resume_experiences",
    "resume_project_bullets",
    "resume_projects",
    "resume_skill_concept_categories",
    "resume_skill_concepts",
    "resume_skill_taxonomy_categories",
    "resume_skill_variants",
  ]);

  const customCode = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.pronamespace = 'portfolio'::regnamespace
  `);
  assert.equal(customCode.rows[0]?.count, "0");

  const triggers = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
    WHERE relation.relnamespace = 'portfolio'::regnamespace
      AND NOT trigger.tgisinternal
  `);
  assert.equal(triggers.rows[0]?.count, "0");

  const rowSecurity = await pool.query<{ relname: string }>(`
    SELECT relname
    FROM pg_catalog.pg_class
    WHERE relnamespace = 'portfolio'::regnamespace
      AND relrowsecurity
    ORDER BY relname
  `);
  assert.deepEqual(rowSecurity.rows.map((row) => row.relname), [
    "legal_document_versions",
  ]);
  const policies = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM pg_catalog.pg_policy WHERE polrelid = 'portfolio.legal_document_versions'::regclass",
  );
  assert.equal(policies.rows[0]?.count, "0");
});
