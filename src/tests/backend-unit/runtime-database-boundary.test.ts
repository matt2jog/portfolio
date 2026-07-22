import assert from "node:assert/strict";
import test from "node:test";
import { assertRuntimeDatabaseSession } from "../../backend/data/runtime-database-boundary";
import {
  assertPortfolioLegacyReaderDatabaseSession,
  assertPortfolioMigratorDatabaseSession,
  assertUnprivilegedDatabaseSession,
} from "../../shared/postgres-session";

function queryable(overrides: Record<string, unknown> = {}) {
  const capability = {
    sessionUser: "portfolio_runtime_login",
    currentUser: "portfolio_runtime",
    roleExists: true,
    roleCanLogin: false,
    roleIsSuperuser: false,
    roleBypassesRls: false,
    roleCanCreateDatabase: false,
    roleCanCreateRole: false,
    roleCanReplicate: false,
    roleInherits: false,
    hasAdminOption: false,
    memberships: [],
    roleMembershipsAreValid: true,
    auditRolesAreValid: true,
    inheritsPrivilegedRole: false,
    canCreateDatabaseObjects: false,
    hasDatabaseTempPrivilege: false,
    canCreatePublicSchemaObjects: false,
    hasPublicSchemaUsage: false,
    canCreatePortfolioSchemaObjects: false,
    hasPortfolioSchemaUsage: true,
    canCreateExtensionsSchemaObjects: false,
    hasExtensionsSchemaUsage: true,
    vectorExtensionIsValid: true,
    vectorTypeIsValid: true,
    portfolioRolesOwnVectorObjects: false,
    ownsApplicationObjects: false,
    ownsOutsidePortfolioObjects: false,
    hasPublicObjectAccess: false,
    namespaceAccessIsValid: true,
    schemaAclIsValid: true,
    relationAclIsValid: true,
    portfolioAclIsExact: true,
    columnAclIsValid: true,
    routineAclIsValid: true,
    typeAclIsValid: true,
    legalExposureIsValid: true,
    legalWriterPolicyIsValid: true,
    migratorOwnsPortfolioObjects: true,
    directLoginPrivilegesAreEmpty: true,
    loginOwnsNoObjects: true,
    loginMembershipIsExact: true,
    defaultAclIsExact: true,
    effectiveAclIsExact: true,
    timezone: "UTC",
    searchPath: "portfolio, extensions",
    ...overrides,
  };
  return {
    async query(text = "") {
      if (/^(?:RESET|SET) ROLE/.test(text)) return { rows: [] };
      if (text.includes('AS "loginCanLogin"')) {
        const expectedLogin = capability.sessionUser;
        return { rows: [{
          sessionUser: expectedLogin,
          currentUser: expectedLogin,
          loginCanLogin: true,
          loginInherits: false,
          loginMembershipIsExact: true,
          loginDirectAclIsEmpty: true,
          loginOwnsNoObjects: true,
          loginEffectiveObjectAclIsExact: true,
          loginEffectiveSchemaAclIsExact: true,
          defaultAclIsExact: true,
          timezone: "UTC",
          searchPath: "portfolio, extensions",
        }] };
      }
      return {
        rows: [capability],
      };
    },
  };
}

function legacyReaderQueryable(overrides: Record<string, unknown> = {}) {
  return {
    async query(text = "") {
      if (/^(?:RESET|SET) ROLE/.test(text)) return { rows: [] };
      if (text.includes('AS "canLogin"')) return { rows: [{
        sessionUser: "portfolio_legacy_reader_login",
        currentUser: "portfolio_legacy_reader_login",
        canLogin: true,
        inherits: false,
        membershipIsExact: true,
        hasDirectAcl: false,
        ownsObject: false,
        timezone: "UTC",
      }] };
      if (!text.includes("roleExists")) return { rows: [{
        sessionUser: "portfolio_legacy_reader_login",
        currentUser: "portfolio_legacy_reader_login",
        timezone: "UTC",
        directAclIsEmpty: true,
        ownsNoObjects: true,
        effectiveObjectAclIsEmpty: true,
        effectiveSchemaAclIsExact: true,
      }] };
      return {
        rows: [
          {
            sessionUser: "portfolio_legacy_reader_login",
            currentUser: "portfolio_legacy_reader",
            roleExists: true,
            roleCanLogin: false,
            roleIsSuperuser: false,
            roleBypassesRls: false,
            roleCanCreateDatabase: false,
            roleCanCreateRole: false,
            roleCanReplicate: false,
            roleInherits: false,
            hasAdminOption: false,
            memberships: [],
            inheritsPrivilegedRole: false,
            canCreateDatabaseObjects: false,
            canCreatePublicSchemaObjects: false,
            hasPublicSchemaUsage: true,
            ownsApplicationObjects: false,
            hasSiblingSchemaAccess: false,
            allAllowedTablesExist: true,
            canReadAllAllowedTables: true,
            hasValidAllowedRowSecurity: true,
            hasAllowedWriteAccess: false,
            hasUnexpectedPublicObjectAccess: false,
            hasPublicFunctionExecute: false,
            searchPath: "public",
            ...overrides,
          },
        ],
      };
    },
  };
}

