interface Queryable {
  query(text: string): Promise<{ rows: unknown[] }>;
}

interface DatabaseSessionEvidence {
  sessionUser: string;
  currentUser: string;
  roleExists: boolean;
  inheritsPrivilegedRole: boolean;
  canCreateDatabaseObjects: boolean;
  canCreatePublicSchemaObjects: boolean;
}

function isEvidence(value: unknown): value is DatabaseSessionEvidence {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.sessionUser === "string"
    && typeof row.currentUser === "string"
    && typeof row.roleExists === "boolean"
    && typeof row.inheritsPrivilegedRole === "boolean"
    && typeof row.canCreateDatabaseObjects === "boolean"
    && typeof row.canCreatePublicSchemaObjects === "boolean";
}

export async function assertUnprivilegedDatabaseSession(
  queryable: Queryable,
  expectedRole: string,
  boundary: string,
): Promise<void> {
  const result = await queryable.query([
    "SELECT",
    "  session_user AS \"sessionUser\",",
    "  current_user AS \"currentUser\",",
    "  EXISTS (",
    "    SELECT 1 FROM pg_roles WHERE rolname = current_user",
    "  ) AS \"roleExists\",",
    "  EXISTS (",
    "    SELECT 1",
    "    FROM pg_roles",
    "    WHERE (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)",
    "      AND pg_has_role(current_user, oid, 'MEMBER')",
    "  ) AS \"inheritsPrivilegedRole\",",
    "  has_database_privilege(current_user, current_database(), 'CREATE')",
    "    AS \"canCreateDatabaseObjects\",",
    "  has_schema_privilege(current_user, 'public', 'CREATE')",
    "    AS \"canCreatePublicSchemaObjects\"",
  ].join("\n"));
  const evidence = result.rows.length === 1 ? result.rows[0] : undefined;
  if (
    !isEvidence(evidence)
    || evidence.sessionUser !== expectedRole
    || evidence.currentUser !== expectedRole
    || !evidence.roleExists
    || evidence.inheritsPrivilegedRole
    || evidence.canCreateDatabaseObjects
    || evidence.canCreatePublicSchemaObjects
  ) {
    throw new Error(boundary + " database session boundary rejected the connected role or privileges");
  }
}
