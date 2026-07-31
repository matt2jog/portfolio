import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";
import {
  assertPortfolioMigratorBootstrapSession,
  assertUnprivilegedDatabaseSession,
} from "../../shared/postgres-session";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });

after(async () => {
  await pool.end();
});

test("Portfolio has only migrator and runtime database boundaries", async () => {
  const roles = await pool.query<{ rolname: string }>(`
    SELECT rolname
    FROM pg_catalog.pg_roles
    WHERE rolname LIKE 'portfolio_%'
    ORDER BY rolname
  `);
  assert.deepEqual(roles.rows.map((row) => row.rolname), [
    "portfolio_migrator",
    "portfolio_migrator_login",
    "portfolio_runtime",
    "portfolio_runtime_login",
  ]);

  const memberships = await pool.query<{
    grantedRole: string;
    member: string;
    inheritOption: boolean;
    setOption: boolean;
  }>(`
    SELECT
      parent.rolname AS "grantedRole",
      member.rolname AS member,
      membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption"
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    WHERE parent.rolname LIKE 'portfolio_%' OR member.rolname LIKE 'portfolio_%'
    ORDER BY parent.rolname, member.rolname
  `);
  assert.deepEqual(memberships.rows, [
    {
      grantedRole: "portfolio_migrator",
      member: "portfolio_migrator_login",
      inheritOption: false,
      setOption: true,
    },
    {
      grantedRole: "portfolio_runtime",
      member: "portfolio_runtime_login",
      inheritOption: true,
      setOption: true,
    },
  ]);
});

test("runtime can perform only the CRUD used by the application", async () => {
  const client = await pool.connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SET ROLE portfolio_runtime");
    await client.query(
      `INSERT INTO portfolio.welcome_messages (id, slug, label, message)
       VALUES ($1, $2, 'Integration', 'Hello')`,
      [id, `integration-${id}`],
    );
    const selected = await client.query<{ message: string }>(
      "SELECT message FROM portfolio.welcome_messages WHERE id = $1",
      [id],
    );
    assert.equal(selected.rows[0]?.message, "Hello");
    await client.query(
      "UPDATE portfolio.welcome_messages SET message = 'Updated' WHERE id = $1",
      [id],
    );
    await client.query("DELETE FROM portfolio.welcome_messages WHERE id = $1", [id]);

    await client.query("SAVEPOINT denied_write");
    await assert.rejects(
      client.query(
        `INSERT INTO portfolio.personal_information
          (name, title, location, short_bio, email, phone, phone_formatted,
           linkedin_url, github_url, devpost_url, portfolio_url)
         VALUES ('x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x')`,
      ),
      (error: unknown) =>
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "42501",
    );
    await client.query("ROLLBACK TO SAVEPOINT denied_write");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});

test("Resume reads protected Portfolio views but not Portfolio tables", async () => {
  const client = await pool.connect();
  const profileId = randomUUID();
  const activeProjectId = randomUUID();
  const deletedProjectId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SET ROLE portfolio_migrator");
    await client.query(
      `INSERT INTO portfolio.personal_information
        (id, name, title, location, short_bio, email, phone, phone_formatted,
         linkedin_url, github_url, devpost_url, portfolio_url)
       VALUES ($1, 'Test User', 'Engineer', 'US', 'Bio', 'test@example.invalid',
         '+10000000000', '(000) 000-0000', 'https://linkedin.invalid',
         'https://github.invalid', 'https://devpost.invalid', 'https://portfolio.invalid')`,
      [profileId],
    );
    await client.query(
      `INSERT INTO portfolio.projects
        (id, title, category, description, deleted_at)
       VALUES
        ($1, 'Active', 'Test', 'Active project', NULL),
        ($2, 'Deleted', 'Test', 'Deleted project', now())`,
      [activeProjectId, deletedProjectId],
    );

    await client.query("RESET ROLE");
    await client.query("SET ROLE resume_app");
    const profile = await client.query<{ id: string }>(
      "SELECT id FROM portfolio.resume_cv_profile WHERE id = $1",
      [profileId],
    );
    assert.equal(profile.rows[0]?.id, profileId);
    const projects = await client.query<{ id: string }>(
      "SELECT id FROM portfolio.resume_projects WHERE id = ANY($1::varchar[]) ORDER BY id",
      [[activeProjectId, deletedProjectId]],
    );
    assert.deepEqual(projects.rows.map((row) => row.id), [activeProjectId]);

    await client.query("SAVEPOINT direct_table_denied");
    await assert.rejects(
      client.query("SELECT id FROM portfolio.projects LIMIT 1"),
      (error: unknown) =>
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "42501",
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_table_denied");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});

test("session checks establish the scoped runtime and migrator roles", async () => {
  const runtime = await pool.connect();
  try {
    await runtime.query("SET SESSION AUTHORIZATION portfolio_runtime_login");
    await assertUnprivilegedDatabaseSession(
      runtime,
      "portfolio_runtime",
      "Portfolio runtime",
    );
    await runtime.query("RESET ROLE");
    await runtime.query("RESET SESSION AUTHORIZATION");
  } finally {
    runtime.release();
  }

  const migrator = await pool.connect();
  try {
    await migrator.query("SET SESSION AUTHORIZATION portfolio_migrator_login");
    await assertPortfolioMigratorBootstrapSession(migrator);
    await migrator.query("RESET ROLE");
    await migrator.query("RESET SESSION AUTHORIZATION");
  } finally {
    migrator.release();
  }
});