test("runtime database boundary accepts only the exact unprivileged runtime session", async () => {
  await assert.doesNotReject(assertRuntimeDatabaseSession(queryable()));
  await assert.doesNotReject(
    assertRuntimeDatabaseSession(queryable({ hasPublicSchemaUsage: true })),
  );
  await assert.doesNotReject(
    assertRuntimeDatabaseSession(queryable({ hasDatabaseTempPrivilege: true })),
  );
});

test("runtime database boundary rejects admin, switched, inherited, and DDL-capable sessions", async () => {
  for (const evidence of [
    { sessionUser: "postgres", currentUser: "postgres" },
    { sessionUser: "portfolio_runtime", currentUser: "postgres" },
    { inheritsPrivilegedRole: true },
    { roleCanLogin: true },
    { roleIsSuperuser: true },
    { roleBypassesRls: true },
    { roleCanCreateDatabase: true },
    { roleCanCreateRole: true },
    { roleCanReplicate: true },
    { roleInherits: true },
    { hasAdminOption: true },
    { memberships: ["pg_monitor"] },
    { roleMembershipsAreValid: false },
    { auditRolesAreValid: false },
    { canCreateDatabaseObjects: true },
    { canCreatePublicSchemaObjects: true },
    { hasPublicObjectAccess: true },
    { canCreatePortfolioSchemaObjects: true },
    { hasPortfolioSchemaUsage: false },
    { canCreateExtensionsSchemaObjects: true },
    { hasExtensionsSchemaUsage: false },
    { vectorExtensionIsValid: false },
    { vectorTypeIsValid: false },
    { portfolioRolesOwnVectorObjects: true },
    { ownsApplicationObjects: true },
    { ownsOutsidePortfolioObjects: true },
    { namespaceAccessIsValid: false },
    { schemaAclIsValid: false },
    { relationAclIsValid: false },
    { portfolioAclIsExact: false },
    { columnAclIsValid: false },
    { routineAclIsValid: false },
    { typeAclIsValid: false },
    { legalExposureIsValid: false },
    { legalWriterPolicyIsValid: false },
    { searchPath: "portfolio, public, extensions" },
    { roleExists: false },
  ]) {
    await assert.rejects(
      assertRuntimeDatabaseSession(queryable(evidence)),
      /runtime database session boundary/i,
    );
  }
});

test("runtime boundary uses an explicit namespace allowlist and exact ACL catalogs", async () => {
  const base = queryable();
  const statements: string[] = [];
  await assertRuntimeDatabaseSession({
    async query(text: string) {
      statements.push(text);
      return base.query(text);
    },
  });
  const statement = statements.join("\n");
  assert.match(statement, /FROM pg_namespace/);
  assert.match(statement, /namespaceAccessIsValid/);
  assert.match(statement, /schemaAclIsValid/);
  assert.match(statement, /aclexplode/);
  assert.match(statement, /effective_relation_acl/);
  assert.match(statement, /expected_portfolio_acl/);
  assert.match(statement, /expected_portfolio_routine_acl/);
  assert.match(statement, /portfolioAclIsExact/);
  assert.match(statement, /auditRolesAreValid/);
  assert.match(statement, /membership\.inherit_option/);
  assert.match(statement, /membership\.set_option/);
  assert.match(statement, /portfolio_audit_owner/);
  assert.match(statement, /portfolio_compensation_operator/);
  assert.match(statement, /has_table_privilege/);
  assert.match(statement, /has_any_column_privilege/);
  assert.match(statement, /pg_attribute/);
  assert.match(statement, /pg_proc/);
  assert.match(statement, /pg_type/);
  assert.match(
    statement,
    /has_schema_privilege\(current_user, namespace\.oid, 'USAGE'\)/,
  );
  assert.doesNotMatch(statement, /communications_candidate/);
  assert.doesNotMatch(statement, /admin_dashboard/);
  assert.match(statement, /has_sequence_privilege/);
  assert.match(
    statement,
    /has_database_privilege\(current_user, current_database\(\), 'TEMP'\)/,
  );
  assert.match(
    statement,
    /has_schema_privilege\(current_user, vector_extension\.extnamespace, 'USAGE'\)/,
  );
  assert.match(
    statement,
    /has_schema_privilege\(current_user, 'extensions', 'CREATE'\)/,
  );
  assert.match(statement, /FROM pg_extension/);
  assert.match(statement, /extension\.extname = 'vector'/);
  assert.match(statement, /type\.typrelid = 0/);
});

