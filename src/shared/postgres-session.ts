import {
  portfolioBoundaryForRole,
  portfolioDatabaseBoundary,
  type PortfolioDatabaseBoundary,
} from "./database-boundary";

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export type PortfolioRole =
  | "portfolio_runtime"
  | "portfolio_migrator"
  | "portfolio_staging_runtime"
  | "portfolio_staging_migrator";

interface SessionIdentity {
  sessionUser: string;
  currentUser: string;
  loginCanLogin: boolean;
  loginIsPrivileged: boolean;
  capabilityCanLogin: boolean;
  capabilityIsPrivileged: boolean;
  canSetCapability: boolean;
  timezone: string;
}

export async function assertUnprivilegedDatabaseSession(
  queryable: Queryable,
  expectedRole: PortfolioRole,
  boundary: string,
): Promise<void> {
  const databaseBoundary = portfolioBoundaryForRole(expectedRole);
  if (!databaseBoundary) {
    throw new Error(`${boundary} database role is invalid`);
  }
  const runtime = expectedRole === databaseBoundary.runtimeRole;
  const expectedLogin = runtime
    ? databaseBoundary.runtimeLogin
    : databaseBoundary.migratorLogin;

  await queryable.query("RESET ROLE");
  const identity = await queryable.query(
    `
      SELECT
        session_user AS "sessionUser",
        current_user AS "currentUser",
        login.rolcanlogin AS "loginCanLogin",
        (
          login.rolsuper OR login.rolbypassrls OR login.rolcreatedb
          OR login.rolcreaterole OR login.rolreplication
        ) AS "loginIsPrivileged",
        capability.rolcanlogin AS "capabilityCanLogin",
        (
          capability.rolsuper OR capability.rolbypassrls OR capability.rolcreatedb
          OR capability.rolcreaterole OR capability.rolreplication
        ) AS "capabilityIsPrivileged",
        pg_catalog.pg_has_role(session_user, capability.oid, 'SET') AS "canSetCapability",
        current_setting('TimeZone') AS timezone
      FROM pg_catalog.pg_roles AS login
      CROSS JOIN pg_catalog.pg_roles AS capability
      WHERE login.rolname = $1
        AND capability.rolname = $2
    `,
    [expectedLogin, expectedRole],
  );
  const row = identity.rows[0] as SessionIdentity | undefined;
  if (
    identity.rows.length !== 1
    || row?.sessionUser !== expectedLogin
    || row.currentUser !== expectedLogin
    || !row.loginCanLogin
    || row.loginIsPrivileged
    || row.capabilityCanLogin
    || row.capabilityIsPrivileged
    || !row.canSetCapability
    || (row.timezone !== "UTC" && row.timezone !== "Etc/UTC")
  ) {
    throw new Error(`${boundary} database login is not scoped to ${expectedRole}`);
  }

  await queryable.query(`SET ROLE ${expectedRole}`);
  const capability = await queryable.query(`
    SELECT
      current_user AS "currentUser",
      pg_catalog.has_schema_privilege(current_user, '${databaseBoundary.schema}', 'USAGE')
        AS "hasSchemaUsage",
      pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
        AS "canCreateDatabaseObjects",
      pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
        AS "canCreatePublicObjects"
  `);
  const role = capability.rows[0] as {
    currentUser: string;
    hasSchemaUsage: boolean;
    canCreateDatabaseObjects: boolean;
    canCreatePublicObjects: boolean;
  } | undefined;
  if (
    capability.rows.length !== 1
    || role?.currentUser !== expectedRole
    || !role.hasSchemaUsage
    || role.canCreateDatabaseObjects
    || role.canCreatePublicObjects
  ) {
    throw new Error(`${boundary} database capability is not safely scoped`);
  }
}

export async function assertPortfolioMigratorBootstrapSession(
  queryable: Queryable,
  boundary: PortfolioDatabaseBoundary = portfolioDatabaseBoundary(),
): Promise<void> {
  await assertUnprivilegedDatabaseSession(
    queryable,
    boundary.migratorRole,
    "Portfolio migration",
  );
  const result = await queryable.query(`
    SELECT
      pg_catalog.pg_get_userbyid(namespace.nspowner) = current_user AS "ownsSchema",
      pg_catalog.has_schema_privilege(current_user, namespace.oid, 'CREATE')
        AS "canCreateInSchema"
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspname = '${boundary.schema}'
  `);
  const row = result.rows[0] as {
    ownsSchema: boolean;
    canCreateInSchema: boolean;
  } | undefined;
  if (result.rows.length !== 1 || !row?.ownsSchema || !row.canCreateInSchema) {
    throw new Error("Portfolio migration role does not own the Portfolio schema");
  }
}
