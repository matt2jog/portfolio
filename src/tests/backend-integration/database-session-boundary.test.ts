import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Client, Pool, type PoolClient } from "pg";
import {
  assertPortfolioLegacyReaderDatabaseSession,
  assertPortfolioMigratorBootstrapSession,
  assertPortfolioMigratorDatabaseSession,
  assertUnprivilegedDatabaseSession,
} from "../../shared/postgres-session";
import { postgresConnectionConfig } from "../../shared/postgres-tls";
import {
  applyPortfolioMigrations,
  loadMigrationPlan,
} from "../../scripts/migration-ledger";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "TEST_DATABASE_URL is required for migration integration tests",
  );

const preMigrationSql = readFileSync(
  path.resolve(process.cwd(), "infra", "supabase", "portfolio-pre-migration.sql"),
  "utf8",
);
const provisioningSql = readFileSync(
  path.resolve(process.cwd(), "infra", "supabase", "portfolio-role-acls.sql"),
  "utf8",
);
const legacyReaderSql = readFileSync(
  path.resolve(process.cwd(), "infra", "supabase", "legacy-reader.sql"),
  "utf8",
);

async function reconcilePortfolioDatabase(admin: Client): Promise<void> {
  // Production reconciliation is an inseparable two-phase operation. The
  // pre-migration phase opens bounded managed-administrator memberships; the
  // post-migration phase closes them after proving the exact ACL graph.
  await admin.query(preMigrationSql);
  await admin.query(provisioningSql);
}

const managedPortfolioRoles = [
  ["portfolio_runtime_login", true],
  ["portfolio_migrator_login", true],
  ["portfolio_legal_login", true],
  ["portfolio_legacy_reader_login", true],
  ["portfolio_fence_login", true],
  ["portfolio_runtime", false],
  ["portfolio_migrator", false],
  ["legal_audit_writer", false],
  ["portfolio_audit_owner", false],
  ["portfolio_compensation_operator", false],
  ["portfolio_legacy_reader", false],
  ["portfolio_fence_operator", false],
  ["portfolio_fence_owner", false],
] as const;

function roleReconciliationSql(sql: string, source: string): string {
  const normalized = sql.replaceAll("\r\n", "\n");
  const start = normalized.indexOf("DO $$");
  const end = normalized.indexOf("\nDO $$\nDECLARE\n  edge record;", start + 1);
  if (start < 0 || end < 0) {
    throw new Error("Could not isolate " + source + " role reconciliation SQL");
  }
  return normalized.slice(start, end);
}

function roleUrl(role: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function fixturePassword(): string {
  return randomBytes(24).toString("base64url");
}

async function roleExists(admin: Client, role: string): Promise<boolean> {
  const result = await admin.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    [role],
  );
  return result.rows[0]?.exists ?? false;
}

async function setRolePassword(
  admin: Client,
  role: string,
  password: string,
): Promise<void> {
  const statement = await admin.query<{ sql: string }>(
    "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
    [role, password],
  );
  if (!statement.rows[0]?.sql)
    throw new Error(`Could not prepare a password change for ${role}`);
  await admin.query(statement.rows[0].sql);
}

async function dropRoleIfPresent(admin: Client, role: string): Promise<void> {
  if (!(await roleExists(admin, role))) return;
  const identifier = quotePostgresIdentifier(role);
  await admin.query(`REASSIGN OWNED BY ${identifier} TO postgres`);
  await admin.query(`DROP OWNED BY ${identifier}`);
  await admin.query(`DROP ROLE ${identifier}`);
}

async function runAsSessionAuthorization(
  admin: Client,
  role: string,
  sql: string,
): Promise<void> {
  await admin.query(
    "SET SESSION AUTHORIZATION " + quotePostgresIdentifier(role),
  );
  try {
    await admin.query(sql);
  } finally {
    await admin.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
  }
}