test("LOGIN transition permits only scalar types owned by the vector extension", async () => {
  const base = queryable();
  let loginStatement = "";
  await assertRuntimeDatabaseSession({
    async query(text: string) {
      if (text.includes('AS "loginCanLogin"')) loginStatement = text;
      return base.query(text);
    },
  });

  assert.match(loginStatement, /dependency\.classid = 'pg_type'::regclass/);
  assert.match(loginStatement, /dependency\.refclassid = 'pg_extension'::regclass/);
  assert.match(loginStatement, /dependency\.refobjid = \(SELECT oid FROM vector_extension\)/);
  assert.match(loginStatement, /dependency\.deptype = 'e'/);
  assert.doesNotMatch(loginStatement, /type\.typname = 'vector'/);
});

test("capability boundary follows the managed vector schema and ignores only extension-owned public routines", async () => {
  const base = queryable();
  let capabilityStatement = "";
  await assertRuntimeDatabaseSession({
    async query(text: string) {
      if (text.includes('AS "roleExists"')) capabilityStatement = text;
      return base.query(text);
    },
  });

  assert.match(capabilityStatement, /extension\.extnamespace/);
  assert.match(
    capabilityStatement,
    /has_schema_privilege\(current_user, vector_extension\.extnamespace, 'USAGE'\)/,
  );
  assert.match(
    capabilityStatement,
    /privilege\.nspname = \(SELECT nspname FROM vector_extension\)/,
  );
  const publicAccess = capabilityStatement.slice(
    capabilityStatement.indexOf("has_schema_privilege(current_user, 'public', 'USAGE') AND ("),
    capabilityStatement.indexOf('AS "hasPublicObjectAccess"'),
  );
  assert.match(publicAccess, /dependency\.classid = 'pg_proc'::regclass/);
  assert.match(publicAccess, /dependency\.refobjid = \(SELECT oid FROM vector_extension\)/);
});

test("legal writer accepts INSERT-only legal history access without SELECT", async () => {
  const legal = (overrides: Record<string, unknown> = {}) =>
    queryable({
      sessionUser: "portfolio_legal_login",
      currentUser: "legal_audit_writer",
      ...overrides,
    });

  await assert.doesNotReject(
    assertUnprivilegedDatabaseSession(
      legal(),
      "legal_audit_writer",
      "Portfolio legal audit",
    ),
  );
  for (const evidence of [
    { relationAclIsValid: false },
    { portfolioAclIsExact: false },
    { columnAclIsValid: false },
    { routineAclIsValid: false },
    { typeAclIsValid: false },
    { legalExposureIsValid: false },
    { legalWriterPolicyIsValid: false },
  ]) {
    await assert.rejects(
      assertUnprivilegedDatabaseSession(
        legal(evidence),
        "legal_audit_writer",
        "Portfolio legal audit",
      ),
      /legal audit database session boundary/i,
    );
  }
});

