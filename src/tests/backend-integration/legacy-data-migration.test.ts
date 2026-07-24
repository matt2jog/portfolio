import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Client, Pool } from "pg";
import {
  bootstrapLegacyPortfolioData,
  PORTFOLIO_DATA_TABLES,
  type ColumnMetadata,
} from "../../scripts/legacy-data-migration";
import { applyPortfolioMigrations, loadMigrationPlan } from "../../scripts/migration-ledger";
import { postgresConnectionConfig } from "../../shared/postgres-tls";
import { assertPortfolioLegacyReaderDatabaseSession } from "../../shared/postgres-session";
import { LEGACY_PORTFOLIO_COLUMN_SNAPSHOT } from "../fixtures/legacy-portfolio-schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for migration integration tests");
const parsedUrl = new URL(databaseUrl);
const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
const readerPassword = "portfolio-legacy-reader-integration-password";

function roleUrl(database: URL, role: string, password: string): string {
  const url = new URL(database.toString());
  url.username = role;
  url.password = password;
  return url.toString();
}

test("legacy Portfolio import is exact, isolated, and refuses a non-empty target", {
  skip: !isLoopback,
}, async () => {
  const databaseName = `portfolio_import_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(parsedUrl.toString());
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  let pool: Pool | undefined;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    const fixtureUrl = new URL(parsedUrl.toString());
    fixtureUrl.pathname = `/${databaseName}`;
    pool = new Pool({
      ...postgresConnectionConfig(fixtureUrl.toString(), undefined, "portfolio, extensions"),
      max: 3,
    });
    const setup = await pool.connect();
    try {
      await setup.query("SET portfolio.test_admin_migration = 'on'");
      await applyPortfolioMigrations(
        setup,
        loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations")),
        { allowSchemaBootstrap: true },
      );
      for (const table of PORTFOLIO_DATA_TABLES) {
        await setup.query(`CREATE TABLE public."${table}" (LIKE portfolio."${table}" INCLUDING ALL)`);
      }
      await setup.query(`
        CREATE TABLE public.skills_group_discipline (
          id varchar PRIMARY KEY,
          name text NOT NULL
        );
        ALTER TABLE public.skills_group
          ADD COLUMN discipline_id varchar REFERENCES public.skills_group_discipline(id);
        CREATE TABLE public.resumes (
          id varchar PRIMARY KEY,
          title text NOT NULL
        );
        CREATE TABLE public.portfolio_schema_migrations (
          filename text PRIMARY KEY,
          checksum text NOT NULL
        );
      `);
      const liveFixtureMetadata = await setup.query<ColumnMetadata>(`
        SELECT
          table_name AS "tableName",
          column_name AS "columnName",
          data_type AS "dataType",
          udt_name AS "udtName",
          is_nullable AS "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position
      `, [PORTFOLIO_DATA_TABLES]);
      const byColumnKey = (left: ColumnMetadata, right: ColumnMetadata): number => (
        `${left.tableName}.${left.columnName}`.localeCompare(`${right.tableName}.${right.columnName}`)
      );
      assert.deepEqual(
        [...liveFixtureMetadata.rows].sort(byColumnKey),
        [...LEGACY_PORTFOLIO_COLUMN_SNAPSHOT].sort(byColumnKey),
      );
      await setup.query(`
        INSERT INTO public.projects (id, title, category, description)
        VALUES ('project-fixture', 'Fixture project', 'Test', 'Migration fixture');
        INSERT INTO public.xyz_bullets (id, project_id, bullet_text)
        VALUES ('bullet-fixture', 'project-fixture', 'Verified migration');
        INSERT INTO public.skills_group (id, name)
        VALUES ('group-fixture', 'Fixture group');
        INSERT INTO public.skills_group_discipline (id, name)
        VALUES ('discipline-fixture', 'Legacy control-plane discipline');
        UPDATE public.skills_group
        SET discipline_id = 'discipline-fixture'
        WHERE id = 'group-fixture';
        INSERT INTO public.all_skills (id, name, grouping_id)
        VALUES ('skill-fixture', 'Fixture skill', 'group-fixture');
        INSERT INTO public.portfolio_skills (id, all_skill_id)
        VALUES ('portfolio-skill-fixture', 'skill-fixture');
        INSERT INTO public.ai_models (id, label, model_id, provider)
        VALUES ('model-fixture', 'Fixture model', 'fixture/model', 'fixture');
        ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
      `);
      await setup.query(
        `ALTER ROLE portfolio_legacy_reader_login PASSWORD '${readerPassword}'`,
      );
      await setup.query(readFileSync(
        path.resolve(process.cwd(), "infra", "supabase", "legacy-reader.sql"),
        "utf8",
      ));
    } finally {
      setup.release();
    }

    const source = new Client(postgresConnectionConfig(
      roleUrl(fixtureUrl, "portfolio_legacy_reader_login", readerPassword),
      undefined,
      "public",
    ));
    const target = await pool.connect();
    try {
      await source.connect();
      await assertPortfolioLegacyReaderDatabaseSession(source, PORTFOLIO_DATA_TABLES);
      const evidence = await bootstrapLegacyPortfolioData(source, target);
      const counts = new Map(evidence.map((item) => [item.table, item.rowCount]));
      assert.equal(counts.get("projects"), 1);
      assert.equal(counts.get("xyz_bullets"), 1);
      assert.equal(counts.get("skills_group"), 1);
      assert.equal(counts.get("all_skills"), 1);
      assert.equal(counts.get("portfolio_skills"), 1);
      assert.equal(counts.get("ai_models"), 1);
      assert.equal(evidence.length, PORTFOLIO_DATA_TABLES.length);
      assert.equal(evidence.every((item) => item.sourceRetained), true);
      assert.equal(evidence.find((item) => item.table === "projects")?.ownership, "hybrid");
      assert.equal(evidence.find((item) => item.table === "education")?.ownership, "projection");
      assert.equal(evidence.find((item) => item.table === "audit_logs")?.ownership, "owned");

      const sourceStillExists = await pool.query<{
        disciplineId: string;
        resumes: number;
        migrationRows: number;
      }>(`
        SELECT
          (SELECT discipline_id FROM public.skills_group WHERE id = 'group-fixture') AS "disciplineId",
          (SELECT count(*)::int FROM public.resumes) AS resumes,
          (SELECT count(*)::int FROM public.portfolio_schema_migrations) AS "migrationRows"
      `);
      assert.deepEqual(sourceStillExists.rows[0], {
        disciplineId: "discipline-fixture",
        resumes: 0,
        migrationRows: 0,
      });

      const targetColumns = await target.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'portfolio'
            AND table_name = 'skills_group'
            AND column_name = 'discipline_id'
        ) AS exists
      `);
      assert.equal(targetColumns.rows[0]?.exists, false);
      await assert.rejects(
        bootstrapLegacyPortfolioData(source, target),
        /target is not empty/i,
      );
    } finally {
      await source.end().catch(() => undefined);
      target.release();
    }
  } finally {
    if (pool) await pool.end();
    if (admin.connectionParameters.database) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      ).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});
