import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const schema = `portfolio_auth0_phase1_${randomUUID().replaceAll("-", "")}`;
const quotedSchema = `"${schema}"`;
const migration = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"))
  .find(({ version }) => version === "011_bind_auth0_administrator");
if (!migration) throw new Error("Portfolio Auth0 administrator binding migration is missing");

const subjectMatch = migration.sql.match(/designated_subject CONSTANT text := '([^']+)'/);
if (!subjectMatch?.[1]) throw new Error("Portfolio Auth0 administrator subject is missing");
const designatedSubject = subjectMatch[1];
const migrationSql = migration.sql.replace(
  "SET LOCAL search_path = portfolio, extensions, public;",
  `SET LOCAL search_path = ${quotedSchema}, public;`,
);

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  await pool.query(`
    CREATE TABLE ${quotedSchema}.users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      google_sub text UNIQUE,
      auth0_sub text UNIQUE,
      name text,
      role text NOT NULL,
      preserved_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("legacy schema binds the designated Auth0 subject without dropping google_sub or changing other data", async () => {
  await pool.query(`TRUNCATE ${quotedSchema}.users`);
  await pool.query(
    `INSERT INTO ${quotedSchema}.users
       (id, email, google_sub, auth0_sub, name, role, preserved_payload)
     VALUES
       ('designated', 'matthewtujague@gmail.com', 'legacy-google-subject', NULL,
        'Matthew Tujague', 'admin', '{"marker":"designated"}'),
       ('preserved', 'preserved@example.invalid', 'legacy-preserved', NULL,
        'Preserved User', 'user', '{"marker":"preserved"}')`,
  );

  await pool.query("BEGIN");
  try {
    await pool.query(migrationSql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  const rows = await pool.query<{
    id: string;
    google_sub: string | null;
    auth0_sub: string | null;
    preserved_payload: { marker: string };
  }>(`
    SELECT id, google_sub, auth0_sub, preserved_payload
    FROM ${quotedSchema}.users
    ORDER BY id
  `);
  assert.deepEqual(rows.rows, [
    {
      id: "designated",
      google_sub: "legacy-google-subject",
      auth0_sub: designatedSubject,
      preserved_payload: { marker: "designated" },
    },
    {
      id: "preserved",
      google_sub: "legacy-preserved",
      auth0_sub: null,
      preserved_payload: { marker: "preserved" },
    },
  ]);

  const legacyColumn = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'users'
        AND column_name = 'google_sub'
    ) AS exists
  `, [schema]);
  assert.equal(legacyColumn.rows[0]?.exists, true);
});

test("a subject conflict aborts the migration and preserves every row", async () => {
  await pool.query(`TRUNCATE ${quotedSchema}.users`);
  await pool.query(
    `INSERT INTO ${quotedSchema}.users
       (id, email, google_sub, auth0_sub, name, role, preserved_payload)
     VALUES
       ('designated', 'matthewtujague@gmail.com', 'legacy-designated', NULL,
        'Matthew Tujague', 'admin', '{"marker":"designated"}'),
       ('conflict', 'conflict@example.invalid', 'legacy-conflict', $1,
        'Conflicting User', 'user', '{"marker":"conflict"}')`,
    [designatedSubject],
  );

  await pool.query("BEGIN");
  try {
    await assert.rejects(pool.query(migrationSql), /already bound to another Portfolio user/);
  } finally {
    await pool.query("ROLLBACK");
  }

  const rows = await pool.query<{
    id: string;
    google_sub: string | null;
    auth0_sub: string | null;
    preserved_payload: { marker: string };
  }>(`
    SELECT id, google_sub, auth0_sub, preserved_payload
    FROM ${quotedSchema}.users
    ORDER BY id
  `);
  assert.deepEqual(rows.rows, [
    {
      id: "conflict",
      google_sub: "legacy-conflict",
      auth0_sub: designatedSubject,
      preserved_payload: { marker: "conflict" },
    },
    {
      id: "designated",
      google_sub: "legacy-designated",
      auth0_sub: null,
      preserved_payload: { marker: "designated" },
    },
  ]);
});

test("a conflicting subject on the designated row also rolls back", async () => {
  await pool.query(`TRUNCATE ${quotedSchema}.users`);
  await pool.query(
    `INSERT INTO ${quotedSchema}.users
       (id, email, google_sub, auth0_sub, name, role, preserved_payload)
     VALUES
       ('designated', 'matthewtujague@gmail.com', 'legacy-designated',
        'auth0|different-subject', 'Matthew Tujague', 'admin', '{"marker":"unchanged"}')`,
  );

  await pool.query("BEGIN");
  try {
    await assert.rejects(
      pool.query(migrationSql),
      /Designated Portfolio administrator has a conflicting Auth0 subject/,
    );
  } finally {
    await pool.query("ROLLBACK");
  }

  const row = await pool.query<{
    google_sub: string;
    auth0_sub: string;
    preserved_payload: { marker: string };
  }>(`
    SELECT google_sub, auth0_sub, preserved_payload
    FROM ${quotedSchema}.users
    WHERE id = 'designated'
  `);
  assert.deepEqual(row.rows[0], {
    google_sub: "legacy-designated",
    auth0_sub: "auth0|different-subject",
    preserved_payload: { marker: "unchanged" },
  });
});
