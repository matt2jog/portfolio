import assert from "node:assert/strict";
import path from "node:path";
import { after, test } from "node:test";
import type { PoolClient } from "pg";
import { Pool } from "pg";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const migration = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"))
  .find(({ version }) => version === "005_portfolio_experience_bullets");
if (!migration) throw new Error("Portfolio experience-bullet migration is missing");

after(async () => {
  await pool.end();
});

async function prepareLegacyState(
  client: PoolClient,
  bulletCount: number,
): Promise<void> {
  await client.query("DROP VIEW portfolio.resume_experience_bullets");
  await client.query("DROP TABLE portfolio.experience_bullets");
  await client.query("SET ROLE portfolio_migrator");
  await client.query(`
    CREATE VIEW portfolio.resume_experience_bullets AS
    SELECT
      id,
      id AS experience_id,
      description AS text,
      0::integer AS position,
      created_at,
      updated_at
    FROM portfolio.experiences
    WHERE length(trim(description)) > 0
  `);
  await client.query("RESET ROLE");

  await client.query("DROP TABLE IF EXISTS public.experience_bullets");
  await client.query(`
    CREATE TABLE public.experience_bullets (
      id varchar PRIMARY KEY,
      experience_id varchar NOT NULL,
      bullet_text text NOT NULL,
      position integer NOT NULL,
      created_at timestamp NOT NULL,
      updated_at timestamp NOT NULL
    )
  `);
  await client.query(`
    INSERT INTO portfolio.experiences (
      id,
      role,
      company,
      location,
      duration,
      description,
      position,
      created_at,
      updated_at
    )
    VALUES (
      'legacy-experience',
      'Engineer',
      'Legacy Company',
      'Remote',
      '2020–2024',
      'This synthesized row must be replaced by exact bullets.',
      0,
      '2024-01-01 00:00:00',
      '2024-02-01 00:00:00'
    )
  `);

  for (let index = 0; index < bulletCount; index += 1) {
    await client.query(
      `
        INSERT INTO public.experience_bullets (
          id,
          experience_id,
          bullet_text,
          position,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          'legacy-experience',
          $2,
          $3::integer,
          '2024-03-01 00:00:00'::timestamp + ($3::integer * interval '1 minute'),
          '2024-04-01 00:00:00'::timestamp + ($3::integer * interval '1 minute')
        )
      `,
      [
        `legacy-bullet-${String(index + 1).padStart(2, "0")}`,
        `Exact legacy bullet ${index + 1} — punctuation stays intact.`,
        index,
      ],
    );
  }
}

async function rollbackTestTransaction(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.query("RESET ROLE").catch(() => undefined);
}