test("migration boundary accepts only the exact isolated DDL owner", async () => {
  const migrator = (overrides: Record<string, unknown> = {}) =>
    queryable({
      sessionUser: "portfolio_migrator_login",
      currentUser: "portfolio_migrator",
      memberships: ["portfolio_audit_owner", "portfolio_compensation_operator"],
      canCreatePortfolioSchemaObjects: true,
      hasDatabaseTempPrivilege: true,
      ...overrides,
    });
  await assert.doesNotReject(
    assertPortfolioMigratorDatabaseSession(migrator()),
  );
  for (const evidence of [
    { sessionUser: "postgres", currentUser: "postgres" },
    { currentUser: "postgres" },
    { canCreatePortfolioSchemaObjects: false },
    { hasPortfolioSchemaUsage: false },
    { canCreateExtensionsSchemaObjects: true },
    { hasExtensionsSchemaUsage: false },
    { vectorExtensionIsValid: false },
    { vectorTypeIsValid: false },
    { portfolioRolesOwnVectorObjects: true },
    { canCreateDatabaseObjects: true },
    { hasDatabaseTempPrivilege: false },
    { canCreatePublicSchemaObjects: true },
    { hasPublicObjectAccess: true },
    { ownsOutsidePortfolioObjects: true },
    { namespaceAccessIsValid: false },
    { schemaAclIsValid: false },
    { relationAclIsValid: false },
    { columnAclIsValid: false },
    { routineAclIsValid: false },
    { typeAclIsValid: false },
    { legalExposureIsValid: false },
    { legalWriterPolicyIsValid: false },
    { migratorOwnsPortfolioObjects: false },
    { roleInherits: true },
    { memberships: ["postgres"] },
    { roleMembershipsAreValid: false },
    { auditRolesAreValid: false },
    { searchPath: "portfolio, public, extensions" },
  ]) {
    await assert.rejects(
      assertPortfolioMigratorDatabaseSession(migrator(evidence)),
      /migration database session boundary/i,
    );
  }
  await assert.rejects(
    assertPortfolioMigratorDatabaseSession(
      migrator({ hasDatabaseTempPrivilege: false }),
    ),
    /database-temp/i,
  );
});

test("legacy reader accepts only exact allowlisted public SELECT access", async () => {
  await assert.doesNotReject(
    assertPortfolioLegacyReaderDatabaseSession(legacyReaderQueryable(), [
      "users",
      "projects",
    ]),
  );
  for (const evidence of [
    { sessionUser: "postgres", currentUser: "postgres" },
    { currentUser: "postgres" },
    { roleCanLogin: true },
    { roleIsSuperuser: true },
    { roleBypassesRls: true },
    { roleCanCreateDatabase: true },
    { roleCanCreateRole: true },
    { roleCanReplicate: true },
    { roleInherits: true },
    { hasAdminOption: true },
    { memberships: ["pg_read_all_data"] },
    { inheritsPrivilegedRole: true },
    { canCreateDatabaseObjects: true },
    { canCreatePublicSchemaObjects: true },
    { hasPublicSchemaUsage: false },
    { ownsApplicationObjects: true },
    { hasSiblingSchemaAccess: true },
    { allAllowedTablesExist: false },
    { canReadAllAllowedTables: false },
    { hasValidAllowedRowSecurity: false },
    { hasAllowedWriteAccess: true },
    { hasUnexpectedPublicObjectAccess: true },
    { hasPublicFunctionExecute: true },
    { searchPath: "public, extensions" },
    { roleExists: false },
  ]) {
    await assert.rejects(
      assertPortfolioLegacyReaderDatabaseSession(
        legacyReaderQueryable(evidence),
        ["users", "projects"],
      ),
      /legacy reader database session boundary/i,
    );
  }
});

test("legacy reader query requires the one exact legal document RLS policy", async () => {
  const base = legacyReaderQueryable();
  const statements: string[] = [];
  await assertPortfolioLegacyReaderDatabaseSession(
    {
      async query(text: string) {
        statements.push(text);
        return base.query(text);
      },
    },
    ["legal_document_versions", "users"],
  );
  const statement = statements.join("\n");

  assert.match(statement, /FROM pg_policy/);
  assert.match(statement, /portfolio_legacy_reader_full_read/);
  assert.match(statement, /policy\.polpermissive/);
  assert.match(statement, /policy\.polcmd = 'r'/);
  assert.match(statement, /policy\.polroles = ARRAY\[/);
  assert.match(
    statement,
    /pg_get_expr\(policy\.polqual, policy\.polrelid\) = 'true'/,
  );
  assert.match(statement, /policy\.polwithcheck IS NULL/);
  assert.match(statement, /allowed\.table_name = 'legal_document_versions'/);
});

test("legacy reader rejects empty, duplicate, or malformed table allowlists", async () => {
  for (const tables of [
    [],
    ["users", "users"],
    ["users; DROP SCHEMA public"],
  ]) {
    await assert.rejects(
      assertPortfolioLegacyReaderDatabaseSession(
        legacyReaderQueryable(),
        tables,
      ),
      /invalid table allowlist/i,
    );
  }
});
