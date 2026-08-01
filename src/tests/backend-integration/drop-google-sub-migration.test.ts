import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const schema = `portfolio_auth0_phase2_${randomUUID().replaceAll("-", "")}`;
const quotedSchema = `"${schema}"`;
const migration = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"))
  .find(({ version }) => version === "012_drop_google_sub");
if (!migration) throw new Error("Portfolio google_sub removal migration is missing");

const subjectMatch = migration.sql.match(/expected_subject CONSTANT text := '([^']+)'/);
if (!subjectMatch?.[1]) throw new Error("Expected Portfolio Auth0 subject is missing");
const expectedSubject = subjectMatch[1];
const migrationSql = migration.sql.replace(
  "SET LOCAL search_path = portfolio, extensions, public;",
  `SET LOCAL search_path = ${quotedSchema}, public;`,
);

interface SeedUser {
  id: string;
  email: string;
  googleSub: string | null;
  auth0Sub: string | null;
  name: string;
  role: string;
  marker: string;
}

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  await pool.query(`
    CREATE TABLE ${quotedSchema}.users (
      id text PRIMARY KEY,
      email text NOT NULL,
      google_sub text,
      auth0_sub text,
      name text,
      role text NOT NULL,
      preserved_payload jsonb NOT NULL
    )
  `);
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

async function seed(users: readonly SeedUser[]): Promise<void> {
  await pool.query(`TRUNCATE ${quotedSchema}.users`);
  for (const user of users) {
    await pool.query(
      `INSERT INTO ${quotedSchema}.users
         (id, email, google_sub, auth0_sub, name, role, preserved_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        user.id,
        user.email,
        user.googleSub,
        user.auth0Sub,
        user.name,
        user.role,
        JSON.stringify({ marker: user.marker }),
      ],
    );
  }
}

async function googleSubExists(): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'users'
        AND column_name = 'google_sub'
    ) AS exists
  `, [schema]);
  return result.rows[0]?.exists ?? false;
}

async function legacySnapshot(): Promise<unknown[]> {
  const result = await pool.query(`
    SELECT id, email, google_sub, auth0_sub, name, role, preserved_payload
    FROM ${quotedSchema}.users
    ORDER BY id
  `);
  return result.rows;
}

async function expectMigrationFailure(pattern: RegExp): Promise<void> {
  const beforeRows = await legacySnapshot();
  await pool.query("BEGIN");
  try {
    await assert.rejects(pool.query(migrationSql), pattern);
  } finally {
    await pool.query("ROLLBACK");
  }
  assert.equal(await googleSubExists(), true);
  assert.deepEqual(await legacySnapshot(), beforeRows);
}

const designated = (auth0Sub: string | null): SeedUser => ({
  id: "designated",
  email: "matthewtujague@gmail.com",
  googleSub: "legacy-google-subject",
  auth0Sub,
  name: "Matthew Tujague",
  role: "admin",
  marker: "designated",
});

test("drops only google_sub after verifying the exact prebound administrator", async () => {
  await seed([
    designated(expectedSubject),
    {
      id: "preserved",
      email: "preserved@example.invalid",
      googleSub: "legacy-preserved",
      auth0Sub: null,
      name: "Preserved User",
      role: "user",
      marker: "preserved",
    },
  ]);

  await pool.query("BEGIN");
  try {
    await pool.query(migrationSql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  assert.equal(await googleSubExists(), false);
  const rows = await pool.query(`
    SELECT id, email, auth0_sub, name, role, preserved_payload
    FROM ${quotedSchema}.users
    ORDER BY id
  `);
  assert.deepEqual(rows.rows, [
    {
      id: "designated",
      email: "matthewtujague@gmail.com",
      auth0_sub: expectedSubject,
      name: "Matthew Tujague",
      role: "admin",
      preserved_payload: { marker: "designated" },
    },
    {
      id: "preserved",
      email: "preserved@example.invalid",
      auth0_sub: null,
      name: "Preserved User",
      role: "user",
      preserved_payload: { marker: "preserved" },
    },
  ]);
});

test("refuses a null designated Auth0 binding without changing the schema or rows", async () => {
  await pool.query(`ALTER TABLE ${quotedSchema}.users ADD COLUMN google_sub text`);
  await seed([designated(null)]);
  await expectMigrationFailure(/has no Auth0 subject/);
});

test("refuses a wrong designated Auth0 binding without changing the schema or rows", async () => {
  await seed([designated("auth0|wrong-subject")]);
  await expectMigrationFailure(/has the wrong Auth0 subject/);
});

test("refuses a subject conflict without changing the schema or rows", async () => {
  await seed([
    designated(expectedSubject),
    {
      id: "conflict",
      email: "conflict@example.invalid",
      googleSub: "legacy-conflict",
      auth0Sub: expectedSubject,
      name: "Conflicting User",
      role: "user",
      marker: "conflict",
    },
  ]);
  await expectMigrationFailure(/bound to another Portfolio user/);
});

test("refuses multiple designated administrator rows without changing anything", async () => {
  await seed([
    designated(expectedSubject),
    {
      ...designated(expectedSubject),
      id: "duplicate-designated",
      email: "MATTHEWTUJAGUE@gmail.com",
      marker: "duplicate",
    },
  ]);
  await expectMigrationFailure(/Expected exactly one designated Portfolio administrator, found 2/);
});
