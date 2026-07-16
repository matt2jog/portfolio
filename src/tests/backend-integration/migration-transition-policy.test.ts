import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { Client, Pool, type PoolClient } from "pg";
import {
  applyPortfolioMigrations,
  loadMigrationPlan,
  type PortfolioMigration,
} from "../../scripts/migration-ledger";
import {
  PORTFOLIO_MIGRATION_POLICY,
  withMigrationTransitionPolicy,
} from "../../scripts/migration-transition-policy";
import { postgresConnectionConfig } from "../../shared/postgres-tls";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for migration integration tests");

async function createLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE portfolio.schema_migrations (
      filename text PRIMARY KEY,
      journal_timestamp bigint NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

async function rebuildPartialPrefix(
  client: PoolClient,
  plan: readonly PortfolioMigration[],
  prefixLength: number,
): Promise<void> {
  await client.query(`
    DROP SCHEMA IF EXISTS portfolio CASCADE;
    CREATE SCHEMA portfolio AUTHORIZATION portfolio_migrator;
    SET search_path = portfolio, extensions;
  `);
  await createLedger(client);
  for (const migration of plan.slice(0, prefixLength)) {
    for (const statement of migration.statements) await client.query(statement);
    await client.query(
      `INSERT INTO portfolio.schema_migrations
         (filename, journal_timestamp, checksum)
       VALUES ($1, $2::bigint, $3)`,
      [migration.filename, String(migration.journalTimestamp), migration.checksum],
    );
  }
}

test("transition control permits only empty historical cutover or a complete no-op", async () => {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = `portfolio_transition_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(parsedUrl.toString());
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  let adminConnected = false;
  let pool: Pool | undefined;
  try {
    await admin.connect();
    adminConnected = true;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const fixtureUrl = new URL(parsedUrl.toString());
    fixtureUrl.pathname = `/${databaseName}`;
    pool = new Pool({
      ...postgresConnectionConfig(fixtureUrl.toString(), undefined, "portfolio, extensions"),
      max: 1,
    });
    const client = await pool.connect();
    try {
      await client.query("SET portfolio.test_admin_migration = 'on'");
      const plan = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"));
      const historicalCount = PORTFOLIO_MIGRATION_POLICY.historicalBatch.migrationCount;
      await client.query(`
        CREATE SCHEMA portfolio AUTHORIZATION portfolio_migrator;
        CREATE SCHEMA extensions;
        CREATE EXTENSION vector WITH SCHEMA extensions;
      `);

      const firstCutover = await withMigrationTransitionPolicy(
        client,
        plan,
        () => applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
      );
      assert.deepEqual(firstCutover, {
        adopted: 0,
        applied: plan.length,
        total: plan.length,
      });

      const completeNoOp = await withMigrationTransitionPolicy(
        client,
        plan,
        () => applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
      );
      assert.deepEqual(completeNoOp, {
        adopted: 0,
        applied: 0,
        total: plan.length,
      });

      for (let prefixLength = 1; prefixLength < historicalCount; prefixLength++) {
        await rebuildPartialPrefix(client, plan, prefixLength);
        let callbackRan = false;
        await assert.rejects(
          withMigrationTransitionPolicy(client, plan, async () => {
            callbackRan = true;
          }),
          new RegExp(`partial prefix ${prefixLength}/${historicalCount}`, "i"),
        );
        assert.equal(callbackRan, false, `prefix ${prefixLength} reached migration execution`);
      }

      await rebuildPartialPrefix(client, plan, 11);
      await client.query(`
        INSERT INTO portfolio.skills_group (id, name)
        VALUES ('valid-group', 'Valid group');
        INSERT INTO portfolio.all_skills (id, name, grouping_id)
        VALUES
          ('valid-skill', 'Valid skill', 'valid-group'),
          ('dangling-skill', 'Dangling skill', 'missing-group');
        INSERT INTO portfolio.portfolio_skills (id, all_skill_id, position)
        VALUES
          ('valid-presentation', 'valid-skill', 0),
          ('dangling-presentation', 'missing-skill', 1);
      `);

      await assert.rejects(
        withMigrationTransitionPolicy(
          client,
          plan,
          () => applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
        ),
        /partial prefix 11\/15/i,
      );
      assert.deepEqual(
        (await client.query(`
          SELECT id, grouping_id AS "groupingId"
          FROM portfolio.all_skills
          ORDER BY id
        `)).rows,
        [
          { id: "dangling-skill", groupingId: "missing-group" },
          { id: "valid-skill", groupingId: "valid-group" },
        ],
      );
      assert.deepEqual(
        (await client.query(`
          SELECT id, all_skill_id AS "allSkillId"
          FROM portfolio.portfolio_skills
          ORDER BY id
        `)).rows,
        [
          { id: "dangling-presentation", allSkillId: "missing-skill" },
          { id: "valid-presentation", allSkillId: "valid-skill" },
        ],
      );
    } finally {
      client.release();
    }
  } finally {
    if (pool) await pool.end();
    if (adminConnected) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      ).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});