async function assertManagedRoleAttributes(admin: Client): Promise<void> {
  const result = await admin.query<{
    roleName: string;
    canLogin: boolean;
    inherits: boolean;
    isSuperuser: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    canReplicate: boolean;
    bypassesRls: boolean;
  }>(`
    SELECT
      rolname AS "roleName",
      rolcanlogin AS "canLogin",
      rolinherit AS inherits,
      rolsuper AS "isSuperuser",
      rolcreatedb AS "canCreateDatabase",
      rolcreaterole AS "canCreateRole",
      rolreplication AS "canReplicate",
      rolbypassrls AS "bypassesRls"
    FROM pg_roles
    WHERE rolname = ANY($1::text[])
    ORDER BY rolname
  `, [managedPortfolioRoles.map(([role]) => role)]);
  assert.equal(result.rowCount, managedPortfolioRoles.length);
  const expectedLogin = new Map<string, boolean>(managedPortfolioRoles);
  for (const role of result.rows) {
    assert.deepEqual(role, {
      roleName: role.roleName,
      canLogin: expectedLogin.get(role.roleName),
      inherits: false,
      isSuperuser: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canReplicate: false,
      bypassesRls: false,
    });
  }
}

async function assertPermissionDenied(
  client: Client | PoolClient,
  statement: string,
): Promise<void> {
  await assert.rejects(
    client.query(statement),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
}

async function assertCatalogIsImplicitlyFirst(
  client: Client | PoolClient,
): Promise<void> {
  const result = await client.query<{ schemas: string[] }>(
    "SELECT current_schemas(true)::text[] AS schemas",
  );
  assert.equal(result.rows[0]?.schemas[0], "pg_catalog");
  assert.deepEqual(result.rows[0]?.schemas.slice(1), [
    "portfolio",
    "extensions",
  ]);
}

async function restoreDisposableMigrationBaseline(): Promise<void> {
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
    await client.query("CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions");
    await client.query(preMigrationSql);
    await client.query("SET portfolio.test_admin_migration = 'on'");
    const plan = loadMigrationPlan(
      path.resolve(process.cwd(), "src", "migrations"),
    );
    await applyPortfolioMigrations(client, plan, {
      allowSchemaBootstrap: true,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

test("managed-Supabase bootstrap rejects privileged ALTER and is exact-role idempotent", async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const managedAdmin = "portfolio_fake_managed_postgres";
  const exactStateObserver = "portfolio_fake_role_observer";
  const preRoleSql = roleReconciliationSql(
    preMigrationSql,
    "pre-migration",
  );
  const readerRoleSql = roleReconciliationSql(
    legacyReaderSql,
    "legacy-reader",
  );

  try {
    await admin.connect();
    await admin.query("DROP SCHEMA IF EXISTS portfolio CASCADE");
    for (const [role] of managedPortfolioRoles) {
      await dropRoleIfPresent(admin, role);
    }
    await dropRoleIfPresent(admin, managedAdmin);
    await dropRoleIfPresent(admin, exactStateObserver);
    await admin.query(
      "CREATE ROLE " + quotePostgresIdentifier(managedAdmin)
        + " LOGIN CREATEROLE NOINHERIT",
    );
    await admin.query(
      "CREATE ROLE " + quotePostgresIdentifier(exactStateObserver)
        + " LOGIN NOINHERIT",
    );

    // This role models Supabase's managed postgres: it can create ordinary
    // roles, but PostgreSQL rejects any ALTER that mentions SUPERUSER.
    await runAsSessionAuthorization(admin, managedAdmin, preRoleSql);
    await assertManagedRoleAttributes(admin);

    // A caller with no role-management authority can replay an exact contract,
    // proving the bootstrap does not issue CREATE or ALTER when nothing drifted.
    await runAsSessionAuthorization(admin, exactStateObserver, preRoleSql);
    await runAsSessionAuthorization(admin, exactStateObserver, readerRoleSql);

    await admin.query(
      "ALTER ROLE portfolio_runtime_login NOLOGIN INHERIT",
    );
    await runAsSessionAuthorization(admin, managedAdmin, preRoleSql);
    await assertManagedRoleAttributes(admin);

    await admin.query(
      "ALTER ROLE portfolio_legacy_reader_login NOLOGIN INHERIT",
    );
    await runAsSessionAuthorization(admin, managedAdmin, readerRoleSql);
    await assertManagedRoleAttributes(admin);

    await admin.query("ALTER ROLE portfolio_legacy_reader CREATEROLE");
    await assert.rejects(
      runAsSessionAuthorization(admin, managedAdmin, readerRoleSql),
      /portfolio_legacy_reader.*prohibited role attributes/i,
    );
    await admin.query("ALTER ROLE portfolio_legacy_reader NOCREATEROLE");

    await admin.query("ALTER ROLE portfolio_runtime_login CREATEDB");
    await assert.rejects(
      runAsSessionAuthorization(admin, managedAdmin, preRoleSql),
      /portfolio_runtime_login.*prohibited role attributes/i,
    );
    await admin.query("ALTER ROLE portfolio_runtime_login NOCREATEDB");
  } finally {
    if (admin.connectionParameters.database) {
      await admin.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
      await admin.query("DROP SCHEMA IF EXISTS portfolio CASCADE").catch(() => undefined);
      for (const [role] of managedPortfolioRoles) {
        await dropRoleIfPresent(admin, role).catch(() => undefined);
      }
      await dropRoleIfPresent(admin, managedAdmin).catch(() => undefined);
      await dropRoleIfPresent(admin, exactStateObserver).catch(() => undefined);
      await restoreDisposableMigrationBaseline();
    }
    await admin.end().catch(() => undefined);
  }
});

test("provisioned migrator reruns migrations and runtime/legal roles enforce exact ACLs", async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const runtimePassword = fixturePassword();
  const migratorPassword = fixturePassword();
  const legalPassword = fixturePassword();
  let runtime: Client | undefined;
  let legal: Client | undefined;
  let migratorPool: Pool | undefined;
  let migrator: PoolClient | undefined;
  let databaseName = "";
  let publicHadDatabaseTemp = false;
  let createdAnon = false;
  let createdAuthenticated = false;
  let createdUnexpectedReader = false;

  try {
    await admin.connect();
    const databaseEvidence = await admin.query<{
      databaseName: string;
      publicHadDatabaseTemp: boolean;
    }>(`
      SELECT
        current_database() AS "databaseName",
        EXISTS (
          SELECT 1
          FROM pg_database database,
          LATERAL aclexplode(COALESCE(
            database.datacl,
            acldefault('d', database.datdba)
          )) privilege
          WHERE database.datname = current_database()
            AND privilege.grantee = 0
            AND privilege.privilege_type = 'TEMPORARY'
        ) AS "publicHadDatabaseTemp"
    `);
    databaseName = databaseEvidence.rows[0]?.databaseName ?? "";
    publicHadDatabaseTemp =
      databaseEvidence.rows[0]?.publicHadDatabaseTemp ?? false;

    await admin.query("DROP SCHEMA IF EXISTS future_service CASCADE");
    await admin.query("DROP SCHEMA IF EXISTS portfolio CASCADE");
    for (const role of [
      "portfolio_runtime_login",
      "portfolio_migrator_login",
      "portfolio_legal_login",
      "portfolio_legacy_reader_login",
      "portfolio_runtime",
      "portfolio_migrator",
      "legal_audit_writer",
      "portfolio_legacy_reader",
      "portfolio_compensation_operator",
      "portfolio_audit_owner",
    ]) {
      await dropRoleIfPresent(admin, role);
    }

    createdAnon = !(await roleExists(admin, "anon"));
    createdAuthenticated = !(await roleExists(admin, "authenticated"));
    if (createdAnon) await admin.query("CREATE ROLE anon NOLOGIN NOINHERIT");
    if (createdAuthenticated)
      await admin.query("CREATE ROLE authenticated NOLOGIN NOINHERIT");
    createdUnexpectedReader = !(await roleExists(
      admin,
      "portfolio_unexpected_reader",
    ));
    if (createdUnexpectedReader) {
      await admin.query(
        "CREATE ROLE portfolio_unexpected_reader NOLOGIN NOINHERIT",
      );
    }

    await admin.query(
      "CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres",
    );
    await admin.query(
      "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions",
    );
    await admin.query(
      `GRANT TEMPORARY ON DATABASE ${quotePostgresIdentifier(databaseName)} TO PUBLIC`,
    );

    await reconcilePortfolioDatabase(admin);
    await reconcilePortfolioDatabase(admin);

    const auditRoles = await admin.query<{
      roleName: string;
      canLogin: boolean;
      inherits: boolean;
      isSuperuser: boolean;
      canCreateDatabase: boolean;
      canCreateRole: boolean;
      canReplicate: boolean;
      bypassesRls: boolean;
    }>(`
      SELECT
        rolname AS "roleName",
        rolcanlogin AS "canLogin",
        rolinherit AS inherits,
        rolsuper AS "isSuperuser",
        rolcreatedb AS "canCreateDatabase",
        rolcreaterole AS "canCreateRole",
        rolreplication AS "canReplicate",
        rolbypassrls AS "bypassesRls"
      FROM pg_roles
      WHERE rolname IN ('portfolio_audit_owner', 'portfolio_compensation_operator')
      ORDER BY rolname
    `);
    assert.deepEqual(auditRoles.rows, [
      {
        roleName: "portfolio_audit_owner",
        canLogin: false,
        inherits: false,
        isSuperuser: false,
        canCreateDatabase: false,
        canCreateRole: false,
        canReplicate: false,
        bypassesRls: false,
      },
      {
        roleName: "portfolio_compensation_operator",
        canLogin: false,
        inherits: false,
        isSuperuser: false,
        canCreateDatabase: false,
        canCreateRole: false,
        canReplicate: false,
        bypassesRls: false,
      },
    ]);
    const auditMemberships = await admin.query<{
      grantedRole: string;
      memberRole: string;
      adminOption: boolean;
      inheritOption: boolean;
      setOption: boolean;
    }>(`
      SELECT
        granted.rolname AS "grantedRole",
        member.rolname AS "memberRole",
        membership.admin_option AS "adminOption",
        membership.inherit_option AS "inheritOption",
        membership.set_option AS "setOption"
      FROM pg_auth_members membership
      JOIN pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
      WHERE member.rolname = 'portfolio_migrator'
      ORDER BY granted.rolname
    `);
    assert.deepEqual(auditMemberships.rows, [
      {
        grantedRole: "portfolio_audit_owner",
        memberRole: "portfolio_migrator",
        adminOption: false,
        inheritOption: false,
        setOption: true,
      },
      {
        grantedRole: "portfolio_compensation_operator",
        memberRole: "portfolio_migrator",
        adminOption: false,
        inheritOption: false,
        setOption: true,
      },
    ]);
    await setRolePassword(admin, "portfolio_runtime_login", runtimePassword);
    await setRolePassword(admin, "portfolio_migrator_login", migratorPassword);
    await setRolePassword(admin, "portfolio_legal_login", legalPassword);

    migratorPool = new Pool(
      postgresConnectionConfig(
        roleUrl("portfolio_migrator_login", migratorPassword),
        undefined,
        "portfolio, extensions",
      ),
    );
    migrator = await migratorPool.connect();
    await assertPortfolioMigratorBootstrapSession(migrator);
    await assertCatalogIsImplicitlyFirst(migrator);

    const plan = loadMigrationPlan(
      path.resolve(process.cwd(), "src", "migrations"),
    );
    const first = await applyPortfolioMigrations(migrator, plan, {
      allowSchemaBootstrap: false,
    });
    assert.deepEqual(first, {
      adopted: 0,
      applied: plan.length,
      total: plan.length,
    });
    const rerun = await applyPortfolioMigrations(migrator, plan, {
      allowSchemaBootstrap: false,
    });
    assert.deepEqual(rerun, { adopted: 0, applied: 0, total: plan.length });

    await reconcilePortfolioDatabase(admin);
    await reconcilePortfolioDatabase(admin);
    const postReconciliationRerun = await applyPortfolioMigrations(migrator, plan, {
      allowSchemaBootstrap: false,
    });
    assert.deepEqual(postReconciliationRerun, {
      adopted: 0,
      applied: 0,
      total: plan.length,
    });

    runtime = new Client(
      postgresConnectionConfig(
        roleUrl("portfolio_runtime_login", runtimePassword),
        undefined,
        "portfolio, extensions",
      ),
    );
    legal = new Client(
      postgresConnectionConfig(
        roleUrl("portfolio_legal_login", legalPassword),
        undefined,
        "portfolio, extensions",
      ),
    );
    await runtime.connect();
    await legal.connect();

    await assertUnprivilegedDatabaseSession(
      runtime,
      "portfolio_runtime",
      "Portfolio runtime",
    );
    await assertUnprivilegedDatabaseSession(
      legal,
      "legal_audit_writer",
      "Portfolio legal audit",
    );
    await assertCatalogIsImplicitlyFirst(runtime);
    await assertCatalogIsImplicitlyFirst(legal);

    await assert.doesNotReject(
      runtime.query("SELECT id FROM portfolio.projects LIMIT 0"),
    );
    await assertPermissionDenied(
      runtime,
      "SELECT * FROM portfolio.schema_migrations",
    );
    await assertPermissionDenied(runtime, "SELECT * FROM portfolio.session");
    await assertPermissionDenied(
      runtime,
      "SELECT * FROM portfolio.legal_document_versions",
    );
    await assertPermissionDenied(
      runtime,
      "SELECT * FROM portfolio.legal_document_active_ranges",
    );

    const suffix = randomBytes(12).toString("hex");
    await legal.query(
      `INSERT INTO portfolio.legal_document_versions
         (doc_type, content, content_hash, commit_sha, committed_at)
       VALUES ('privacy', $1, $2, $3, now())`,
      [`content-${suffix}`, `hash-${suffix}`, suffix.padEnd(40, "0")],
    );
    await assertPermissionDenied(
      legal,
      "SELECT * FROM portfolio.legal_document_versions",
    );
    await assertPermissionDenied(
      legal,
      "SELECT * FROM portfolio.legal_document_active_ranges",
    );

    const exposure = await admin.query<{ count: number }>(`
      SELECT count(*)::integer AS count
      FROM pg_class object
      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        object.relacl,
        acldefault('r', object.relowner)
      )) privilege
      WHERE namespace.nspname = 'portfolio'
        AND object.relname IN ('legal_document_versions', 'legal_document_active_ranges')
        AND privilege.grantee IN (
          0::oid,
          (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
          (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        )
    `);
    assert.equal(exposure.rows[0]?.count, 0);

    const tempAcl = await admin.query<{
      publicTemp: boolean;
      runtimeDirectTemp: boolean;
      legalDirectTemp: boolean;
    }>(`
      SELECT
        bool_or(privilege.grantee = 0 AND privilege.privilege_type = 'TEMPORARY') AS "publicTemp",
        bool_or(
          privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'portfolio_runtime')
          AND privilege.privilege_type = 'TEMPORARY'
        ) AS "runtimeDirectTemp",
        bool_or(
          privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'legal_audit_writer')
          AND privilege.privilege_type = 'TEMPORARY'
        ) AS "legalDirectTemp"
      FROM pg_database database,
      LATERAL aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) privilege
      WHERE database.datname = current_database()
    `);
    assert.equal(tempAcl.rows[0]?.publicTemp, true);
    assert.equal(tempAcl.rows[0]?.runtimeDirectTemp, false);
    assert.equal(tempAcl.rows[0]?.legalDirectTemp, false);

    const vector = await admin.query<{
      extensionOwner: string;
      typeOwner: string;
      schemaName: string;
    }>(`
      SELECT
        extension_owner.rolname AS "extensionOwner",
        type_owner.rolname AS "typeOwner",
        namespace.nspname AS "schemaName"
      FROM pg_extension extension
      JOIN pg_roles extension_owner ON extension_owner.oid = extension.extowner
      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      JOIN pg_type type ON type.typnamespace = namespace.oid AND type.typname = 'vector'
      JOIN pg_roles type_owner ON type_owner.oid = type.typowner
      WHERE extension.extname = 'vector' AND type.typrelid = 0
    `);
    assert.deepEqual(vector.rows, [
      {
        extensionOwner: "postgres",
        typeOwner: "postgres",
        schemaName: "extensions",
      },
    ]);

    await admin.query("CREATE SCHEMA future_service");
    await admin.query(`
      CREATE TABLE future_service.audit_role_escape (id integer PRIMARY KEY);
      CREATE FUNCTION future_service.public_default_function() RETURNS integer
        LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE TYPE future_service.public_default_type AS ENUM ('value');
    `);
    await assertUnprivilegedDatabaseSession(
      runtime,
      "portfolio_runtime",
      "Portfolio runtime",
    );
    await assertUnprivilegedDatabaseSession(
      legal,
      "legal_audit_writer",
      "Portfolio legal audit",
    );
    await assertPortfolioMigratorDatabaseSession(migrator);

    await admin.query(
      "GRANT USAGE ON SCHEMA future_service TO portfolio_runtime",
    );
    await admin.query(
      "GRANT USAGE ON SCHEMA future_service TO portfolio_runtime_login",
    );
    await admin.query(
      "GRANT USAGE ON SCHEMA future_service TO portfolio_compensation_operator",
    );
    await admin.query(
      "GRANT SELECT ON future_service.audit_role_escape TO portfolio_compensation_operator",
    );
    await admin.query(
      "GRANT SELECT (id) ON future_service.audit_role_escape TO portfolio_runtime_login",
    );
    await admin.query(
      "GRANT EXECUTE ON FUNCTION future_service.public_default_function() TO portfolio_runtime_login",
    );
    await admin.query(
      "GRANT USAGE ON TYPE future_service.public_default_type TO portfolio_runtime_login",
    );
    await admin.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA future_service
        GRANT SELECT ON TABLES TO portfolio_runtime_login;
      ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_migrator
        GRANT EXECUTE ON ROUTINES TO PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_migrator IN SCHEMA future_service
        GRANT USAGE ON TYPES TO portfolio_runtime_login;
    `);
    await admin.query(
      "GRANT SELECT ON portfolio.schema_migrations TO portfolio_compensation_operator",
    );
    await admin.query("GRANT TRUNCATE ON portfolio.users TO portfolio_runtime");
    await admin.query(
      "GRANT SELECT ON portfolio.projects TO portfolio_runtime WITH GRANT OPTION",
    );
    await admin.query(
      "GRANT UPDATE (email) ON portfolio.users TO portfolio_runtime",
    );
    await admin.query(
      "GRANT SELECT ON portfolio.projects TO portfolio_unexpected_reader",
    );
    await admin.query(
      "GRANT SELECT (title) ON portfolio.projects TO portfolio_unexpected_reader",
    );
    await admin.query("GRANT SELECT ON portfolio.schema_migrations TO PUBLIC");
    await admin.query("GRANT SELECT (sid) ON portfolio.session TO PUBLIC");
    await admin.query(
      "GRANT SELECT ON portfolio.legal_document_versions TO legal_audit_writer",
    );
    await admin.query(
      "GRANT SELECT ON portfolio.legal_document_versions TO anon",
    );
    await admin.query(`
      CREATE POLICY boundary_unreviewed_legal_policy
        ON portfolio.legal_document_versions
        FOR SELECT TO portfolio_runtime USING (true)
    `);
    await migrator.query(`
      CREATE FUNCTION portfolio.boundary_acl_function() RETURNS integer
        LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE PROCEDURE portfolio.boundary_acl_procedure()
        LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE TYPE portfolio.boundary_acl_type AS ENUM ('value');
    `);
    await admin.query(
      "GRANT EXECUTE ON FUNCTION portfolio.boundary_acl_function() TO portfolio_runtime",
    );
    await admin.query(
      "GRANT EXECUTE ON PROCEDURE portfolio.boundary_acl_procedure() TO PUBLIC",
    );
    await admin.query(
      "GRANT USAGE ON TYPE portfolio.boundary_acl_type TO portfolio_runtime",
    );

    await assert.rejects(
      assertUnprivilegedDatabaseSession(
        runtime,
        "portfolio_runtime",
        "Portfolio runtime",
      ),
      /LOGIN\/RESET ROLE|namespace-allowlist|relation-acl|column-acl|routine-acl|type-acl|legal-exposure|legal-writer-policy/i,
    );
    await assert.rejects(
      assertUnprivilegedDatabaseSession(
        legal,
        "legal_audit_writer",
        "Portfolio legal audit",
      ),
      /LOGIN\/RESET ROLE|relation-acl|legal-exposure/i,
    );
    await assert.rejects(
      assertPortfolioMigratorDatabaseSession(migrator),
      /LOGIN\/RESET ROLE|audit-role|portfolio-acl-matrix/i,
    );

    await reconcilePortfolioDatabase(admin);
    await reconcilePortfolioDatabase(admin);
    await assertUnprivilegedDatabaseSession(
      runtime,
      "portfolio_runtime",
      "Portfolio runtime",
    );
    await assertUnprivilegedDatabaseSession(
      legal,
      "legal_audit_writer",
      "Portfolio legal audit",
    );
    await assertPortfolioMigratorDatabaseSession(migrator);
    await migrator.query("SET ROLE portfolio_compensation_operator");
    try {
      await assert.doesNotReject(
        migrator.query("SELECT id FROM portfolio.projects LIMIT 0"),
      );
      await assertPermissionDenied(
        migrator,
        "SELECT * FROM portfolio.schema_migrations",
      );
      await assertPermissionDenied(
        migrator,
        "SELECT * FROM future_service.audit_role_escape",
      );
    } finally {
      await migrator.query("RESET ROLE");
    }
    await assertPermissionDenied(
      legal,
      "SELECT * FROM portfolio.legal_document_versions",
    );
  } finally {
    await runtime?.end().catch(() => undefined);
    await legal?.end().catch(() => undefined);
    migrator?.release();
    await migratorPool?.end().catch(() => undefined);
    if (admin.connectionParameters.database) {
      await admin.query("ROLLBACK").catch(() => undefined);
      await admin
        .query("DROP SCHEMA IF EXISTS future_service CASCADE")
        .catch(() => undefined);
      await admin
        .query("DROP SCHEMA IF EXISTS portfolio CASCADE")
        .catch(() => undefined);
      for (const role of [
        "portfolio_runtime_login",
        "portfolio_migrator_login",
        "portfolio_legal_login",
        "portfolio_legacy_reader_login",
        "portfolio_runtime",
        "portfolio_migrator",
        "legal_audit_writer",
        "portfolio_legacy_reader",
        "portfolio_compensation_operator",
        "portfolio_audit_owner",
      ]) {
        await dropRoleIfPresent(admin, role).catch(() => undefined);
      }
      if (createdUnexpectedReader) {
        await dropRoleIfPresent(admin, "portfolio_unexpected_reader").catch(
          () => undefined,
        );
      }
      if (createdAnon)
        await dropRoleIfPresent(admin, "anon").catch(() => undefined);
      if (createdAuthenticated) {
        await dropRoleIfPresent(admin, "authenticated").catch(() => undefined);
      }
      if (databaseName) {
        const publicTempAction = publicHadDatabaseTemp ? "GRANT" : "REVOKE";
        await admin
          .query(
            `${publicTempAction} TEMPORARY ON DATABASE ${quotePostgresIdentifier(databaseName)} ${
              publicHadDatabaseTemp ? "TO" : "FROM"
            } PUBLIC`,
          )
          .catch(() => undefined);
      }
      await restoreDisposableMigrationBaseline();
    }
    await admin.end().catch(() => undefined);
  }
});

test("legacy reader remains confined to its exact public table allowlist", async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const readerPassword = fixturePassword();
  let reader: Client | undefined;
  try {
    await admin.connect();
    await dropRoleIfPresent(admin, "portfolio_legacy_reader_login");
    await dropRoleIfPresent(admin, "portfolio_legacy_reader");
    await admin.query(`
      DROP TABLE IF EXISTS public.boundary_source;
      DROP TABLE IF EXISTS public.boundary_extra;
      DROP TABLE IF EXISTS public.legal_document_versions;
      DROP FUNCTION IF EXISTS public.boundary_function();
      DROP TYPE IF EXISTS public.reader_owned_type;
      CREATE TABLE public.boundary_source (id text PRIMARY KEY);
      CREATE TABLE public.boundary_extra (id text PRIMARY KEY);
      CREATE TABLE public.legal_document_versions (id text PRIMARY KEY);
      CREATE FUNCTION public.boundary_function() RETURNS integer
        LANGUAGE sql AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.boundary_function() FROM PUBLIC;
      CREATE ROLE portfolio_legacy_reader NOLOGIN
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
      CREATE ROLE portfolio_legacy_reader_login LOGIN
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
      GRANT portfolio_legacy_reader TO portfolio_legacy_reader_login
        WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
      GRANT USAGE ON SCHEMA public TO portfolio_legacy_reader;
      GRANT SELECT ON public.boundary_source, public.legal_document_versions
        TO portfolio_legacy_reader;
      ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY portfolio_legacy_reader_full_read
        ON public.legal_document_versions AS PERMISSIVE FOR SELECT
        TO portfolio_legacy_reader USING (true);
    `);
    await setRolePassword(admin, "portfolio_legacy_reader_login", readerPassword);

    reader = new Client(
      postgresConnectionConfig(
        roleUrl("portfolio_legacy_reader_login", readerPassword),
        undefined,
        "public",
      ),
    );
    await reader.connect();
    const tables = ["boundary_source", "legal_document_versions"];
    await assertPortfolioLegacyReaderDatabaseSession(reader, tables);

    await admin.query(
      "GRANT UPDATE (id) ON public.boundary_source TO portfolio_legacy_reader",
    );
    await assert.rejects(
      assertPortfolioLegacyReaderDatabaseSession(reader, tables),
      /allowed-table-write/i,
    );
    await admin.query(
      "REVOKE UPDATE (id) ON public.boundary_source FROM portfolio_legacy_reader",
    );

    await admin.query(
      "GRANT EXECUTE ON FUNCTION public.boundary_function() TO portfolio_legacy_reader",
    );
    await assert.rejects(
      assertPortfolioLegacyReaderDatabaseSession(reader, tables),
      /public-function-execute/i,
    );
    await admin.query(
      "REVOKE EXECUTE ON FUNCTION public.boundary_function() FROM portfolio_legacy_reader",
    );

    await admin.query(
      "GRANT SELECT ON public.boundary_extra TO portfolio_legacy_reader",
    );
    await assert.rejects(
      assertPortfolioLegacyReaderDatabaseSession(reader, tables),
      /legacy reader database session boundary/i,
    );
  } finally {
    await reader?.end().catch(() => undefined);
    if (admin.connectionParameters.database) {
      await admin
        .query("DROP TABLE IF EXISTS public.legal_document_versions")
        .catch(() => undefined);
      await dropRoleIfPresent(admin, "portfolio_legacy_reader_login").catch(
        () => undefined,
      );
      await dropRoleIfPresent(admin, "portfolio_legacy_reader").catch(
        () => undefined,
      );
      await admin
        .query("DROP FUNCTION IF EXISTS public.boundary_function()")
        .catch(() => undefined);
      await admin
        .query("DROP TABLE IF EXISTS public.boundary_extra")
        .catch(() => undefined);
      await admin
        .query("DROP TABLE IF EXISTS public.boundary_source")
        .catch(() => undefined);
      await admin.query(preMigrationSql);
    }
    await admin.end().catch(() => undefined);
  }
});
