import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { Client, Pool } from "pg";
import {
  applyPortfolioMigrations,
  assertCanonicalLedgerPrefix,
  loadMigrationPlan,
} from "../../scripts/migration-ledger";
import { postgresConnectionConfig } from "../../shared/postgres-tls";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "TEST_DATABASE_URL is required for migration integration tests",
  );

const expectedTables = [
  "admin_policy_acceptance",
  "ai_models",
  "all_skills",
  "audit_logs",
  "bio",
  "bio_paragraphs",
  "browser_request_logs",
  "browser_tracking",
  "browser_tracking_ips",
  "career_event_checkpoints",
  "career_event_inbox",
  "career_event_quarantine",
  "database_audit_activation",
  "database_audit_chain_heads",
  "database_audit_releases",
  "database_compensation_payloads",
  "database_mutation_audit",
  "education",
  "experiences",
  "github_timeline_events",
  "ip_rate_logs",
  "legal_document_versions",
  "linkedin_timeline_events",
  "personal_information",
  "portfolio_skills",
  "projects",
  "schema_migrations",
  "session",
  "skills_group",
  "users",
  "welcome_messages",
  "xyz_bullets",
] as const;

test("migration ledger is complete, idempotent, and isolated to the Portfolio schema", async () => {
  const pool = new Pool({
    ...postgresConnectionConfig(
      databaseUrl,
      undefined,
      "portfolio, extensions",
    ),
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("SET portfolio.test_admin_migration = 'on'");
    const plan = loadMigrationPlan(
      path.resolve(process.cwd(), "src", "migrations"),
    );
    const rerun = await applyPortfolioMigrations(client, plan, {
      allowSchemaBootstrap: false,
    });
    assert.deepEqual(rerun, { adopted: 0, applied: 0, total: plan.length });

    const ledger = await client.query<{
      filename: string;
      journalTimestamp: string;
      checksum: string;
    }>(`
      SELECT filename, journal_timestamp::text AS "journalTimestamp", checksum
      FROM portfolio.schema_migrations
    `);
    assert.equal(assertCanonicalLedgerPrefix(plan, ledger.rows), plan.length);

    const tables = await client.query<{ name: string }>(`
      SELECT object.relname AS name
      FROM pg_class object
      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'portfolio' AND object.relkind IN ('r', 'p')
      ORDER BY object.relname
    `);
    assert.deepEqual(
      tables.rows.map((row) => row.name),
      [...expectedTables].sort(),
    );

    const leaked = await client.query<{ name: string }>(
      `
      SELECT object.relname AS name
      FROM pg_class object
      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'public'
        AND object.relname = ANY($1::text[])
    `,
      [[...expectedTables]],
    );
    assert.deepEqual(leaked.rows, []);
    assert.equal(
      (
        await client.query(
          "SELECT to_regclass('portfolio.legal_document_active_ranges') IS NOT NULL AS exists",
        )
      ).rows[0]?.exists,
      true,
    );

    const vectorExtension = await client.query<{ schemaName: string }>(`
      SELECT namespace.nspname AS "schemaName"
      FROM pg_extension extension
      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      WHERE extension.extname = 'vector'
    `);
    assert.deepEqual(vectorExtension.rows, [{ schemaName: "extensions" }]);
    assert.equal(
      (
        await client.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_type type
          JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
          WHERE type.typname = 'vector' AND namespace.nspname = 'portfolio'
        ) AS exists
      `)
      ).rows[0]?.exists,
      false,
    );
  } finally {
    client.release();
    await pool.end();
  }
});

test("every checksum-bound migration prefix replays to the same OID-independent schema", async () => {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = `portfolio_prefixes_${randomUUID().replaceAll("-", "")}`;
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
      ...postgresConnectionConfig(
        fixtureUrl.toString(),
        undefined,
        "portfolio, extensions",
      ),
      max: 1,
    });
    const client = await pool.connect();
    try {
      await client.query("SET portfolio.test_admin_migration = 'on'");
      const plan = loadMigrationPlan(
        path.resolve(process.cwd(), "src", "migrations"),
      );
      await client.query(`
        CREATE SCHEMA extensions;
        CREATE EXTENSION vector WITH SCHEMA extensions;
      `);

      for (let prefixLength = 0; prefixLength <= plan.length; prefixLength++) {
        await client.query(`
          DROP SCHEMA IF EXISTS portfolio CASCADE;
          CREATE SCHEMA oid_noise_${prefixLength};
          CREATE TABLE oid_noise_${prefixLength}.consumed_oid (id integer);
          DROP SCHEMA oid_noise_${prefixLength} CASCADE;
          CREATE SCHEMA portfolio AUTHORIZATION portfolio_migrator;
          SET search_path = portfolio, extensions;
          CREATE TABLE portfolio.schema_migrations (
            filename text PRIMARY KEY,
            journal_timestamp bigint NOT NULL UNIQUE,
            checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
            applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
          );
        `);
        for (const migration of plan.slice(0, prefixLength)) {
          for (const statement of migration.statements)
            await client.query(statement);
          await client.query(
            `INSERT INTO portfolio.schema_migrations
               (filename, journal_timestamp, checksum)
             VALUES ($1, $2::bigint, $3)`,
            [
              migration.filename,
              String(migration.journalTimestamp),
              migration.checksum,
            ],
          );
        }

        if (prefixLength === plan.length) {
          await client.query(`
            INSERT INTO portfolio.welcome_messages (slug, label, message)
            VALUES ('fingerprint-data', 'Fingerprint data', 'Rows are not schema state')
          `);
        }

        const result = await applyPortfolioMigrations(client, plan, {
          allowSchemaBootstrap: false,
        });
        assert.deepEqual(result, {
          adopted: 0,
          applied: plan.length - prefixLength,
          total: plan.length,
        });
        if (prefixLength === plan.length) {
          assert.equal(
            (
              await client.query(
                "SELECT count(*)::int AS count FROM portfolio.welcome_messages WHERE slug = 'fingerprint-data'",
              )
            ).rows[0]?.count,
            1,
          );
        }
      }
    } finally {
      client.release();
    }
  } finally {
    if (pool) await pool.end();
    if (admin.connectionParameters.database) {
      await admin
        .query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [databaseName],
        )
        .catch(() => undefined);
      await admin
        .query(`DROP DATABASE IF EXISTS "${databaseName}"`)
        .catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});

test("a legacy public ledger is evidence only and never substitutes for private-schema DDL", async () => {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = `portfolio_ledger_${randomUUID().replaceAll("-", "")}`;
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
      ...postgresConnectionConfig(
        fixtureUrl.toString(),
        undefined,
        "portfolio, extensions",
      ),
      max: 1,
    });
    const client = await pool.connect();
    try {
      await client.query("SET portfolio.test_admin_migration = 'on'");
      const plan = loadMigrationPlan(
        path.resolve(process.cwd(), "src", "migrations"),
      );
      await client.query(`
        CREATE SCHEMA portfolio AUTHORIZATION portfolio_migrator;
        CREATE SCHEMA extensions;
        CREATE EXTENSION vector WITH SCHEMA extensions;
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint NOT NULL
        );
        CREATE TABLE public.legacy_portfolio_sentinel (
          id text PRIMARY KEY,
          payload text NOT NULL
        );
        INSERT INTO public.legacy_portfolio_sentinel (id, payload)
        VALUES ('legacy', 'must remain unchanged');
      `);
      for (const migration of plan.slice(0, 13)) {
        await client.query(
          "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2::bigint)",
          [migration.checksum, String(migration.journalTimestamp)],
        );
      }

      await client.query(`
        CREATE TABLE portfolio.schema_migrations (
          filename text PRIMARY KEY,
          journal_timestamp bigint NOT NULL UNIQUE,
          checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
          applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
        )
      `);
      for (const migration of plan) {
        await client.query(
          `INSERT INTO portfolio.schema_migrations
             (filename, journal_timestamp, checksum)
           VALUES ($1, $2::bigint, $3)`,
          [
            migration.filename,
            String(migration.journalTimestamp),
            migration.checksum,
          ],
        );
      }
      await assert.rejects(
        applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
        /schema fingerprint/i,
        "a forged complete ledger must not suppress every migration",
      );
      await client.query("DROP TABLE portfolio.schema_migrations");

      await client.query(`
        CREATE FUNCTION portfolio.unledgered_marker()
        RETURNS integer
        LANGUAGE sql
        IMMUTABLE
        AS 'SELECT 1';
      `);
      await assert.rejects(
        applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
        /schema fingerprint/i,
      );
      await client.query("DROP FUNCTION portfolio.unledgered_marker()");

      await client.query(
        "CREATE TYPE portfolio.unledgered_status AS ENUM ('pending')",
      );
      await assert.rejects(
        applyPortfolioMigrations(client, plan, { allowSchemaBootstrap: false }),
        /schema fingerprint/i,
      );
      await client.query("DROP TYPE portfolio.unledgered_status");

      const prefixLength = 7;
      await client.query(`
        CREATE TABLE portfolio.schema_migrations (
          filename text PRIMARY KEY,
          journal_timestamp bigint NOT NULL UNIQUE,
          checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
          applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        SET search_path = portfolio, extensions;
      `);
      for (const migration of plan.slice(0, prefixLength)) {
        for (const statement of migration.statements)
          await client.query(statement);
        await client.query(
          `INSERT INTO portfolio.schema_migrations
             (filename, journal_timestamp, checksum)
           VALUES ($1, $2::bigint, $3)`,
          [
            migration.filename,
            String(migration.journalTimestamp),
            migration.checksum,
          ],
        );
      }

      const result = await applyPortfolioMigrations(client, plan, {
        allowSchemaBootstrap: false,
      });
      assert.deepEqual(result, {
        adopted: 0,
        applied: plan.length - prefixLength,
        total: plan.length,
      });
      assert.equal(
        (
          await client.query(
            "SELECT to_regclass('portfolio.projects') IS NOT NULL AS exists",
          )
        ).rows[0]?.exists,
        true,
      );
      assert.deepEqual(
        (
          await client.query(
            "SELECT id, payload FROM public.legacy_portfolio_sentinel",
          )
        ).rows,
        [{ id: "legacy", payload: "must remain unchanged" }],
      );
      assert.equal(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
          )
        ).rows[0]?.count,
        13,
      );

      const assertFingerprintRejects = async (
        message: string,
      ): Promise<void> => {
        await assert.rejects(
          applyPortfolioMigrations(client, plan, {
            allowSchemaBootstrap: false,
          }),
          /schema fingerprint/i,
          message,
        );
      };

      await client.query(
        "CREATE TABLE portfolio.unexpected_relation (id integer)",
      );
      await assertFingerprintRejects("an extra relation must be rejected");
      await client.query("DROP TABLE portfolio.unexpected_relation");

      await client.query(`
        CREATE FUNCTION portfolio.unexpected_routine()
        RETURNS integer
        LANGUAGE sql
        IMMUTABLE
        AS 'SELECT 1'
      `);
      await assertFingerprintRejects("an extra routine must be rejected");
      await client.query("DROP FUNCTION portfolio.unexpected_routine()");

      await client.query(
        "CREATE TYPE portfolio.unexpected_status AS ENUM ('pending')",
      );
      await assertFingerprintRejects(
        "an extra standalone type must be rejected",
      );
      await client.query("DROP TYPE portfolio.unexpected_status");

      await client.query(`
        CREATE POLICY unexpected_legal_reader
          ON portfolio.legal_document_versions
          FOR SELECT
          TO PUBLIC
          USING (true)
      `);
      await assertFingerprintRejects(
        "an extra row-security policy must be rejected",
      );
      await client.query(
        "DROP POLICY unexpected_legal_reader ON portfolio.legal_document_versions",
      );

      await client.query(`
        CREATE FUNCTION portfolio.unexpected_trigger_fn()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER unexpected_trigger
          BEFORE INSERT ON portfolio.projects
          FOR EACH ROW EXECUTE FUNCTION portfolio.unexpected_trigger_fn();
      `);
      await assertFingerprintRejects("an extra trigger must be rejected");
      await client.query(
        "DROP TRIGGER unexpected_trigger ON portfolio.projects",
      );
      await client.query("DROP FUNCTION portfolio.unexpected_trigger_fn()");

      await client.query(
        "ALTER TABLE portfolio.projects ADD CONSTRAINT unexpected_check CHECK (position >= 0)",
      );
      await assertFingerprintRejects("an extra constraint must be rejected");
      await client.query(
        "ALTER TABLE portfolio.projects DROP CONSTRAINT unexpected_check",
      );

      await client.query(
        "ALTER TABLE portfolio.projects ALTER COLUMN created_at SET DEFAULT '2000-01-01'::timestamp",
      );
      await assertFingerprintRejects(
        "a changed column default must be rejected",
      );
      await client.query(
        "ALTER TABLE portfolio.projects ALTER COLUMN created_at SET DEFAULT now()",
      );

      await client.query("DROP INDEX portfolio.browser_request_logs_uuid_idx");
      await assertFingerprintRejects("a missing index must be rejected");
      await client.query(
        "CREATE INDEX browser_request_logs_uuid_idx ON portfolio.browser_request_logs (hashed_uuid)",
      );

      await client.query(
        "ALTER TABLE portfolio.legal_document_versions FORCE ROW LEVEL SECURITY",
      );
      await assertFingerprintRejects(
        "row-security force drift must be rejected",
      );
      await client.query(
        "ALTER TABLE portfolio.legal_document_versions NO FORCE ROW LEVEL SECURITY",
      );

      await client.query("DROP ROLE IF EXISTS portfolio_unexpected_owner");
      await client.query("CREATE ROLE portfolio_unexpected_owner NOLOGIN");
      await client.query(
        "ALTER TABLE portfolio.projects OWNER TO portfolio_unexpected_owner",
      );
      await assertFingerprintRejects("object ownership drift must be rejected");
      await client.query(
        "ALTER TABLE portfolio.projects OWNER TO CURRENT_USER",
      );
      await client.query("DROP ROLE portfolio_unexpected_owner");

      await client.query("ALTER TABLE portfolio.welcome_messages SET UNLOGGED");
      await assertFingerprintRejects(
        "unexpected UNLOGGED persistence must be rejected",
      );
      await client.query("ALTER TABLE portfolio.welcome_messages SET LOGGED");

      await client.query("DROP ROLE IF EXISTS portfolio_unexpected_schema_owner");
      await client.query(
        "CREATE ROLE portfolio_unexpected_schema_owner NOLOGIN",
      );
      await client.query(
        "ALTER SCHEMA portfolio OWNER TO portfolio_unexpected_schema_owner",
      );
      await assertFingerprintRejects("schema ownership drift must be rejected");
      await client.query("ALTER SCHEMA portfolio OWNER TO portfolio_migrator");
      await client.query("DROP ROLE portfolio_unexpected_schema_owner");

      await client.query(
        "CREATE TYPE portfolio.unexpected_composite AS (value integer)",
      );
      await assertFingerprintRejects(
        "an extra standalone composite type must be rejected",
      );
      await client.query("DROP TYPE portfolio.unexpected_composite");

      await client.query(
        "CREATE DOMAIN portfolio.unexpected_domain AS integer CHECK (VALUE >= 0)",
      );
      await assertFingerprintRejects("an extra domain type must be rejected");
      await client.query("DROP DOMAIN portfolio.unexpected_domain");

      await client.query(
        "CREATE TYPE portfolio.unexpected_range AS RANGE (subtype = integer)",
      );
      await assertFingerprintRejects("an extra range type must be rejected");
      await client.query("DROP TYPE portfolio.unexpected_range");

      await client.query(
        "CREATE OPERATOR FAMILY portfolio.unexpected_family USING btree",
      );
      await assertFingerprintRejects(
        "an extra operator family must be rejected",
      );
      await client.query(
        "DROP OPERATOR FAMILY portfolio.unexpected_family USING btree",
      );

      await client.query(`
        CREATE TEXT SEARCH CONFIGURATION portfolio.unexpected_fts
          (COPY = pg_catalog.english)
      `);
      await assertFingerprintRejects(
        "an extra text-search configuration must be rejected",
      );
      await client.query(
        "DROP TEXT SEARCH CONFIGURATION portfolio.unexpected_fts",
      );

      await client.query(`
        CREATE STATISTICS portfolio.unexpected_statistics (dependencies)
          ON label, message
          FROM portfolio.welcome_messages
      `);
      await assertFingerprintRejects(
        "an extra extended-statistics object must be rejected",
      );
      await client.query("DROP STATISTICS portfolio.unexpected_statistics");

      await client.query(`
        CREATE RULE unexpected_welcome_insert AS
          ON INSERT TO portfolio.welcome_messages DO ALSO NOTHING
      `);
      await assertFingerprintRejects("an extra rewrite rule must be rejected");
      await client.query(
        "DROP RULE unexpected_welcome_insert ON portfolio.welcome_messages",
      );

      await client.query(`
        CREATE FUNCTION portfolio.unexpected_disabled_trigger_fn()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER unexpected_disabled_trigger
          BEFORE INSERT ON portfolio.welcome_messages
          FOR EACH ROW EXECUTE FUNCTION portfolio.unexpected_disabled_trigger_fn();
        ALTER TABLE portfolio.welcome_messages DISABLE TRIGGER unexpected_disabled_trigger;
      `);
      await assertFingerprintRejects(
        "a disabled unexpected trigger must be rejected",
      );
      await client.query(`
        DROP TRIGGER unexpected_disabled_trigger ON portfolio.welcome_messages;
        DROP FUNCTION portfolio.unexpected_disabled_trigger_fn();
      `);

      await client.query(`
        INSERT INTO portfolio.welcome_messages (slug, label, message)
        VALUES ('fingerprint-row-state', 'Row state', 'Data must not affect the schema digest')
      `);

      const finalRerun = await applyPortfolioMigrations(client, plan, {
        allowSchemaBootstrap: false,
      });
      assert.deepEqual(finalRerun, {
        adopted: 0,
        applied: 0,
        total: plan.length,
      });

      await client.query(`
        ALTER TABLE portfolio.projects ADD COLUMN fingerprint_tombstone text;
        ALTER TABLE portfolio.projects DROP COLUMN fingerprint_tombstone;
      `);
      await assertFingerprintRejects(
        "an unexpected dropped-column slot must be rejected",
      );
    } finally {
      client.release();
    }
  } finally {
    if (pool) await pool.end();
    if (admin.connectionParameters.database) {
      await admin
        .query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [databaseName],
        )
        .catch(() => undefined);
      await admin
        .query(`DROP DATABASE IF EXISTS "${databaseName}"`)
        .catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});
