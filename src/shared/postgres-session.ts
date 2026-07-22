interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

const POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

type BoundaryRole =
  "portfolio_runtime" | "portfolio_migrator" | "legal_audit_writer";

const CAPABILITY_LOGIN: Readonly<Record<BoundaryRole, string>> = {
  portfolio_runtime: "portfolio_runtime_login",
  portfolio_migrator: "portfolio_migrator_login",
  legal_audit_writer: "portfolio_legal_login",
};

interface RelationAclExpectation {
  relationName: string;
  privileges: readonly string[];
}

interface RoutineAclExpectation {
  routineName: string;
  identityArguments: string;
  privileges: readonly string[];
}

const RUNTIME_RELATION_ACL: readonly RelationAclExpectation[] = [
  {
    relationName: "admin_policy_acceptance",
    privileges: ["SELECT", "INSERT", "UPDATE"],
  },
  { relationName: "ai_models", privileges: ["SELECT"] },
  { relationName: "all_skills", privileges: ["SELECT", "INSERT", "UPDATE"] },
  { relationName: "audit_logs", privileges: ["INSERT"] },
  { relationName: "bio", privileges: ["SELECT"] },
  { relationName: "bio_paragraphs", privileges: ["SELECT"] },
  { relationName: "browser_request_logs", privileges: ["INSERT"] },
  {
    relationName: "browser_tracking",
    privileges: ["SELECT", "INSERT", "UPDATE"],
  },
  {
    relationName: "browser_tracking_ips",
    privileges: ["SELECT", "INSERT", "UPDATE"],
  },
  {
    relationName: "career_event_checkpoints",
    privileges: ["SELECT", "INSERT", "UPDATE"],
  },
  {
    relationName: "career_event_inbox",
    privileges: ["SELECT", "INSERT", "UPDATE"],
  },
  { relationName: "career_event_quarantine", privileges: ["INSERT"] },
  {
    relationName: "education",
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  {
    relationName: "experiences",
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  { relationName: "github_timeline_events", privileges: ["SELECT", "INSERT"] },
  { relationName: "ip_rate_logs", privileges: ["INSERT"] },
  { relationName: "linkedin_timeline_events", privileges: ["SELECT"] },
  { relationName: "personal_information", privileges: ["SELECT"] },
  {
    relationName: "portfolio_skills",
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  { relationName: "projects", privileges: ["SELECT", "INSERT", "UPDATE"] },
  {
    relationName: "skills_group",
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  { relationName: "users", privileges: ["SELECT", "INSERT", "UPDATE"] },
  {
    relationName: "welcome_messages",
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  { relationName: "xyz_bullets", privileges: ["SELECT", "INSERT", "DELETE"] },
];

const LEGAL_RELATION_ACL: readonly RelationAclExpectation[] = [
  { relationName: "legal_document_versions", privileges: ["INSERT"] },
];

const AUDIT_OPERATOR_MUTATION_RELATIONS = [
  "users",
  "projects",
  "ai_models",
  "xyz_bullets",
  "bio",
  "bio_paragraphs",
  "skills_group",
  "all_skills",
  "portfolio_skills",
  "github_timeline_events",
  "linkedin_timeline_events",
  "personal_information",
  "admin_policy_acceptance",
  "education",
  "experiences",
  "browser_tracking",
  "browser_tracking_ips",
  "browser_request_logs",
  "ip_rate_logs",
  "welcome_messages",
  "career_event_inbox",
  "career_event_checkpoints",
  "career_event_quarantine",
] as const;

const AUDIT_OPERATOR_RELATION_ACL: readonly RelationAclExpectation[] = [
  ...AUDIT_OPERATOR_MUTATION_RELATIONS.map((relationName) => ({
    relationName,
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  })),
  { relationName: "database_mutation_audit", privileges: ["SELECT"] },
  { relationName: "database_compensation_payloads", privileges: ["SELECT"] },
];

const PORTFOLIO_ROUTINE_ACL: readonly (RoutineAclExpectation & {
  roleName: BoundaryRole;
})[] = [
  {
    roleName: "portfolio_migrator",
    routineName: "compensate_database_mutation",
    identityArguments: "requested_audit_id uuid, expected_current_digest text",
    privileges: ["EXECUTE"],
  },
  {
    roleName: "portfolio_runtime",
    routineName: "database_audit_chain_summary",
    identityArguments: "",
    privileges: ["EXECUTE"],
  },
  {
    roleName: "portfolio_migrator",
    routineName: "record_database_audit_release",
    identityArguments: "p_release_sha text, p_image_digest text",
    privileges: ["EXECUTE"],
  },
];

const MIGRATOR_MEMBERSHIPS = [
  "portfolio_audit_owner",
  "portfolio_compensation_operator",
] as const;

const ALLOWED_BOUNDARY_SCHEMAS = ["portfolio", "extensions", "public"] as const;

function boundaryRoleExpectations(expectedRole: string): {
  role: BoundaryRole;
  allowedSchemas: readonly string[];
  relationAcl: readonly RelationAclExpectation[];
} {
  if (
    expectedRole !== "portfolio_runtime" &&
    expectedRole !== "portfolio_migrator" &&
    expectedRole !== "legal_audit_writer"
  ) {
    throw new Error(
      `Unsupported Portfolio database boundary role: ${expectedRole}`,
    );
  }
  return {
    role: expectedRole,
    allowedSchemas: ALLOWED_BOUNDARY_SCHEMAS,
    relationAcl:
      expectedRole === "portfolio_runtime"
        ? RUNTIME_RELATION_ACL
        : expectedRole === "legal_audit_writer"
          ? LEGAL_RELATION_ACL
          : [],
  };
}

interface DatabaseSessionEvidence {
  sessionUser: string;
  currentUser: string;
  roleExists: boolean;
  roleCanLogin: boolean;
  roleIsSuperuser: boolean;
  roleBypassesRls: boolean;
  roleCanCreateDatabase: boolean;
  roleCanCreateRole: boolean;
  roleCanReplicate: boolean;
  roleInherits: boolean;
  hasAdminOption: boolean;
  memberships: string[];
  roleMembershipsAreValid: boolean;
  auditRolesAreValid: boolean;
  inheritsPrivilegedRole: boolean;
  canCreateDatabaseObjects: boolean;
  hasDatabaseTempPrivilege: boolean;
  canCreatePublicSchemaObjects: boolean;
  hasPublicSchemaUsage: boolean;
  canCreatePortfolioSchemaObjects: boolean;
  hasPortfolioSchemaUsage: boolean;
  canCreateExtensionsSchemaObjects: boolean;
  hasExtensionsSchemaUsage: boolean;
  vectorExtensionIsValid: boolean;
  vectorTypeIsValid: boolean;
  portfolioRolesOwnVectorObjects: boolean;
  ownsApplicationObjects: boolean;
  ownsOutsidePortfolioObjects: boolean;
  hasPublicObjectAccess: boolean;
  namespaceAccessIsValid: boolean;
  schemaAclIsValid: boolean;
  relationAclIsValid: boolean;
  portfolioAclIsExact: boolean;
  columnAclIsValid: boolean;
  routineAclIsValid: boolean;
  typeAclIsValid: boolean;
  legalExposureIsValid: boolean;
  legalWriterPolicyIsValid: boolean;
  migratorOwnsPortfolioObjects: boolean;
  directLoginPrivilegesAreEmpty: boolean;
  loginOwnsNoObjects: boolean;
  loginMembershipIsExact: boolean;
  defaultAclIsExact: boolean;
  effectiveAclIsExact: boolean;
  timezone: string;
  searchPath: string;
}

interface LegacyReaderSessionEvidence {
  sessionUser: string;
  currentUser: string;
  roleExists: boolean;
  roleCanLogin: boolean;
  roleIsSuperuser: boolean;
  roleBypassesRls: boolean;
  roleCanCreateDatabase: boolean;
  roleCanCreateRole: boolean;
  roleCanReplicate: boolean;
  roleInherits: boolean;
  hasAdminOption: boolean;
  memberships: string[];
  inheritsPrivilegedRole: boolean;
  canCreateDatabaseObjects: boolean;
  canCreatePublicSchemaObjects: boolean;
  hasPublicSchemaUsage: boolean;
  ownsApplicationObjects: boolean;
  hasSiblingSchemaAccess: boolean;
  allAllowedTablesExist: boolean;
  canReadAllAllowedTables: boolean;
  hasValidAllowedRowSecurity: boolean;
  hasAllowedWriteAccess: boolean;
  hasUnexpectedPublicObjectAccess: boolean;
  hasPublicFunctionExecute: boolean;
  searchPath: string;
}

function isEvidence(value: unknown): value is DatabaseSessionEvidence {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.sessionUser === "string" &&
    typeof row.currentUser === "string" &&
    typeof row.roleExists === "boolean" &&
    typeof row.roleCanLogin === "boolean" &&
    typeof row.roleIsSuperuser === "boolean" &&
    typeof row.roleBypassesRls === "boolean" &&
    typeof row.roleCanCreateDatabase === "boolean" &&
    typeof row.roleCanCreateRole === "boolean" &&
    typeof row.roleCanReplicate === "boolean" &&
    typeof row.roleInherits === "boolean" &&
    typeof row.hasAdminOption === "boolean" &&
    Array.isArray(row.memberships) &&
    row.memberships.every((membership) => typeof membership === "string") &&
    typeof row.roleMembershipsAreValid === "boolean" &&
    typeof row.auditRolesAreValid === "boolean" &&
    typeof row.inheritsPrivilegedRole === "boolean" &&
    typeof row.canCreateDatabaseObjects === "boolean" &&
    typeof row.hasDatabaseTempPrivilege === "boolean" &&
    typeof row.canCreatePublicSchemaObjects === "boolean" &&
    typeof row.hasPublicSchemaUsage === "boolean" &&
    typeof row.canCreatePortfolioSchemaObjects === "boolean" &&
    typeof row.hasPortfolioSchemaUsage === "boolean" &&
    typeof row.canCreateExtensionsSchemaObjects === "boolean" &&
    typeof row.hasExtensionsSchemaUsage === "boolean" &&
    typeof row.vectorExtensionIsValid === "boolean" &&
    typeof row.vectorTypeIsValid === "boolean" &&
    typeof row.portfolioRolesOwnVectorObjects === "boolean" &&
    typeof row.ownsApplicationObjects === "boolean" &&
    typeof row.ownsOutsidePortfolioObjects === "boolean" &&
    typeof row.hasPublicObjectAccess === "boolean" &&
    typeof row.namespaceAccessIsValid === "boolean" &&
    typeof row.schemaAclIsValid === "boolean" &&
    typeof row.relationAclIsValid === "boolean" &&
    typeof row.portfolioAclIsExact === "boolean" &&
    typeof row.columnAclIsValid === "boolean" &&
    typeof row.routineAclIsValid === "boolean" &&
    typeof row.typeAclIsValid === "boolean" &&
    typeof row.legalExposureIsValid === "boolean" &&
    typeof row.legalWriterPolicyIsValid === "boolean" &&
    typeof row.migratorOwnsPortfolioObjects === "boolean" &&
    typeof row.directLoginPrivilegesAreEmpty === "boolean" &&
    typeof row.loginOwnsNoObjects === "boolean" &&
    typeof row.loginMembershipIsExact === "boolean" &&
    typeof row.defaultAclIsExact === "boolean" &&
    typeof row.effectiveAclIsExact === "boolean" &&
    typeof row.timezone === "string" &&
    typeof row.searchPath === "string"
  );
}

function isLegacyReaderEvidence(
  value: unknown,
): value is LegacyReaderSessionEvidence {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.sessionUser === "string" &&
    typeof row.currentUser === "string" &&
    typeof row.roleExists === "boolean" &&
    typeof row.roleCanLogin === "boolean" &&
    typeof row.roleIsSuperuser === "boolean" &&
    typeof row.roleBypassesRls === "boolean" &&
    typeof row.roleCanCreateDatabase === "boolean" &&
    typeof row.roleCanCreateRole === "boolean" &&
    typeof row.roleCanReplicate === "boolean" &&
    typeof row.roleInherits === "boolean" &&
    typeof row.hasAdminOption === "boolean" &&
    Array.isArray(row.memberships) &&
    row.memberships.every((membership) => typeof membership === "string") &&
    typeof row.inheritsPrivilegedRole === "boolean" &&
    typeof row.canCreateDatabaseObjects === "boolean" &&
    typeof row.canCreatePublicSchemaObjects === "boolean" &&
    typeof row.hasPublicSchemaUsage === "boolean" &&
    typeof row.ownsApplicationObjects === "boolean" &&
    typeof row.hasSiblingSchemaAccess === "boolean" &&
    typeof row.allAllowedTablesExist === "boolean" &&
    typeof row.canReadAllAllowedTables === "boolean" &&
    typeof row.hasValidAllowedRowSecurity === "boolean" &&
    typeof row.hasAllowedWriteAccess === "boolean" &&
    typeof row.hasUnexpectedPublicObjectAccess === "boolean" &&
    typeof row.hasPublicFunctionExecute === "boolean" &&
    typeof row.searchPath === "string"
  );
}

async function databaseSessionEvidence(
  queryable: Queryable,
  expectedRole: string,
): Promise<DatabaseSessionEvidence | undefined> {
  const expectations = boundaryRoleExpectations(expectedRole);
  const expectedRelationAcl = expectations.relationAcl.flatMap(
    ({ relationName, privileges }) =>
      privileges.map((privilegeType) => ({ relationName, privilegeType })),
  );
  const expectedPortfolioAcl = [
    ...RUNTIME_RELATION_ACL.flatMap(({ relationName, privileges }) =>
      privileges.map((privilegeType) => ({
        roleName: "portfolio_runtime",
        relationName,
        privilegeType,
      })),
    ),
    ...LEGAL_RELATION_ACL.flatMap(({ relationName, privileges }) =>
      privileges.map((privilegeType) => ({
        roleName: "legal_audit_writer",
        relationName,
        privilegeType,
      })),
    ),
    ...AUDIT_OPERATOR_RELATION_ACL.flatMap(
      ({ relationName, privileges }) =>
        privileges.map((privilegeType) => ({
          roleName: "portfolio_compensation_operator",
          relationName,
          privilegeType,
        })),
    ),
  ];
  const expectedPortfolioRoutineAcl = PORTFOLIO_ROUTINE_ACL.flatMap(
    ({ roleName, routineName, identityArguments, privileges }) =>
      privileges.map((privilegeType) => ({
        roleName,
        routineName,
        identityArguments,
        privilegeType,
      })),
  );
  const result = await queryable.query(
    [
      "WITH role_expectation AS (",
      "  SELECT $1::name AS expected_role, $2::text[] AS allowed_schemas",
      "), expected_relation_acl AS (",
      '  SELECT expected."relationName" AS relation_name, expected."privilegeType" AS privilege_type',
      "  FROM jsonb_to_recordset($3::jsonb)",
      '    AS expected("relationName" text, "privilegeType" text)',
      "), expected_portfolio_acl AS (",
      '  SELECT expected."roleName" AS role_name,',
      '    expected."relationName" AS relation_name,',
      '    expected."privilegeType" AS privilege_type',
      "  FROM jsonb_to_recordset($4::jsonb)",
      '    AS expected("roleName" text, "relationName" text, "privilegeType" text)',
      "), expected_portfolio_routine_acl AS (",
      '  SELECT expected."roleName" AS role_name,',
      '    expected."routineName" AS routine_name,',
      '    expected."identityArguments" AS identity_arguments,',
      '    expected."privilegeType" AS privilege_type',
      "  FROM jsonb_to_recordset($5::jsonb)",
      '    AS expected("roleName" text, "routineName" text, "identityArguments" text, "privilegeType" text)',
      "), boundary_role AS (",
      "  SELECT role.oid, role.rolname",
      "  FROM pg_roles role",
      "  JOIN role_expectation expectation ON expectation.expected_role = role.rolname",
      "), login_role AS (",
      "  SELECT role.oid, role.rolname",
      "  FROM pg_roles role",
      "  WHERE role.rolname = $6::name",
      "), audit_roles AS (",
      "  SELECT role.oid, role.rolname",
      "  FROM pg_roles role",
      "  WHERE role.rolname IN ('portfolio_audit_owner', 'portfolio_compensation_operator')",
      "), vector_extension AS (",
      "  SELECT extension.oid",
      "  FROM pg_extension extension",
      "  WHERE extension.extname = 'vector'",
      "), relation_acl AS (",
      "  SELECT namespace.nspname, object.oid, object.relname, object.relkind, object.relowner,",
      "    privilege.grantee, privilege.privilege_type, privilege.is_grantable",
      "  FROM pg_class object",
      "  JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "  CROSS JOIN LATERAL aclexplode(COALESCE(",
      "    object.relacl,",
      "    acldefault(",
      "      CASE WHEN object.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,",
      "      object.relowner",
      "    )",
      "  )) privilege",
      "  WHERE object.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      "), effective_relation_acl AS (",
      "  SELECT namespace.nspname, object.oid, object.relname, object.relkind,",
      "    requested.privilege_type",
      "  FROM pg_class object",
      "  JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "  CROSS JOIN LATERAL unnest(",
      "    CASE WHEN object.relkind = 'S'",
      "      THEN ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]",
      "      ELSE ARRAY[",
      "        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'",
      "      ]::text[]",
      "    END",
      "  ) requested(privilege_type)",
      "  WHERE object.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      "    AND namespace.nspname <> 'information_schema'",
      "    AND namespace.nspname NOT LIKE 'pg_%'",
      "    AND CASE WHEN object.relkind = 'S'",
      "      THEN has_sequence_privilege(current_user, object.oid, requested.privilege_type)",
      "      ELSE has_table_privilege(current_user, object.oid, requested.privilege_type)",
      "    END",
      "), column_acl AS (",
      "  SELECT namespace.nspname, object.oid, object.relname, attribute.attname,",
      "    privilege.grantee, privilege.privilege_type, privilege.is_grantable",
      "  FROM pg_attribute attribute",
      "  JOIN pg_class object ON object.oid = attribute.attrelid",
      "  JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "  CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege",
      "  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped",
      "), schema_acl AS (",
      "  SELECT namespace.nspname, namespace.nspowner,",
      "    privilege.grantee, privilege.privilege_type, privilege.is_grantable",
      "  FROM pg_namespace namespace",
      "  CROSS JOIN LATERAL aclexplode(COALESCE(",
      "    namespace.nspacl, acldefault('n', namespace.nspowner)",
      "  )) privilege",
      "), routine_acl AS (",
      "  SELECT namespace.nspname, routine.oid, routine.proname,",
      "    pg_get_function_identity_arguments(routine.oid) AS identity_arguments,",
      "    routine.proowner,",
      "    privilege.grantee, privilege.privilege_type, privilege.is_grantable",
      "  FROM pg_proc routine",
      "  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "  CROSS JOIN LATERAL aclexplode(COALESCE(",
      "    routine.proacl, acldefault('f', routine.proowner)",
      "  )) privilege",
      "), type_acl AS (",
      "  SELECT namespace.nspname, type.oid, type.typowner,",
      "    privilege.grantee, privilege.privilege_type, privilege.is_grantable",
      "  FROM pg_type type",
      "  JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "  CROSS JOIN LATERAL aclexplode(COALESCE(",
      "    type.typacl, acldefault('T', type.typowner)",
      "  )) privilege",
      "  WHERE type.typrelid = 0 AND type.typelem = 0",
      "), exposed_grantees AS (",
      "  SELECT 0::oid AS oid",
      "  UNION ALL",
      "  SELECT role.oid FROM pg_roles role WHERE role.rolname IN ('anon', 'authenticated')",
      ")",
      "SELECT",
      '  session_user AS "sessionUser",',
      '  current_user AS "currentUser",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_roles WHERE rolname = current_user",
      '  ) AS "roleExists",',
      "  COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanLogin",',
      "  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleIsSuperuser",',
      "  COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleBypassesRls",',
      "  COALESCE((SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanCreateDatabase",',
      "  COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanCreateRole",',
      "  COALESCE((SELECT rolreplication FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanReplicate",',
      "  COALESCE((SELECT rolinherit FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleInherits",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_auth_members membership",
      "    JOIN pg_roles member ON member.oid = membership.member",
      "    WHERE member.rolname = current_user AND membership.admin_option",
      '  ) AS "hasAdminOption",',
      "  COALESCE((",
      "    SELECT array_agg(granted.rolname::text ORDER BY granted.rolname)",
      "    FROM pg_auth_members membership",
      "    JOIN pg_roles member ON member.oid = membership.member",
      "    JOIN pg_roles granted ON granted.oid = membership.roleid",
      "    WHERE member.rolname = current_user",
      "  ), ARRAY[]::text[]) AS memberships,",
      "  CASE WHEN current_user = 'portfolio_migrator' THEN",
      "    COALESCE((",
      "      SELECT count(*) = 2 AND bool_and(",
      "        granted.rolname IN ('portfolio_audit_owner', 'portfolio_compensation_operator')",
      "        AND NOT membership.admin_option",
      "        AND NOT membership.inherit_option",
      "        AND membership.set_option",
      "      )",
      "      FROM pg_auth_members membership",
      "      JOIN pg_roles member ON member.oid = membership.member",
      "      JOIN pg_roles granted ON granted.oid = membership.roleid",
      "      WHERE member.rolname = current_user",
      "    ), false)",
      "  ELSE NOT EXISTS (",
      "    SELECT 1 FROM pg_auth_members membership",
      "    JOIN pg_roles member ON member.oid = membership.member",
      "    WHERE member.rolname = current_user",
      '  ) END AS "roleMembershipsAreValid",',
      "  (SELECT count(*) = 2 AND bool_and(",
      "    NOT role.rolcanlogin",
      "    AND NOT role.rolinherit",
      "    AND NOT role.rolsuper",
      "    AND NOT role.rolcreatedb",
      "    AND NOT role.rolcreaterole",
      "    AND NOT role.rolreplication",
      "    AND NOT role.rolbypassrls",
      "  ) FROM pg_roles role",
      "  WHERE role.rolname IN ('portfolio_audit_owner', 'portfolio_compensation_operator'))",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_auth_members membership",
      "    JOIN audit_roles member ON member.oid = membership.member",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM schema_acl privilege",
      "    JOIN audit_roles role ON role.oid = privilege.grantee",
      "    WHERE privilege.nspname <> 'portfolio'",
      "      OR privilege.privilege_type <> 'USAGE'",
      "      OR privilege.is_grantable",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM audit_roles role",
      "    WHERE NOT EXISTS (",
      "      SELECT 1 FROM schema_acl privilege",
      "      WHERE privilege.nspname = 'portfolio'",
      "        AND privilege.grantee = role.oid",
      "        AND privilege.privilege_type = 'USAGE'",
      "        AND NOT privilege.is_grantable",
      "    )",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM relation_acl privilege",
      "    JOIN audit_roles role ON role.oid = privilege.grantee",
      "    WHERE privilege.nspname <> 'portfolio'",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM column_acl privilege",
      "    JOIN audit_roles role ON role.oid = privilege.grantee",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM routine_acl privilege",
      "    JOIN audit_roles role ON role.oid = privilege.grantee",
      "    WHERE privilege.nspname <> 'portfolio'",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM type_acl privilege",
      "    JOIN audit_roles role ON role.oid = privilege.grantee",
      "    WHERE privilege.nspname <> 'portfolio'",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM audit_roles role",
      "    WHERE has_database_privilege(role.oid, current_database(), 'CREATE')",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_class object",
      "    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "    JOIN audit_roles role ON role.oid = object.relowner",
      "    WHERE namespace.nspname <> 'portfolio'",
      "      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "      AND namespace.nspname NOT LIKE 'pg_toast%'",
      "      AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_proc routine",
      "    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "    JOIN audit_roles role ON role.oid = routine.proowner",
      "    WHERE namespace.nspname <> 'portfolio'",
      "      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "      AND namespace.nspname NOT LIKE 'pg_toast%'",
      "      AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_type type",
      "    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "    JOIN audit_roles role ON role.oid = type.typowner",
      "    WHERE type.typrelid = 0 AND type.typelem = 0",
      "      AND namespace.nspname <> 'portfolio'",
      "      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "      AND namespace.nspname NOT LIKE 'pg_toast%'",
      "      AND namespace.nspname NOT LIKE 'pg_temp_%'",
      '  ) AS "auditRolesAreValid",',
      "  EXISTS (",
      "    SELECT 1",
      "    FROM pg_roles",
      "    WHERE (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)",
      "      AND pg_has_role(current_user, oid, 'MEMBER')",
      '  ) AS "inheritsPrivilegedRole",',
      "  has_database_privilege(current_user, current_database(), 'CREATE')",
      '    AS "canCreateDatabaseObjects",',
      "  has_database_privilege(current_user, current_database(), 'TEMP')",
      '    AS "hasDatabaseTempPrivilege",',
      "  has_schema_privilege(current_user, 'public', 'CREATE')",
      '    AS "canCreatePublicSchemaObjects",',
      "  has_schema_privilege(current_user, 'public', 'USAGE')",
      '    AS "hasPublicSchemaUsage",',
      "  has_schema_privilege(current_user, 'portfolio', 'CREATE')",
      '    AS "canCreatePortfolioSchemaObjects",',
      "  has_schema_privilege(current_user, 'portfolio', 'USAGE')",
      '    AS "hasPortfolioSchemaUsage",',
      "  has_schema_privilege(current_user, 'extensions', 'CREATE')",
      '    AS "canCreateExtensionsSchemaObjects",',
      "  has_schema_privilege(current_user, 'extensions', 'USAGE')",
      '    AS "hasExtensionsSchemaUsage",',
      "  COALESCE((",
      "    SELECT count(*) = 1 AND bool_and(",
      "      (namespace.nspname = 'extensions' AND owner.rolname = 'postgres')",
      "      OR (namespace.nspname = 'public' AND owner.rolname = 'supabase_admin')",
      "    )",
      "    FROM pg_extension extension",
      "    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace",
      "    JOIN pg_roles owner ON owner.oid = extension.extowner",
      "    WHERE extension.extname = 'vector'",
      '  ), false) AS "vectorExtensionIsValid",',
      "  COALESCE((",
      "    SELECT count(*) = 1 AND bool_and(",
      "      (namespace.nspname = 'extensions' AND owner.rolname = 'postgres')",
      "      OR (namespace.nspname = 'public' AND owner.rolname = 'supabase_admin')",
      "    )",
      "    FROM pg_type type",
      "    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "    JOIN pg_roles owner ON owner.oid = type.typowner",
      "    WHERE type.typname = 'vector' AND type.typrelid = 0",
      '  ), false) AS "vectorTypeIsValid",',
      "  (",
      "    EXISTS (",
      "      SELECT 1 FROM pg_extension extension",
      "      JOIN pg_roles owner ON owner.oid = extension.extowner",
      "      WHERE extension.extname = 'vector'",
      "        AND (left(owner.rolname, 10) = 'portfolio_' OR owner.rolname = 'legal_audit_writer')",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_type type",
      "      JOIN pg_roles owner ON owner.oid = type.typowner",
      "      WHERE type.typname = 'vector'",
      "        AND (left(owner.rolname, 10) = 'portfolio_' OR owner.rolname = 'legal_audit_writer')",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_namespace namespace",
      "      JOIN pg_roles owner ON owner.oid = namespace.nspowner",
      "      WHERE namespace.nspname = 'extensions'",
      "        AND (left(owner.rolname, 10) = 'portfolio_' OR owner.rolname = 'legal_audit_writer')",
      "    )",
      '  ) AS "portfolioRolesOwnVectorObjects",',
      "  (",
      "    EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND object.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_proc routine",
      "      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND routine.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_type type",
      "      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "      WHERE namespace.nspname = 'portfolio' AND type.typrelid = 0",
      "        AND type.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_namespace namespace",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND namespace.nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_extension extension",
      "      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND extension.extowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      '  ) AS "ownsApplicationObjects",',
      "  (",
      "    EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      WHERE namespace.nspname <> 'portfolio'",
      "        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND object.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_proc routine",
      "      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      WHERE namespace.nspname <> 'portfolio'",
      "        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND routine.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_type type",
      "      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "      WHERE namespace.nspname <> 'portfolio' AND type.typrelid = 0",
      "        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND type.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_namespace namespace",
      "      WHERE namespace.nspname <> 'portfolio'",
      "        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND namespace.nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_extension extension",
      "      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace",
      "      WHERE namespace.nspname <> 'portfolio'",
      "        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND extension.extowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      '  ) AS "ownsOutsidePortfolioObjects",',
      "  has_schema_privilege(current_user, 'public', 'USAGE') AND (",
      "    EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      WHERE namespace.nspname = 'public'",
      "        AND (",
      "          (object.relkind IN ('r', 'p', 'v', 'm', 'f') AND (",
      "            has_table_privilege(current_user, object.oid, 'SELECT')",
      "            OR has_table_privilege(current_user, object.oid, 'INSERT')",
      "            OR has_table_privilege(current_user, object.oid, 'UPDATE')",
      "            OR has_table_privilege(current_user, object.oid, 'DELETE')",
      "            OR has_table_privilege(current_user, object.oid, 'TRUNCATE')",
      "            OR has_table_privilege(current_user, object.oid, 'REFERENCES')",
      "            OR has_table_privilege(current_user, object.oid, 'TRIGGER')",
      "            OR has_any_column_privilege(current_user, object.oid, 'SELECT')",
      "            OR has_any_column_privilege(current_user, object.oid, 'INSERT')",
      "            OR has_any_column_privilege(current_user, object.oid, 'UPDATE')",
      "            OR has_any_column_privilege(current_user, object.oid, 'REFERENCES')",
      "          ))",
      "          OR (object.relkind = 'S' AND (",
      "            has_sequence_privilege(current_user, object.oid, 'USAGE')",
      "            OR has_sequence_privilege(current_user, object.oid, 'SELECT')",
      "            OR has_sequence_privilege(current_user, object.oid, 'UPDATE')",
      "          ))",
      "        )",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_proc routine",
      "      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      WHERE namespace.nspname = 'public'",
      "        AND has_function_privilege(current_user, routine.oid, 'EXECUTE')",
      "    )",
      '  ) AS "hasPublicObjectAccess",',
      "  NOT EXISTS (",
      "    SELECT 1",
      "    FROM pg_namespace namespace",
      "    CROSS JOIN role_expectation expectation",
      "    WHERE namespace.nspname <> 'information_schema'",
      "      AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND NOT (namespace.nspname = ANY(expectation.allowed_schemas))",
      "      AND (",
      "        has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "        OR has_schema_privilege(current_user, namespace.oid, 'CREATE')",
      "        OR EXISTS (",
      "          SELECT 1 FROM relation_acl privilege",
      "          WHERE privilege.nspname = namespace.nspname",
      "            AND privilege.grantee = (SELECT oid FROM boundary_role)",
      "        )",
      "        OR EXISTS (",
      "          SELECT 1 FROM column_acl privilege",
      "          WHERE privilege.nspname = namespace.nspname",
      "            AND privilege.grantee = (SELECT oid FROM boundary_role)",
      "        )",
      "        OR EXISTS (",
      "          SELECT 1 FROM routine_acl privilege",
      "          WHERE privilege.nspname = namespace.nspname",
      "            AND privilege.grantee = (SELECT oid FROM boundary_role)",
      "        )",
      "        OR EXISTS (",
      "          SELECT 1 FROM type_acl privilege",
      "          WHERE privilege.nspname = namespace.nspname",
      "            AND privilege.grantee = (SELECT oid FROM boundary_role)",
      "        )",
      "      )",
      '  ) AS "namespaceAccessIsValid",',
      "  CASE WHEN current_user = 'portfolio_migrator' THEN",
      "    COALESCE((",
      "      SELECT count(*) = 3 AND bool_and(",
      "        CASE",
      "          WHEN privilege.nspname = 'portfolio'",
      "            AND privilege.privilege_type IN ('USAGE', 'CREATE')",
      "            THEN privilege.is_grantable = (",
      "              to_regclass('portfolio.database_mutation_audit') IS NULL",
      "            )",
      "          WHEN privilege.nspname = 'extensions'",
      "            AND privilege.privilege_type = 'USAGE'",
      "            THEN NOT privilege.is_grantable",
      "          ELSE false",
      "        END",
      "      )",
      "      FROM schema_acl privilege",
      "      WHERE privilege.grantee = (SELECT oid FROM boundary_role)",
      "        AND privilege.nspname <> 'information_schema'",
      "        AND privilege.nspname NOT LIKE 'pg_%'",
      "    ), false)",
      "  ELSE COALESCE((",
      "    SELECT count(*) = 2 AND bool_and(",
      "      privilege.nspname IN ('portfolio', 'extensions')",
      "      AND privilege.privilege_type = 'USAGE'",
      "      AND NOT privilege.is_grantable",
      "    )",
      "    FROM schema_acl privilege",
      "    WHERE privilege.grantee = (SELECT oid FROM boundary_role)",
      "      AND privilege.nspname <> 'information_schema'",
      "      AND privilege.nspname NOT LIKE 'pg_%'",
      "  ), false) END AS \"schemaAclIsValid\",",
      "  CASE WHEN current_user = 'portfolio_migrator' THEN",
      "    NOT EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      JOIN pg_roles owner ON owner.oid = object.relowner",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND object.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      "        AND owner.rolname <> CASE",
      "          WHEN object.relname IN (",
      "            'database_audit_chain_heads',",
      "            'database_mutation_audit',",
      "            'database_compensation_payloads',",
      "            'database_audit_activation',",
      "            'database_audit_releases',",
      "            'database_mutation_audit_sequence_number_seq'",
      "          ) OR EXISTS (",
      "            SELECT 1 FROM pg_index index_catalog",
      "            JOIN pg_class indexed_table ON indexed_table.oid = index_catalog.indrelid",
      "            WHERE index_catalog.indexrelid = object.oid",
      "              AND indexed_table.relname IN (",
      "                'database_audit_chain_heads',",
      "                'database_mutation_audit',",
      "                'database_compensation_payloads',",
      "                'database_audit_activation',",
      "                'database_audit_releases'",
      "              )",
      "          ) THEN 'portfolio_audit_owner'",
      "          ELSE 'portfolio_migrator'",
      "        END",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM effective_relation_acl privilege",
      "      WHERE privilege.nspname <> 'portfolio'",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM relation_acl privilege",
      "      WHERE privilege.nspname = 'portfolio'",
      "        AND privilege.grantee IN (SELECT oid FROM exposed_grantees)",
      "    )",
      "  ELSE",
      "    NOT EXISTS (",
      "      SELECT 1 FROM relation_acl actual",
      "      WHERE actual.nspname = 'portfolio'",
      "        AND actual.grantee = (SELECT oid FROM boundary_role)",
      "        AND (",
      "          actual.relkind = 'S'",
      "          OR actual.is_grantable",
      "          OR NOT EXISTS (",
      "            SELECT 1 FROM expected_relation_acl expected",
      "            WHERE expected.relation_name = actual.relname",
      "              AND expected.privilege_type = actual.privilege_type",
      "          )",
      "        )",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM expected_relation_acl expected",
      "      WHERE NOT EXISTS (",
      "        SELECT 1 FROM relation_acl actual",
      "        WHERE actual.nspname = 'portfolio'",
      "          AND actual.grantee = (SELECT oid FROM boundary_role)",
      "          AND actual.relname = expected.relation_name",
      "          AND actual.privilege_type = expected.privilege_type",
      "          AND NOT actual.is_grantable",
      "      )",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM effective_relation_acl actual",
      "      WHERE actual.nspname <> 'portfolio'",
      "        OR actual.relkind = 'S'",
      "        OR NOT EXISTS (",
      "          SELECT 1 FROM expected_relation_acl expected",
      "          WHERE expected.relation_name = actual.relname",
      "            AND expected.privilege_type = actual.privilege_type",
      "        )",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM relation_acl privilege",
      "      WHERE privilege.nspname = 'portfolio'",
      "        AND privilege.grantee IN (SELECT oid FROM exposed_grantees)",
      "    )",
      '  END AS "relationAclIsValid",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM relation_acl actual",
      "    WHERE actual.nspname = 'portfolio'",
      "      AND actual.grantee <> actual.relowner",
      "      AND (",
      "        actual.is_grantable",
      "        OR NOT EXISTS (",
      "          SELECT 1 FROM expected_portfolio_acl expected",
      "          JOIN pg_roles grantee ON grantee.rolname = expected.role_name",
      "          WHERE grantee.oid = actual.grantee",
      "            AND expected.relation_name = actual.relname",
      "            AND expected.privilege_type = actual.privilege_type",
      "        )",
      "      )",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM expected_portfolio_acl expected",
      "    JOIN pg_roles grantee ON grantee.rolname = expected.role_name",
      "    JOIN pg_class object ON object.relname = expected.relation_name",
      "    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      AND namespace.nspname = 'portfolio'",
      "    WHERE NOT EXISTS (",
      "      SELECT 1 FROM relation_acl actual",
      "      WHERE actual.oid = object.oid",
      "        AND actual.grantee = grantee.oid",
      "        AND actual.privilege_type = expected.privilege_type",
      "        AND NOT actual.is_grantable",
      "    )",
      '  ) AS "portfolioAclIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM column_acl privilege",
      "    WHERE privilege.nspname = 'portfolio'",
      "      OR privilege.grantee = (SELECT oid FROM boundary_role)",
      '  ) AS "columnAclIsValid",',
      "  NOT EXISTS (",
      "    SELECT 1",
      "    FROM pg_proc routine",
      "    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "    WHERE namespace.nspname <> 'information_schema'",
      "      AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND NOT (current_user = 'portfolio_migrator' AND namespace.nspname = 'portfolio')",
      "      AND has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "      AND has_function_privilege(current_user, routine.oid, 'EXECUTE')",
      "      AND NOT (namespace.nspname = 'portfolio' AND EXISTS (",
      "        SELECT 1 FROM expected_portfolio_routine_acl expected",
      "        WHERE expected.role_name = current_user",
      "          AND expected.routine_name = routine.proname",
      "          AND expected.identity_arguments = pg_get_function_identity_arguments(routine.oid)",
      "          AND expected.privilege_type = 'EXECUTE'",
      "      ))",
      "      AND NOT (",
      "        namespace.nspname IN ('extensions', 'public')",
      "        AND EXISTS (",
      "          SELECT 1 FROM pg_depend dependency",
      "          WHERE dependency.classid = 'pg_proc'::regclass",
      "            AND dependency.objid = routine.oid",
      "            AND dependency.refclassid = 'pg_extension'::regclass",
      "            AND dependency.refobjid = (SELECT oid FROM vector_extension)",
      "            AND dependency.deptype = 'e'",
      "        )",
      "      )",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM routine_acl privilege",
      "    WHERE privilege.grantee = (SELECT oid FROM boundary_role)",
      "      AND NOT (privilege.nspname = 'portfolio' AND EXISTS (",
      "        SELECT 1 FROM expected_portfolio_routine_acl expected",
      "        WHERE expected.role_name = current_user",
      "          AND expected.routine_name = privilege.proname",
      "          AND expected.identity_arguments = privilege.identity_arguments",
      "          AND expected.privilege_type = privilege.privilege_type",
      "      ))",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM routine_acl actual",
      "    WHERE actual.nspname = 'portfolio'",
      "      AND actual.grantee <> actual.proowner",
      "      AND (",
      "        actual.is_grantable",
      "        OR NOT EXISTS (",
      "          SELECT 1 FROM expected_portfolio_routine_acl expected",
      "          JOIN pg_roles grantee ON grantee.rolname = expected.role_name",
      "          WHERE grantee.oid = actual.grantee",
      "            AND expected.routine_name = actual.proname",
      "            AND expected.identity_arguments = actual.identity_arguments",
      "            AND expected.privilege_type = actual.privilege_type",
      "        )",
      "      )",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM expected_portfolio_routine_acl expected",
      "    JOIN pg_roles grantee ON grantee.rolname = expected.role_name",
      "    JOIN pg_proc routine ON routine.proname = expected.routine_name",
      "      AND pg_get_function_identity_arguments(routine.oid) = expected.identity_arguments",
      "    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      AND namespace.nspname = 'portfolio'",
      "    WHERE NOT EXISTS (",
      "      SELECT 1 FROM routine_acl actual",
      "      WHERE actual.oid = routine.oid",
      "        AND actual.grantee = grantee.oid",
      "        AND actual.privilege_type = expected.privilege_type",
      "        AND NOT actual.is_grantable",
      "    )",
      '  ) AS "routineAclIsValid",',
      "  NOT EXISTS (",
      "    SELECT 1",
      "    FROM pg_type type",
      "    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "    WHERE type.typrelid = 0 AND type.typelem = 0",
      "      AND namespace.nspname <> 'information_schema'",
      "      AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND NOT (current_user = 'portfolio_migrator' AND namespace.nspname = 'portfolio')",
      "      AND has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "      AND has_type_privilege(current_user, type.oid, 'USAGE')",
      "      AND NOT (",
      "        namespace.nspname IN ('extensions', 'public')",
      "        AND EXISTS (",
      "          SELECT 1 FROM pg_depend dependency",
      "          WHERE dependency.classid = 'pg_type'::regclass",
      "            AND dependency.objid = type.oid",
      "            AND dependency.refclassid = 'pg_extension'::regclass",
      "            AND dependency.refobjid = (SELECT oid FROM vector_extension)",
      "            AND dependency.deptype = 'e'",
      "        )",
      "      )",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM type_acl privilege",
      "    WHERE privilege.grantee = (SELECT oid FROM boundary_role)",
      "      AND NOT (current_user = 'portfolio_migrator' AND privilege.nspname = 'portfolio')",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM type_acl privilege",
      "    WHERE privilege.nspname = 'portfolio'",
      "      AND privilege.grantee <> privilege.typowner",
      '  ) AS "typeAclIsValid",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM relation_acl privilege",
      "    WHERE privilege.nspname = 'portfolio'",
      "      AND privilege.relname IN ('legal_document_versions', 'legal_document_active_ranges')",
      "      AND privilege.grantee IN (SELECT oid FROM exposed_grantees)",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM column_acl privilege",
      "    WHERE privilege.nspname = 'portfolio'",
      "      AND privilege.relname IN ('legal_document_versions', 'legal_document_active_ranges')",
      "      AND privilege.grantee IN (SELECT oid FROM exposed_grantees)",
      "  )",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_roles role",
      "    CROSS JOIN pg_class object",
      "    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "    WHERE role.rolname IN ('anon', 'authenticated')",
      "      AND namespace.nspname = 'portfolio'",
      "      AND object.relname IN ('legal_document_versions', 'legal_document_active_ranges')",
      "      AND (",
      "        has_table_privilege(role.rolname, object.oid, 'SELECT')",
      "        OR has_any_column_privilege(role.rolname, object.oid, 'SELECT')",
      "      )",
      '  ) AS "legalExposureIsValid",',
      "  CASE WHEN to_regclass('portfolio.legal_document_versions') IS NULL THEN true ELSE",
      "    COALESCE((",
      "      SELECT object.relrowsecurity",
      "        AND NOT object.relforcerowsecurity",
      "        AND (",
      "          SELECT count(*) = 1 AND bool_and(",
      "            policy.polname = 'legal_document_versions_writer_insert'",
      "            AND policy.polpermissive",
      "            AND policy.polcmd = 'a'",
      "            AND policy.polroles = ARRAY[writer.oid]::oid[]",
      "            AND policy.polqual IS NULL",
      "            AND pg_get_expr(policy.polwithcheck, policy.polrelid) = 'true'",
      "          )",
      "          FROM pg_policy policy",
      "          WHERE policy.polrelid = object.oid",
      "        )",
      "      FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      JOIN pg_roles writer ON writer.rolname = 'legal_audit_writer'",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND object.relname = 'legal_document_versions'",
      "        AND object.relkind IN ('r', 'p')",
      "    ), false)",
      '  END AS "legalWriterPolicyIsValid",',
      "  CASE WHEN current_user <> 'portfolio_migrator' THEN true ELSE",
      "    COALESCE((",
      "      SELECT owner.rolname = 'portfolio_migrator'",
      "      FROM pg_namespace namespace",
      "      JOIN pg_roles owner ON owner.oid = namespace.nspowner",
      "      WHERE namespace.nspname = 'portfolio'",
      "    ), false)",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      JOIN pg_roles owner ON owner.oid = object.relowner",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND owner.rolname <> CASE",
      "          WHEN object.relname IN (",
      "            'database_audit_chain_heads',",
      "            'database_mutation_audit',",
      "            'database_compensation_payloads',",
      "            'database_audit_activation',",
      "            'database_audit_releases',",
      "            'database_mutation_audit_sequence_number_seq'",
      "          ) OR EXISTS (",
      "            SELECT 1 FROM pg_index index_catalog",
      "            JOIN pg_class indexed_table ON indexed_table.oid = index_catalog.indrelid",
      "            WHERE index_catalog.indexrelid = object.oid",
      "              AND indexed_table.relname IN (",
      "                'database_audit_chain_heads',",
      "                'database_mutation_audit',",
      "                'database_compensation_payloads',",
      "                'database_audit_activation',",
      "                'database_audit_releases'",
      "              )",
      "          ) THEN 'portfolio_audit_owner'",
      "          ELSE 'portfolio_migrator'",
      "        END",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM pg_proc routine",
      "      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      JOIN pg_roles owner ON owner.oid = routine.proowner",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND owner.rolname <> CASE",
      "          WHEN routine.proname IN (",
      "            'suppress_redundant_updates_trigger', 'unique_key_recheck',",
      "            'database_audit_chain_summary'",
      "          ) AND pg_get_function_identity_arguments(routine.oid) = ''",
      "            THEN 'portfolio_audit_owner'",
      "          WHEN routine.proname = 'record_database_audit_release'",
      "            AND pg_get_function_identity_arguments(routine.oid)",
      "              = 'p_release_sha text, p_image_digest text'",
      "            THEN 'portfolio_audit_owner'",
      "          WHEN routine.proname = 'compensate_database_mutation'",
      "            AND pg_get_function_identity_arguments(routine.oid)",
      "              = 'requested_audit_id uuid, expected_current_digest text'",
      "            THEN 'portfolio_compensation_operator'",
      "          ELSE 'portfolio_migrator'",
      "        END",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1 FROM pg_type type",
      "      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "      WHERE namespace.nspname = 'portfolio'",
      "        AND type.typrelid = 0",
      "        AND type.typelem = 0",
      "        AND type.typowner <> (SELECT oid FROM boundary_role)",
      "    )",
      '  END AS "migratorOwnsPortfolioObjects",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_database database",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) privilege",
      "    WHERE privilege.grantee = (SELECT oid FROM login_role)",
      "  ) AND NOT EXISTS (SELECT 1 FROM schema_acl WHERE grantee = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM relation_acl WHERE grantee = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM column_acl WHERE grantee = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM routine_acl WHERE grantee = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM type_acl WHERE grantee = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (",
      "    SELECT 1 FROM pg_default_acl defaults",
      "    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege",
      "    WHERE defaults.defaclrole = (SELECT oid FROM login_role)",
      "      OR privilege.grantee = (SELECT oid FROM login_role)",
      '  ) AS "directLoginPrivilegesAreEmpty",',
      "  NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typowner = (SELECT oid FROM login_role))",
      "  AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extowner = (SELECT oid FROM login_role))",
      '    AS "loginOwnsNoObjects",',
      "  COALESCE((SELECT count(*) = 1 AND bool_and(",
      "    granted.rolname = current_user AND NOT membership.admin_option",
      "    AND NOT membership.inherit_option AND membership.set_option",
      "  ) FROM pg_auth_members membership",
      "  JOIN pg_roles granted ON granted.oid = membership.roleid",
      "  WHERE membership.member = (SELECT oid FROM login_role)), false)",
      '    AS "loginMembershipIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_default_acl defaults",
      "    JOIN pg_roles owner ON owner.oid = defaults.defaclrole",
      "    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege",
      "    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee",
      "    WHERE owner.rolname IN ('portfolio_runtime_login', 'portfolio_migrator_login', 'portfolio_legal_login', 'portfolio_legacy_reader_login', 'portfolio_runtime', 'legal_audit_writer', 'portfolio_legacy_reader')",
      "      OR (grantee.rolname IN ('portfolio_runtime_login', 'portfolio_migrator_login', 'portfolio_legal_login', 'portfolio_legacy_reader_login', 'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer', 'portfolio_audit_owner', 'portfolio_compensation_operator', 'portfolio_legacy_reader')",
      "        AND NOT (owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator') AND privilege.grantee = defaults.defaclrole))",
      "      OR (owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator') AND privilege.grantee <> defaults.defaclrole)",
      "  ) AND (SELECT count(*) FROM pg_default_acl defaults JOIN pg_roles owner ON owner.oid = defaults.defaclrole",
      "    WHERE owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator')",
      "      AND defaults.defaclnamespace = 0 AND defaults.defaclobjtype IN ('f', 'T')",
      "      AND NOT EXISTS (SELECT 1 FROM aclexplode(defaults.defaclacl) privilege WHERE privilege.grantee = 0)) = 6",
      '    AS "defaultAclIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM relation_acl actual",
      "    WHERE actual.nspname = 'portfolio' AND actual.grantee <> actual.relowner",
      "      AND (actual.is_grantable OR NOT EXISTS (",
      "        SELECT 1 FROM expected_portfolio_acl expected",
      "        JOIN pg_roles grantee ON grantee.rolname = expected.role_name",
      "        WHERE grantee.oid = actual.grantee",
      "          AND expected.relation_name = actual.relname",
      "          AND expected.privilege_type = actual.privilege_type",
      "      ))",
      '  ) AS "effectiveAclIsExact",',
      "  current_setting('TimeZone') AS timezone,",
      "  regexp_replace(current_setting('search_path'), '\\s*,\\s*', ', ', 'g')",
      '    AS "searchPath"',
    ].join("\n"),
    [
      expectations.role,
      [...expectations.allowedSchemas],
      JSON.stringify(expectedRelationAcl),
      JSON.stringify(expectedPortfolioAcl),
      JSON.stringify(expectedPortfolioRoutineAcl),
      CAPABILITY_LOGIN[expectations.role],
    ],
  );
  const evidence = result.rows.length === 1 ? result.rows[0] : undefined;
  if (evidence === undefined) return undefined;
  if (!isEvidence(evidence)) {
    const shape =
      typeof evidence === "object" && evidence !== null
        ? Object.entries(evidence as Record<string, unknown>)
            .map(
              ([key, value]) =>
                `${key}:${Array.isArray(value) ? "array" : typeof value}`,
            )
            .join(",")
        : typeof evidence;
    throw new Error(`Database session evidence was malformed: ${shape}`);
  }
  return evidence;
}

interface LoginTransitionEvidence {
  sessionUser: string;
  currentUser: string;
  loginCanLogin: boolean;
  loginInherits: boolean;
  loginMembershipIsExact: boolean;
  loginDirectAclIsEmpty: boolean;
  loginOwnsNoObjects: boolean;
  loginEffectiveObjectAclIsExact: boolean;
  loginEffectiveSchemaAclIsExact: boolean;
  defaultAclIsExact: boolean;
  timezone: string;
  searchPath: string;
}

function isLoginTransitionEvidence(value: unknown): value is LoginTransitionEvidence {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.sessionUser === "string" &&
    typeof row.currentUser === "string" &&
    typeof row.loginCanLogin === "boolean" &&
    typeof row.loginInherits === "boolean" &&
    typeof row.loginMembershipIsExact === "boolean" &&
    typeof row.loginDirectAclIsEmpty === "boolean" &&
    typeof row.loginOwnsNoObjects === "boolean" &&
    typeof row.loginEffectiveObjectAclIsExact === "boolean" &&
    typeof row.loginEffectiveSchemaAclIsExact === "boolean" &&
    typeof row.defaultAclIsExact === "boolean" &&
    typeof row.timezone === "string" &&
    typeof row.searchPath === "string"
  );
}

async function loginTransitionEvidence(
  queryable: Queryable,
  expectedLogin: string,
  expectedCapability: BoundaryRole,
): Promise<LoginTransitionEvidence | undefined> {
  const result = await queryable.query(
    [
      "SELECT",
      '  session_user AS "sessionUser",',
      '  current_user AS "currentUser",',
      "  COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname = $1::name), false)",
      '    AS "loginCanLogin",',
      "  COALESCE((SELECT rolinherit FROM pg_roles WHERE rolname = $1::name), true)",
      '    AS "loginInherits",',
      "  COALESCE((SELECT count(*) = 1 AND bool_and(",
      "    granted.rolname = $2::name AND NOT membership.admin_option",
      "    AND NOT membership.inherit_option AND membership.set_option",
      "  ) FROM pg_auth_members membership",
      "  JOIN pg_roles member ON member.oid = membership.member",
      "  JOIN pg_roles granted ON granted.oid = membership.roleid",
      "  WHERE member.rolname = $1::name), false)",
      '    AS "loginMembershipIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_database object",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(object.datacl, acldefault('d', object.datdba))) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_namespace object",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(object.nspacl, acldefault('n', object.nspowner))) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_class object",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(object.relacl, acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END, object.relowner))) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_attribute object",
      "    CROSS JOIN LATERAL aclexplode(object.attacl) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_proc object",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(object.proacl, acldefault('f', object.proowner))) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_type object",
      "    CROSS JOIN LATERAL aclexplode(COALESCE(object.typacl, acldefault('T', object.typowner))) privilege",
      "    JOIN pg_roles login ON login.oid = privilege.grantee AND login.rolname = $1::name",
      "    UNION ALL SELECT 1 FROM pg_default_acl object",
      "    CROSS JOIN LATERAL aclexplode(object.defaclacl) privilege",
      "    JOIN pg_roles login ON login.oid = object.defaclrole OR login.oid = privilege.grantee",
      "    WHERE login.rolname = $1::name",
      '  ) AS "loginDirectAclIsEmpty",',
      "  NOT EXISTS (SELECT 1 FROM pg_namespace object JOIN pg_roles login ON login.oid = object.nspowner WHERE login.rolname = $1::name)",
      "  AND NOT EXISTS (SELECT 1 FROM pg_class object JOIN pg_roles login ON login.oid = object.relowner WHERE login.rolname = $1::name)",
      "  AND NOT EXISTS (SELECT 1 FROM pg_proc object JOIN pg_roles login ON login.oid = object.proowner WHERE login.rolname = $1::name)",
      "  AND NOT EXISTS (SELECT 1 FROM pg_type object JOIN pg_roles login ON login.oid = object.typowner WHERE login.rolname = $1::name)",
      "  AND NOT EXISTS (SELECT 1 FROM pg_extension object JOIN pg_roles login ON login.oid = object.extowner WHERE login.rolname = $1::name)",
      '    AS "loginOwnsNoObjects",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_class object",
      "    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "    WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "      AND ((object.relkind = 'S' AND has_sequence_privilege(current_user, object.oid, 'USAGE,SELECT,UPDATE'))",
      "        OR (object.relkind <> 'S' AND (has_table_privilege(current_user, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
      "          OR has_any_column_privilege(current_user, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))))",
      "  ) AND NOT EXISTS (",
      "    SELECT 1 FROM pg_proc routine JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "    WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "      AND has_function_privilege(current_user, routine.oid, 'EXECUTE')",
      "      AND NOT (namespace.nspname IN ('extensions', 'public') AND EXISTS (",
      "        SELECT 1 FROM pg_depend dependency",
      "        WHERE dependency.classid = 'pg_proc'::regclass",
      "          AND dependency.objid = routine.oid",
      "          AND dependency.refclassid = 'pg_extension'::regclass",
      "          AND dependency.refobjid = (SELECT oid FROM vector_extension)",
      "          AND dependency.deptype = 'e'",
      "      ))",
      "  ) AND NOT EXISTS (",
      "    SELECT 1 FROM pg_type type JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "    WHERE type.typrelid = 0 AND type.typelem = 0",
      "      AND namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "      AND has_type_privilege(current_user, type.oid, 'USAGE')",
      "      AND NOT (namespace.nspname IN ('extensions', 'public') AND type.typname = 'vector')",
      '  ) AS "loginEffectiveObjectAclIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_namespace namespace",
      "    WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'",
      "      AND (has_schema_privilege(current_user, namespace.oid, 'CREATE')",
      "        OR (has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "          AND namespace.nspname NOT IN ('public', 'extensions')))",
      '  ) AS "loginEffectiveSchemaAclIsExact",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM pg_default_acl defaults",
      "    JOIN pg_roles owner ON owner.oid = defaults.defaclrole",
      "    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege",
      "    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee",
      "    WHERE owner.rolname IN ('portfolio_runtime_login', 'portfolio_migrator_login', 'portfolio_legal_login', 'portfolio_legacy_reader_login', 'portfolio_runtime', 'legal_audit_writer', 'portfolio_legacy_reader')",
      "      OR (grantee.rolname IN ('portfolio_runtime_login', 'portfolio_migrator_login', 'portfolio_legal_login', 'portfolio_legacy_reader_login', 'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer', 'portfolio_audit_owner', 'portfolio_compensation_operator', 'portfolio_legacy_reader')",
      "        AND NOT (owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator') AND privilege.grantee = defaults.defaclrole))",
      "      OR (owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator') AND privilege.grantee <> defaults.defaclrole)",
      "  ) AND (SELECT count(*) FROM pg_default_acl defaults JOIN pg_roles owner ON owner.oid = defaults.defaclrole",
      "    WHERE owner.rolname IN ('portfolio_migrator', 'portfolio_audit_owner', 'portfolio_compensation_operator')",
      "      AND defaults.defaclnamespace = 0 AND defaults.defaclobjtype IN ('f', 'T')",
      "      AND NOT EXISTS (SELECT 1 FROM aclexplode(defaults.defaclacl) privilege WHERE privilege.grantee = 0)) = 6",
      '    AS "defaultAclIsExact",',
      "  current_setting('TimeZone') AS timezone,",
      "  regexp_replace(current_setting('search_path'), '\\s*,\\s*', ', ', 'g')",
      '    AS "searchPath"',
    ].join("\n"),
    [expectedLogin, expectedCapability],
  );
  const evidence = result.rows.length === 1 ? result.rows[0] : undefined;
  if (evidence === undefined) return undefined;
  if (!isLoginTransitionEvidence(evidence)) {
    throw new Error("Portfolio LOGIN transition evidence was malformed");
  }
  return evidence;
}

function loginTransitionViolations(
  evidence: LoginTransitionEvidence | undefined,
  expectedLogin: string,
): string[] {
  if (!evidence) return ["invalid-login-evidence"];
  const violations: string[] = [];
  if (evidence.sessionUser !== expectedLogin) violations.push("login-session-user");
  if (evidence.currentUser !== expectedLogin) violations.push("reset-current-user");
  if (!evidence.loginCanLogin) violations.push("login-disabled");
  if (evidence.loginInherits) violations.push("login-inherit");
  if (!evidence.loginMembershipIsExact) violations.push("login-membership");
  if (!evidence.loginDirectAclIsEmpty) violations.push("login-direct-acl");
  if (!evidence.loginOwnsNoObjects) violations.push("login-ownership");
  if (!evidence.loginEffectiveObjectAclIsExact) violations.push("login-effective-object-acl");
  if (!evidence.loginEffectiveSchemaAclIsExact) violations.push("login-effective-schema-acl");
  if (!evidence.defaultAclIsExact) violations.push("login-default-acl");
  if (evidence.timezone !== "UTC") violations.push("login-timezone");
  if (evidence.searchPath !== "portfolio, extensions") violations.push("login-search-path");
  return violations;
}

async function capabilitySessionEvidence(
  queryable: Queryable,
  expectedCapability: BoundaryRole,
): Promise<DatabaseSessionEvidence | undefined> {
  const expectedLogin = CAPABILITY_LOGIN[expectedCapability];
  await queryable.query("RESET ROLE");
  const beforeSet = await loginTransitionEvidence(queryable, expectedLogin, expectedCapability);
  const beforeViolations = loginTransitionViolations(beforeSet, expectedLogin);
  if (beforeViolations.length > 0) {
    throw new Error(`Portfolio database LOGIN boundary failed before SET ROLE: ${beforeViolations.join(",")}`);
  }
  await queryable.query(`SET ROLE ${expectedCapability}`);
  try {
    const capability = await databaseSessionEvidence(queryable, expectedCapability);
    await queryable.query("RESET ROLE");
    const afterReset = await loginTransitionEvidence(queryable, expectedLogin, expectedCapability);
    const afterViolations = loginTransitionViolations(afterReset, expectedLogin);
    if (afterViolations.length > 0) {
      throw new Error(`Portfolio database LOGIN boundary failed after RESET ROLE: ${afterViolations.join(",")}`);
    }
    await queryable.query(`SET ROLE ${expectedCapability}`);
    return capability;
  } catch (error) {
    await queryable.query(`SET ROLE ${expectedCapability}`).catch(() => undefined);
    throw error;
  }
}

async function legacyReaderSessionEvidence(
  queryable: Queryable,
  allowedTables: readonly string[],
): Promise<LegacyReaderSessionEvidence | undefined> {
  const result = await queryable.query(
    [
      "WITH requested(table_name) AS (",
      "  SELECT unnest($1::text[])",
      "), allowed AS (",
      "  SELECT requested.table_name, object.oid, object.relrowsecurity, object.relforcerowsecurity",
      "  FROM requested",
      "  LEFT JOIN pg_namespace namespace ON namespace.nspname = 'public'",
      "  LEFT JOIN pg_class object",
      "    ON object.relnamespace = namespace.oid",
      "    AND object.relname = requested.table_name",
      "    AND object.relkind IN ('r', 'p')",
      ")",
      "SELECT",
      '  session_user AS "sessionUser",',
      '  current_user AS "currentUser",',
      '  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) AS "roleExists",',
      "  COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanLogin",',
      "  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleIsSuperuser",',
      "  COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleBypassesRls",',
      "  COALESCE((SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanCreateDatabase",',
      "  COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanCreateRole",',
      "  COALESCE((SELECT rolreplication FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleCanReplicate",',
      "  COALESCE((SELECT rolinherit FROM pg_roles WHERE rolname = current_user), false)",
      '    AS "roleInherits",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_auth_members membership",
      "    JOIN pg_roles member ON member.oid = membership.member",
      "    WHERE member.rolname = current_user AND membership.admin_option",
      '  ) AS "hasAdminOption",',
      "  COALESCE((",
      "    SELECT array_agg(granted.rolname::text ORDER BY granted.rolname)",
      "    FROM pg_auth_members membership",
      "    JOIN pg_roles member ON member.oid = membership.member",
      "    JOIN pg_roles granted ON granted.oid = membership.roleid",
      "    WHERE member.rolname = current_user",
      "  ), ARRAY[]::text[]) AS memberships,",
      "  EXISTS (",
      "    SELECT 1 FROM pg_roles",
      "    WHERE (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)",
      "      AND pg_has_role(current_user, oid, 'MEMBER')",
      '  ) AS "inheritsPrivilegedRole",',
      "  has_database_privilege(current_user, current_database(), 'CREATE')",
      '    AS "canCreateDatabaseObjects",',
      "  has_schema_privilege(current_user, 'public', 'CREATE')",
      '    AS "canCreatePublicSchemaObjects",',
      "  has_schema_privilege(current_user, 'public', 'USAGE')",
      '    AS "hasPublicSchemaUsage",',
      "  (",
      "    EXISTS (",
      "      SELECT 1 FROM pg_class object",
      "      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND object.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_proc routine",
      "      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND routine.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_type type",
      "      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace",
      "      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND type.typrelid = 0",
      "        AND type.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_namespace namespace",
      "      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
      "        AND namespace.nspname NOT LIKE 'pg_toast%'",
      "        AND namespace.nspname NOT LIKE 'pg_temp_%'",
      "        AND namespace.nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      "    OR EXISTS (",
      "      SELECT 1 FROM pg_extension extension",
      "      WHERE extension.extowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)",
      "    )",
      '  ) AS "ownsApplicationObjects",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_namespace namespace",
      "    WHERE namespace.nspname IN (",
      "      'portfolio', 'communications', 'communications_candidate',",
      "      'resume', 'admin', 'admin_dashboard'",
      "    )",
      "      AND (",
      "        has_schema_privilege(current_user, namespace.oid, 'USAGE')",
      "        OR has_schema_privilege(current_user, namespace.oid, 'CREATE')",
      "        OR EXISTS (",
      "          SELECT 1 FROM pg_class object",
      "          WHERE object.relnamespace = namespace.oid",
      "            AND (",
      "              (object.relkind IN ('r', 'p', 'v', 'm', 'f') AND (",
      "                has_table_privilege(current_user, object.oid, 'SELECT')",
      "                OR has_table_privilege(current_user, object.oid, 'INSERT')",
      "                OR has_table_privilege(current_user, object.oid, 'UPDATE')",
      "                OR has_table_privilege(current_user, object.oid, 'DELETE')",
      "                OR has_table_privilege(current_user, object.oid, 'TRUNCATE')",
      "                OR has_table_privilege(current_user, object.oid, 'REFERENCES')",
      "                OR has_table_privilege(current_user, object.oid, 'TRIGGER')",
      "              ))",
      "              OR (object.relkind = 'S' AND (",
      "                has_sequence_privilege(current_user, object.oid, 'USAGE')",
      "                OR has_sequence_privilege(current_user, object.oid, 'SELECT')",
      "                OR has_sequence_privilege(current_user, object.oid, 'UPDATE')",
      "              ))",
      "            )",
      "        )",
      "      )",
      '  ) AS "hasSiblingSchemaAccess",',
      '  NOT EXISTS (SELECT 1 FROM allowed WHERE oid IS NULL) AS "allAllowedTablesExist",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM allowed",
      "    WHERE oid IS NULL OR NOT COALESCE(has_table_privilege(current_user, oid, 'SELECT'), false)",
      '  ) AS "canReadAllAllowedTables",',
      "  NOT EXISTS (",
      "    SELECT 1 FROM allowed",
      "    WHERE allowed.oid IS NOT NULL AND (",
      "      (",
      "        allowed.table_name = 'legal_document_versions'",
      "        AND NOT (",
      "          allowed.relrowsecurity",
      "          AND NOT allowed.relforcerowsecurity",
      "          AND (",
      "            SELECT count(*) = 1 AND bool_and(",
      "              policy.polname = 'portfolio_legacy_reader_full_read'",
      "              AND policy.polpermissive",
      "              AND policy.polcmd = 'r'",
      "              AND policy.polroles = ARRAY[(",
      "                SELECT oid FROM pg_roles WHERE rolname = 'portfolio_legacy_reader'",
      "              )]::oid[]",
      "              AND pg_get_expr(policy.polqual, policy.polrelid) = 'true'",
      "              AND policy.polwithcheck IS NULL",
      "            )",
      "            FROM pg_policy policy",
      "            WHERE policy.polrelid = allowed.oid",
      "              AND (",
      "                0::oid = ANY(policy.polroles)",
      "                OR (SELECT oid FROM pg_roles WHERE rolname = 'portfolio_legacy_reader')",
      "                  = ANY(policy.polroles)",
      "              )",
      "          )",
      "        )",
      "      )",
      "      OR (",
      "        allowed.table_name <> 'legal_document_versions'",
      "        AND (",
      "          allowed.relrowsecurity",
      "          OR allowed.relforcerowsecurity",
      "          OR EXISTS (",
      "            SELECT 1 FROM pg_policy policy WHERE policy.polrelid = allowed.oid",
      "          )",
      "        )",
      "      )",
      "    )",
      '  ) AS "hasValidAllowedRowSecurity",',
      "  EXISTS (",
      "    SELECT 1 FROM allowed",
      "    WHERE oid IS NOT NULL AND (",
      "      has_table_privilege(current_user, oid, 'INSERT')",
      "      OR has_table_privilege(current_user, oid, 'UPDATE')",
      "      OR has_table_privilege(current_user, oid, 'DELETE')",
      "      OR has_table_privilege(current_user, oid, 'TRUNCATE')",
      "      OR has_table_privilege(current_user, oid, 'REFERENCES')",
      "      OR has_table_privilege(current_user, oid, 'TRIGGER')",
      "      OR has_any_column_privilege(current_user, oid, 'INSERT')",
      "      OR has_any_column_privilege(current_user, oid, 'UPDATE')",
      "      OR has_any_column_privilege(current_user, oid, 'REFERENCES')",
      "    )",
      '  ) AS "hasAllowedWriteAccess",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_class object",
      "    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace",
      "    WHERE namespace.nspname = 'public'",
      "      AND NOT (object.relname = ANY($1::text[]))",
      "      AND (",
      "        (object.relkind IN ('r', 'p', 'v', 'm', 'f') AND (",
      "          has_table_privilege(current_user, object.oid, 'SELECT')",
      "          OR has_table_privilege(current_user, object.oid, 'INSERT')",
      "          OR has_table_privilege(current_user, object.oid, 'UPDATE')",
      "          OR has_table_privilege(current_user, object.oid, 'DELETE')",
      "          OR has_table_privilege(current_user, object.oid, 'TRUNCATE')",
      "          OR has_table_privilege(current_user, object.oid, 'REFERENCES')",
      "          OR has_table_privilege(current_user, object.oid, 'TRIGGER')",
      "          OR has_any_column_privilege(current_user, object.oid, 'SELECT')",
      "          OR has_any_column_privilege(current_user, object.oid, 'INSERT')",
      "          OR has_any_column_privilege(current_user, object.oid, 'UPDATE')",
      "          OR has_any_column_privilege(current_user, object.oid, 'REFERENCES')",
      "        ))",
      "        OR (object.relkind = 'S' AND (",
      "          has_sequence_privilege(current_user, object.oid, 'USAGE')",
      "          OR has_sequence_privilege(current_user, object.oid, 'SELECT')",
      "          OR has_sequence_privilege(current_user, object.oid, 'UPDATE')",
      "        ))",
      "      )",
      '  ) AS "hasUnexpectedPublicObjectAccess",',
      "  EXISTS (",
      "    SELECT 1 FROM pg_proc routine",
      "    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace",
      "    WHERE namespace.nspname = 'public'",
      "      AND has_function_privilege(current_user, routine.oid, 'EXECUTE')",
      '  ) AS "hasPublicFunctionExecute",',
      "  regexp_replace(current_setting('search_path'), '\\s*,\\s*', ', ', 'g')",
      '    AS "searchPath"',
    ].join("\n"),
    [[...allowedTables]],
  );
  const evidence = result.rows.length === 1 ? result.rows[0] : undefined;
  if (evidence === undefined) return undefined;
  if (!isLegacyReaderEvidence(evidence)) {
    throw new Error(
      "Portfolio legacy reader database session evidence was malformed",
    );
  }
  return evidence;
}

function hasExactBaseRoleBoundary(
  evidence: DatabaseSessionEvidence | undefined,
  expectedRole: string,
): evidence is DatabaseSessionEvidence {
  const expectedMemberships =
    expectedRole === "portfolio_migrator" ? MIGRATOR_MEMBERSHIPS : [];
  return (
    evidence !== undefined &&
    evidence.sessionUser === CAPABILITY_LOGIN[expectedRole as BoundaryRole] &&
    evidence.currentUser === expectedRole &&
    evidence.roleExists &&
    !evidence.roleCanLogin &&
    !evidence.roleIsSuperuser &&
    !evidence.roleBypassesRls &&
    !evidence.roleCanCreateDatabase &&
    !evidence.roleCanCreateRole &&
    !evidence.roleCanReplicate &&
    !evidence.roleInherits &&
    !evidence.hasAdminOption &&
    evidence.roleMembershipsAreValid &&
    evidence.memberships.length === expectedMemberships.length &&
    evidence.memberships.every(
      (membership, index) => membership === expectedMemberships[index],
    ) &&
    evidence.auditRolesAreValid &&
    !evidence.inheritsPrivilegedRole &&
    !evidence.canCreateDatabaseObjects &&
    !evidence.canCreatePublicSchemaObjects &&
    !evidence.canCreateExtensionsSchemaObjects &&
    evidence.hasExtensionsSchemaUsage &&
    evidence.vectorExtensionIsValid &&
    evidence.vectorTypeIsValid &&
    !evidence.portfolioRolesOwnVectorObjects &&
    !evidence.ownsOutsidePortfolioObjects &&
    !evidence.hasPublicObjectAccess &&
    evidence.namespaceAccessIsValid &&
    evidence.schemaAclIsValid &&
    evidence.relationAclIsValid &&
    evidence.columnAclIsValid &&
    evidence.routineAclIsValid &&
    evidence.typeAclIsValid &&
    evidence.legalExposureIsValid &&
    evidence.legalWriterPolicyIsValid &&
    evidence.directLoginPrivilegesAreEmpty &&
    evidence.loginOwnsNoObjects &&
    evidence.loginMembershipIsExact &&
    evidence.defaultAclIsExact &&
    evidence.effectiveAclIsExact &&
    evidence.timezone === "UTC" &&
    evidence.searchPath === "portfolio, extensions"
  );
}

function baseRoleBoundaryViolations(
  evidence: DatabaseSessionEvidence | undefined,
  expectedRole: string,
): string[] {
  if (!evidence) return ["invalid-evidence"];
  const violations: string[] = [];
  if (evidence.sessionUser !== CAPABILITY_LOGIN[expectedRole as BoundaryRole])
    violations.push("session-user");
  if (evidence.currentUser !== expectedRole) violations.push("current-user");
  if (!evidence.roleExists) violations.push("missing-role");
  if (evidence.roleCanLogin) violations.push("capability-can-login");
  if (evidence.roleIsSuperuser) violations.push("superuser");
  if (evidence.roleBypassesRls) violations.push("bypass-rls");
  if (evidence.roleCanCreateDatabase) violations.push("create-database");
  if (evidence.roleCanCreateRole) violations.push("create-role");
  if (evidence.roleCanReplicate) violations.push("replication");
  if (evidence.roleInherits) violations.push("inherit");
  if (evidence.hasAdminOption) violations.push("admin-option");
  const expectedMemberships =
    expectedRole === "portfolio_migrator" ? MIGRATOR_MEMBERSHIPS : [];
  if (
    !evidence.roleMembershipsAreValid ||
    evidence.memberships.length !== expectedMemberships.length ||
    evidence.memberships.some(
      (membership, index) => membership !== expectedMemberships[index],
    )
  )
    violations.push("memberships");
  if (!evidence.auditRolesAreValid) violations.push("audit-role-boundary");
  if (evidence.inheritsPrivilegedRole) violations.push("privileged-membership");
  if (evidence.canCreateDatabaseObjects) violations.push("database-create");
  if (evidence.canCreatePublicSchemaObjects) violations.push("public-create");
  if (evidence.canCreateExtensionsSchemaObjects)
    violations.push("extensions-create");
  if (!evidence.hasExtensionsSchemaUsage) violations.push("extensions-usage");
  if (!evidence.vectorExtensionIsValid) violations.push("vector-extension");
  if (!evidence.vectorTypeIsValid) violations.push("vector-type");
  if (evidence.portfolioRolesOwnVectorObjects)
    violations.push("vector-portfolio-ownership");
  if (evidence.ownsOutsidePortfolioObjects)
    violations.push("outside-ownership");
  if (evidence.hasPublicObjectAccess) violations.push("public-object-access");
  if (!evidence.namespaceAccessIsValid) violations.push("namespace-allowlist");
  if (!evidence.schemaAclIsValid) violations.push("schema-acl");
  if (!evidence.relationAclIsValid) violations.push("relation-acl");
  if (!evidence.columnAclIsValid) violations.push("column-acl");
  if (!evidence.routineAclIsValid) violations.push("routine-acl");
  if (!evidence.typeAclIsValid) violations.push("type-acl");
  if (!evidence.legalExposureIsValid) violations.push("legal-exposure");
  if (!evidence.legalWriterPolicyIsValid)
    violations.push("legal-writer-policy");
  if (!evidence.directLoginPrivilegesAreEmpty)
    violations.push("direct-login-privilege");
  if (!evidence.loginOwnsNoObjects) violations.push("login-ownership");
  if (!evidence.loginMembershipIsExact) violations.push("login-membership");
  if (!evidence.defaultAclIsExact) violations.push("default-acl");
  if (!evidence.effectiveAclIsExact) violations.push("effective-acl");
  if (evidence.timezone !== "UTC") violations.push("timezone");
  if (evidence.searchPath !== "portfolio, extensions")
    violations.push("search-path");
  return violations;
}

export async function assertUnprivilegedDatabaseSession(
  queryable: Queryable,
  expectedRole: string,
  boundary: string,
): Promise<void> {
  const expectations = boundaryRoleExpectations(expectedRole);
  let evidence: DatabaseSessionEvidence | undefined;
  try {
    evidence = await capabilitySessionEvidence(queryable, expectations.role);
  } catch (error) {
    throw new Error(`${boundary} database session boundary rejected the LOGIN/RESET ROLE contract`, {
      cause: error,
    });
  }
  if (
    !hasExactBaseRoleBoundary(evidence, expectedRole) ||
    !evidence.portfolioAclIsExact ||
    evidence.canCreatePortfolioSchemaObjects ||
    !evidence.hasPortfolioSchemaUsage ||
    evidence.ownsApplicationObjects
  ) {
    const violations = baseRoleBoundaryViolations(evidence, expectedRole);
    if (evidence && !evidence.portfolioAclIsExact)
      violations.push("portfolio-acl-matrix");
    if (evidence?.canCreatePortfolioSchemaObjects)
      violations.push("portfolio-create");
    if (evidence && !evidence.hasPortfolioSchemaUsage)
      violations.push("portfolio-usage");
    if (evidence?.ownsApplicationObjects)
      violations.push("application-ownership");
    throw new Error(
      boundary +
        " database session boundary rejected the connected role or privileges: " +
        violations.join(","),
    );
  }
}

export async function assertPortfolioMigratorDatabaseSession(
  queryable: Queryable,
): Promise<void> {
  let evidence: DatabaseSessionEvidence | undefined;
  try {
    evidence = await capabilitySessionEvidence(queryable, "portfolio_migrator");
  } catch (error) {
    throw new Error("Portfolio migration database session boundary rejected the LOGIN/RESET ROLE contract", {
      cause: error,
    });
  }
  if (
    !hasExactBaseRoleBoundary(evidence, "portfolio_migrator") ||
    !evidence.hasDatabaseTempPrivilege ||
    !evidence.canCreatePortfolioSchemaObjects ||
    !evidence.hasPortfolioSchemaUsage ||
    !evidence.migratorOwnsPortfolioObjects
  ) {
    const violations = baseRoleBoundaryViolations(
      evidence,
      "portfolio_migrator",
    );
    if (evidence && !evidence.hasDatabaseTempPrivilege)
      violations.push("database-temp");
    if (evidence && !evidence.canCreatePortfolioSchemaObjects)
      violations.push("portfolio-create");
    if (evidence && !evidence.hasPortfolioSchemaUsage)
      violations.push("portfolio-usage");
    if (evidence && !evidence.migratorOwnsPortfolioObjects) {
      violations.push("portfolio-object-ownership");
    }
    throw new Error(
      "Portfolio migration database session boundary rejected the connected role or privileges: " +
        violations.join(","),
    );
  }
}

export async function assertPortfolioMigratorBootstrapSession(
  queryable: Queryable,
): Promise<void> {
  const evidence = await capabilitySessionEvidence(queryable, "portfolio_migrator");
  const valid = evidence
    && evidence.sessionUser === "portfolio_migrator_login"
    && evidence.currentUser === "portfolio_migrator"
    && evidence.roleExists
    && !evidence.roleCanLogin
    && !evidence.roleIsSuperuser
    && !evidence.roleBypassesRls
    && !evidence.roleCanCreateDatabase
    && !evidence.roleCanCreateRole
    && !evidence.roleCanReplicate
    && !evidence.roleInherits
    && !evidence.hasAdminOption
    && evidence.roleMembershipsAreValid
    && evidence.memberships.length === MIGRATOR_MEMBERSHIPS.length
    && evidence.memberships.every((role, index) => role === MIGRATOR_MEMBERSHIPS[index])
    && !evidence.inheritsPrivilegedRole
    && !evidence.canCreateDatabaseObjects
    && !evidence.canCreatePublicSchemaObjects
    && !evidence.canCreateExtensionsSchemaObjects
    && evidence.hasDatabaseTempPrivilege
    && evidence.canCreatePortfolioSchemaObjects
    && evidence.hasPortfolioSchemaUsage
    && evidence.hasExtensionsSchemaUsage
    && evidence.vectorExtensionIsValid
    && evidence.vectorTypeIsValid
    && !evidence.portfolioRolesOwnVectorObjects
    && !evidence.ownsOutsidePortfolioObjects
    && !evidence.hasPublicObjectAccess
    && evidence.directLoginPrivilegesAreEmpty
    && evidence.loginOwnsNoObjects
    && evidence.loginMembershipIsExact
    && evidence.timezone === "UTC"
    && evidence.searchPath === "portfolio, extensions";
  if (!valid) {
    throw new Error(
      "Portfolio clean-bootstrap migrator boundary rejected the LOGIN/capability, UTC, extension, or schema authority",
    );
  }
}

export async function assertPortfolioLegacyReaderDatabaseSession(
  queryable: Queryable,
  allowedTables: readonly string[],
): Promise<void> {
  if (
    allowedTables.length === 0 ||
    new Set(allowedTables).size !== allowedTables.length ||
    allowedTables.some((table) => !POSTGRES_IDENTIFIER.test(table))
  ) {
    throw new Error(
      "Portfolio legacy reader database session boundary rejected an invalid table allowlist",
    );
  }
  await queryable.query("RESET ROLE");
  const login = await queryable.query(`
    WITH login AS (
      SELECT oid, rolcanlogin, rolinherit
      FROM pg_roles
      WHERE rolname = 'portfolio_legacy_reader_login'
    ), direct_acl AS (
      SELECT privilege.grantee FROM pg_database object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.datacl, acldefault('d', object.datdba))) privilege
      UNION ALL
      SELECT privilege.grantee FROM pg_namespace object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.nspacl, acldefault('n', object.nspowner))) privilege
      UNION ALL
      SELECT privilege.grantee FROM pg_class object
      CROSS JOIN LATERAL aclexplode(COALESCE(
        object.relacl,
        acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, object.relowner)
      )) privilege
      UNION ALL
      SELECT privilege.grantee FROM pg_attribute object
      CROSS JOIN LATERAL aclexplode(object.attacl) privilege
      UNION ALL
      SELECT privilege.grantee FROM pg_proc object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.proacl, acldefault('f', object.proowner))) privilege
      UNION ALL
      SELECT privilege.grantee FROM pg_type object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.typacl, acldefault('T', object.typowner))) privilege
    )
    SELECT
      session_user AS "sessionUser",
      current_user AS "currentUser",
      COALESCE((SELECT rolcanlogin FROM login), false) AS "canLogin",
      COALESCE((SELECT rolinherit FROM login), true) AS inherits,
      (SELECT count(*) = 1 AND bool_and(
          granted.rolname = 'portfolio_legacy_reader'
          AND NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
        )
       FROM pg_auth_members membership
       JOIN pg_roles member ON member.oid = membership.member
       JOIN pg_roles granted ON granted.oid = membership.roleid
       WHERE member.rolname = 'portfolio_legacy_reader_login') AS "membershipIsExact",
      EXISTS (SELECT 1 FROM direct_acl WHERE grantee = (SELECT oid FROM login)) AS "hasDirectAcl",
      EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspowner = (SELECT oid FROM login)
        UNION ALL SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM login)
        UNION ALL SELECT 1 FROM pg_proc WHERE proowner = (SELECT oid FROM login)
        UNION ALL SELECT 1 FROM pg_type WHERE typowner = (SELECT oid FROM login)
      ) AS "ownsObject",
      current_setting('TimeZone') AS timezone
  `);
  const loginEvidence = login.rows[0] as {
    sessionUser: string;
    currentUser: string;
    canLogin: boolean;
    inherits: boolean;
    membershipIsExact: boolean;
    hasDirectAcl: boolean;
    ownsObject: boolean;
    timezone: string;
  } | undefined;
  if (
    !loginEvidence
    || loginEvidence.sessionUser !== "portfolio_legacy_reader_login"
    || loginEvidence.currentUser !== "portfolio_legacy_reader_login"
    || !loginEvidence.canLogin
    || loginEvidence.inherits
    || !loginEvidence.membershipIsExact
    || loginEvidence.hasDirectAcl
    || loginEvidence.ownsObject
    || loginEvidence.timezone !== "UTC"
  ) {
    throw new Error("Portfolio legacy reader database session boundary rejected a non-exact LOGIN identity");
  }
  await queryable.query("SET ROLE portfolio_legacy_reader");
  const evidence = await legacyReaderSessionEvidence(queryable, allowedTables);
  const violations: string[] = [];
  if (!evidence) {
    violations.push("invalid-evidence");
  } else {
    if (evidence.sessionUser !== "portfolio_legacy_reader_login")
      violations.push("session-user");
    if (evidence.currentUser !== "portfolio_legacy_reader")
      violations.push("current-user");
    if (!evidence.roleExists) violations.push("missing-role");
    if (evidence.roleCanLogin) violations.push("capability-can-login");
    if (evidence.roleIsSuperuser) violations.push("superuser");
    if (evidence.roleBypassesRls) violations.push("bypass-rls");
    if (evidence.roleCanCreateDatabase) violations.push("create-database");
    if (evidence.roleCanCreateRole) violations.push("create-role");
    if (evidence.roleCanReplicate) violations.push("replication");
    if (evidence.roleInherits) violations.push("inherit");
    if (evidence.hasAdminOption) violations.push("admin-option");
    if (evidence.memberships.length > 0) violations.push("memberships");
    if (evidence.inheritsPrivilegedRole)
      violations.push("privileged-membership");
    if (evidence.canCreateDatabaseObjects) violations.push("database-create");
    if (evidence.canCreatePublicSchemaObjects) violations.push("public-create");
    if (!evidence.hasPublicSchemaUsage) violations.push("public-usage");
    if (evidence.ownsApplicationObjects)
      violations.push("application-ownership");
    if (evidence.hasSiblingSchemaAccess) violations.push("sibling-access");
    if (!evidence.allAllowedTablesExist)
      violations.push("missing-allowed-table");
    if (!evidence.canReadAllAllowedTables)
      violations.push("missing-allowed-select");
    if (!evidence.hasValidAllowedRowSecurity)
      violations.push("allowed-table-row-security");
    if (evidence.hasAllowedWriteAccess) violations.push("allowed-table-write");
    if (evidence.hasUnexpectedPublicObjectAccess)
      violations.push("unexpected-public-access");
    if (evidence.hasPublicFunctionExecute)
      violations.push("public-function-execute");
    if (evidence.searchPath !== "public") violations.push("search-path");
  }
  await queryable.query("RESET ROLE");
  const reset = await queryable.query(`
    WITH login AS (
      SELECT oid FROM pg_roles WHERE rolname = 'portfolio_legacy_reader_login'
    ), direct_acl AS (
      SELECT privilege.grantee FROM pg_database object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.datacl, acldefault('d', object.datdba))) privilege
      UNION ALL SELECT privilege.grantee FROM pg_namespace object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.nspacl, acldefault('n', object.nspowner))) privilege
      UNION ALL SELECT privilege.grantee FROM pg_class object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.relacl, acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, object.relowner))) privilege
      UNION ALL SELECT privilege.grantee FROM pg_attribute object
      CROSS JOIN LATERAL aclexplode(object.attacl) privilege
      UNION ALL SELECT privilege.grantee FROM pg_proc object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.proacl, acldefault('f', object.proowner))) privilege
      UNION ALL SELECT privilege.grantee FROM pg_type object
      CROSS JOIN LATERAL aclexplode(COALESCE(object.typacl, acldefault('T', object.typowner))) privilege
    )
    SELECT session_user AS "sessionUser", current_user AS "currentUser",
      current_setting('TimeZone') AS timezone,
      NOT EXISTS (SELECT 1 FROM direct_acl WHERE grantee = (SELECT oid FROM login))
        AND NOT EXISTS (
          SELECT 1 FROM pg_default_acl defaults
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole = (SELECT oid FROM login)
            OR privilege.grantee = (SELECT oid FROM login)
        ) AS "directAclIsEmpty",
      NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = (SELECT oid FROM login))
        AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM login))
        AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = (SELECT oid FROM login))
        AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typowner = (SELECT oid FROM login))
        AS "ownsNoObjects",
      NOT EXISTS (
        SELECT 1 FROM pg_class object
        JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
        WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'
          AND has_schema_privilege(current_user, namespace.oid, 'USAGE')
          AND ((object.relkind = 'S' AND has_sequence_privilege(current_user, object.oid, 'USAGE,SELECT,UPDATE'))
            OR (object.relkind <> 'S' AND (has_table_privilege(current_user, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(current_user, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_proc routine JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'
          AND has_schema_privilege(current_user, namespace.oid, 'USAGE')
          AND has_function_privilege(current_user, routine.oid, 'EXECUTE')
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_type type JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE type.typrelid = 0 AND type.typelem = 0
          AND namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'
          AND has_schema_privilege(current_user, namespace.oid, 'USAGE')
          AND has_type_privilege(current_user, type.oid, 'USAGE')
      ) AS "effectiveObjectAclIsEmpty",
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        WHERE namespace.nspname <> 'information_schema' AND namespace.nspname NOT LIKE 'pg_%'
          AND (has_schema_privilege(current_user, namespace.oid, 'CREATE')
            OR (has_schema_privilege(current_user, namespace.oid, 'USAGE') AND namespace.nspname <> 'public'))
      ) AS "effectiveSchemaAclIsExact"
  `);
  const resetEvidence = reset.rows[0] as {
    sessionUser: string;
    currentUser: string;
    timezone: string;
    directAclIsEmpty: boolean;
    ownsNoObjects: boolean;
    effectiveObjectAclIsEmpty: boolean;
    effectiveSchemaAclIsExact: boolean;
  } | undefined;
  if (
    resetEvidence?.sessionUser !== "portfolio_legacy_reader_login"
    || resetEvidence?.currentUser !== "portfolio_legacy_reader_login"
    || resetEvidence?.timezone !== "UTC"
    || !resetEvidence?.directAclIsEmpty
    || !resetEvidence?.ownsNoObjects
    || !resetEvidence?.effectiveObjectAclIsEmpty
    || !resetEvidence?.effectiveSchemaAclIsExact
  ) {
    violations.push("reset-role-boundary");
  }
  await queryable.query("SET ROLE portfolio_legacy_reader");
  if (violations.length > 0) {
    throw new Error(
      "Portfolio legacy reader database session boundary rejected the connected role or privileges: " +
        violations.join(","),
    );
  }
}