test("migration imports all 12 exact rows and leaves only the intended read paths", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await prepareLegacyState(client, 12);
    await client.query(
      "GRANT SELECT ON TABLE public.experience_bullets TO portfolio_migrator",
    );
    await client.query("SET ROLE portfolio_migrator");
    await client.query(migration.sql);
    await client.query("RESET ROLE");
    await client.query(
      "REVOKE SELECT ON TABLE public.experience_bullets FROM portfolio_migrator",
    );

    const source = await client.query(`
      SELECT
        id,
        experience_id,
        bullet_text AS text,
        position,
        created_at::text,
        updated_at::text
      FROM public.experience_bullets
      ORDER BY experience_id, position, id
    `);
    const imported = await client.query(`
      SELECT
        id,
        experience_id,
        bullet_text AS text,
        position,
        created_at::text,
        updated_at::text
      FROM portfolio.experience_bullets
      ORDER BY experience_id, position, id
    `);
    const projected = await client.query(`
      SELECT
        id,
        experience_id,
        text,
        position,
        created_at::text,
        updated_at::text
      FROM portfolio.resume_experience_bullets
      ORDER BY experience_id, position, id
    `);
    assert.equal(imported.rowCount, 12);
    assert.deepEqual(imported.rows, source.rows);
    assert.deepEqual(projected.rows, source.rows);

    const integrity = await client.query<{
      cascadingForeignKey: boolean;
      parentLookupIndex: boolean;
    }>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_constraint
          WHERE conrelid = 'portfolio.experience_bullets'::regclass
            AND conname = 'experience_bullets_experience_id_experiences_id_fk'
            AND contype = 'f'
            AND confrelid = 'portfolio.experiences'::regclass
            AND confdeltype = 'c'
        ) AS "cascadingForeignKey",
        to_regclass(
          'portfolio.experience_bullets_experience_id_position_idx'
        ) IS NOT NULL AS "parentLookupIndex"
    `);
    assert.deepEqual(integrity.rows[0], {
      cascadingForeignKey: true,
      parentLookupIndex: true,
    });

    const privileges = await client.query<{
      runtimeSelect: boolean;
      runtimeInsert: boolean;
      resumeTableSelect: boolean;
      resumeViewSelect: boolean;
      migratorLegacySelect: boolean;
    }>(`
      SELECT
        has_table_privilege(
          'portfolio_runtime',
          'portfolio.experience_bullets',
          'SELECT'
        ) AS "runtimeSelect",
        has_table_privilege(
          'portfolio_runtime',
          'portfolio.experience_bullets',
          'INSERT'
        ) AS "runtimeInsert",
        has_table_privilege(
          'resume_app',
          'portfolio.experience_bullets',
          'SELECT'
        ) AS "resumeTableSelect",
        has_table_privilege(
          'resume_app',
          'portfolio.resume_experience_bullets',
          'SELECT'
        ) AS "resumeViewSelect",
        has_table_privilege(
          'portfolio_migrator',
          'public.experience_bullets',
          'SELECT'
        ) AS "migratorLegacySelect"
    `);
    assert.deepEqual(privileges.rows[0], {
      runtimeSelect: true,
      runtimeInsert: false,
      resumeTableSelect: false,
      resumeViewSelect: true,
      migratorLegacySelect: false,
    });

    await client.query("SET ROLE portfolio_runtime");
    const runtimeRows = await client.query(
      "SELECT id FROM portfolio.experience_bullets ORDER BY position",
    );
    assert.equal(runtimeRows.rowCount, 12);
    await client.query("RESET ROLE");

    await client.query("SET ROLE resume_app");
    const resumeRows = await client.query(
      "SELECT id FROM portfolio.resume_experience_bullets ORDER BY position",
    );
    assert.equal(resumeRows.rowCount, 12);
    await client.query("SAVEPOINT direct_table_denied");
    await assert.rejects(
      client.query("SELECT id FROM portfolio.experience_bullets LIMIT 1"),
      (error: unknown) =>
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "42501",
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_table_denied");
  } finally {
    await rollbackTestTransaction(client);
    client.release();
  }
});

test("migration refuses the legacy source without the temporary read grant", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await prepareLegacyState(client, 12);
    await client.query("SET ROLE portfolio_migrator");
    await client.query("SAVEPOINT migration_attempt");
    await assert.rejects(
      client.query(migration.sql),
      /temporary SELECT grant on public\.experience_bullets/,
    );
    await client.query("ROLLBACK TO SAVEPOINT migration_attempt");

    const target = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('portfolio.experience_bullets')::text AS relation",
    );
    assert.equal(target.rows[0]?.relation, null);
  } finally {
    await rollbackTestTransaction(client);
    client.release();
  }
});

test("migration rejects row-count drift and rolls every schema change back", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await prepareLegacyState(client, 11);
    await client.query(
      "GRANT SELECT ON TABLE public.experience_bullets TO portfolio_migrator",
    );
    await client.query("SET ROLE portfolio_migrator");
    await client.query("SAVEPOINT migration_attempt");
    await assert.rejects(
      client.query(migration.sql),
      /Expected exactly 12 legacy experience bullets, found 11/,
    );
    await client.query("ROLLBACK TO SAVEPOINT migration_attempt");

    const target = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('portfolio.experience_bullets')::text AS relation",
    );
    assert.equal(target.rows[0]?.relation, null);
    const oldView = await client.query<{ definition: string }>(
      "SELECT pg_get_viewdef('portfolio.resume_experience_bullets'::regclass, true) AS definition",
    );
    assert.match(oldView.rows[0]?.definition ?? "", /description AS text/);
  } finally {
    await rollbackTestTransaction(client);
    client.release();
  }
});
