BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_legacy_reader')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_legacy_reader_login') THEN
    RAISE EXCEPTION 'portfolio legacy reader login/capability roles must exist before applying this contract';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = 'portfolio_legacy_reader'
  ) THEN
    RAISE EXCEPTION 'portfolio_legacy_reader must not inherit any role';
  END IF;
END
$$;

DO $role_attributes$
DECLARE
  expected record;
  actual record;
  alter_clauses text[];
BEGIN
  FOR expected IN
    SELECT role_name, can_login, inherits
    FROM (VALUES
      ('portfolio_legacy_reader_login', true, false),
      ('portfolio_legacy_reader', false, false)
    ) AS contract(role_name, can_login, inherits)
  LOOP
    SELECT
      catalog_role.rolcanlogin,
      catalog_role.rolinherit,
      catalog_role.rolsuper,
      catalog_role.rolbypassrls,
      catalog_role.rolcreatedb,
      catalog_role.rolcreaterole,
      catalog_role.rolreplication
    INTO actual
    FROM pg_catalog.pg_roles catalog_role
    WHERE catalog_role.rolname = expected.role_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Portfolio legacy reader role % is missing', expected.role_name;
    END IF;
    IF actual.rolsuper OR actual.rolbypassrls OR actual.rolcreatedb
       OR actual.rolcreaterole OR actual.rolreplication THEN
      RAISE EXCEPTION
        'Portfolio legacy reader role % has prohibited role attributes; break-glass superuser repair is required before reconciliation',
        expected.role_name
        USING ERRCODE = '42501';
    END IF;

    alter_clauses := ARRAY[]::text[];
    IF actual.rolcanlogin IS DISTINCT FROM expected.can_login THEN
      alter_clauses := pg_catalog.array_append(
        alter_clauses,
        CASE WHEN expected.can_login THEN 'LOGIN' ELSE 'NOLOGIN' END
      );
    END IF;
    IF actual.rolinherit IS DISTINCT FROM expected.inherits THEN
      alter_clauses := pg_catalog.array_append(
        alter_clauses,
        CASE WHEN expected.inherits THEN 'INHERIT' ELSE 'NOINHERIT' END
      );
    END IF;
    IF pg_catalog.cardinality(alter_clauses) > 0 THEN
      EXECUTE pg_catalog.format(
        'ALTER ROLE %I %s',
        expected.role_name,
        pg_catalog.array_to_string(alter_clauses, ' ')
      );
    END IF;

    SELECT
      catalog_role.rolcanlogin,
      catalog_role.rolinherit,
      catalog_role.rolsuper,
      catalog_role.rolbypassrls,
      catalog_role.rolcreatedb,
      catalog_role.rolcreaterole,
      catalog_role.rolreplication
    INTO actual
    FROM pg_catalog.pg_roles catalog_role
    WHERE catalog_role.rolname = expected.role_name;
    IF NOT FOUND
       OR actual.rolcanlogin IS DISTINCT FROM expected.can_login
       OR actual.rolinherit IS DISTINCT FROM expected.inherits
       OR actual.rolsuper OR actual.rolbypassrls OR actual.rolcreatedb
       OR actual.rolcreaterole OR actual.rolreplication THEN
      RAISE EXCEPTION
        'Portfolio legacy reader role % does not match its exact attribute contract',
        expected.role_name;
    END IF;
  END LOOP;
END
$role_attributes$;

DO $$
DECLARE
  edge record;
BEGIN
  FOR edge IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = 'portfolio_legacy_reader_login'
  LOOP
    EXECUTE format('REVOKE %I FROM %I', edge.granted_role, edge.member_role);
  END LOOP;
END
$$;
GRANT portfolio_legacy_reader TO portfolio_legacy_reader_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

REVOKE CREATE ON DATABASE postgres FROM portfolio_legacy_reader;
REVOKE CREATE, TEMPORARY ON DATABASE postgres FROM portfolio_legacy_reader_login;
REVOKE CREATE ON SCHEMA public FROM portfolio_legacy_reader;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM portfolio_legacy_reader_login;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM portfolio_legacy_reader;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM portfolio_legacy_reader_login;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM portfolio_legacy_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM portfolio_legacy_reader_login;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM portfolio_legacy_reader;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM portfolio_legacy_reader_login;
DO $type_acl_reconciliation$
DECLARE
  unexpected_type record;
  grantee_name text;
BEGIN
  FOR unexpected_type IN
    SELECT namespace.nspname AS schema_name, type.typname AS type_name
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(type.typacl, acldefault('T', type.typowner))
    ) privilege
    JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND type.typrelid = 0
      AND type.typelem = 0
      AND grantee.rolname IN (
        'portfolio_legacy_reader',
        'portfolio_legacy_reader_login'
      )
      AND privilege.privilege_type = 'USAGE'
  LOOP
    FOREACH grantee_name IN ARRAY ARRAY[
      'portfolio_legacy_reader',
      'portfolio_legacy_reader_login'
    ]
    LOOP
      EXECUTE format(
        'REVOKE USAGE ON TYPE %I.%I FROM %I',
        unexpected_type.schema_name,
        unexpected_type.type_name,
        grantee_name
      );
    END LOOP;
  END LOOP;
END
$type_acl_reconciliation$;
GRANT USAGE ON SCHEMA public TO portfolio_legacy_reader;

GRANT SELECT ON TABLE
  public.admin_policy_acceptance,
  public.ai_models,
  public.all_skills,
  public.audit_logs,
  public.bio,
  public.bio_paragraphs,
  public.browser_request_logs,
  public.browser_tracking,
  public.browser_tracking_ips,
  public.education,
  public.experiences,
  public.github_timeline_events,
  public.ip_rate_logs,
  public.legal_document_versions,
  public.linkedin_timeline_events,
  public.personal_information,
  public.portfolio_skills,
  public.projects,
  public.session,
  public.skills_group,
  public.users,
  public.welcome_messages,
  public.xyz_bullets
TO portfolio_legacy_reader;

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_versions NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_legacy_reader_full_read
  ON public.legal_document_versions;
CREATE POLICY portfolio_legacy_reader_full_read
  ON public.legal_document_versions
  AS PERMISSIVE
  FOR SELECT
  TO portfolio_legacy_reader
  USING (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND has_function_privilege('portfolio_legacy_reader', routine.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        JOIN pg_extension extension ON extension.oid = dependency.refobjid
        JOIN pg_roles extension_owner ON extension_owner.oid = extension.extowner
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = routine.oid
          AND dependency.refclassid = 'pg_extension'::regclass
          AND dependency.deptype = 'e'
          AND extension.extname = 'vector'
          AND extension.extnamespace = namespace.oid
          AND extension_owner.rolname = 'supabase_admin'
      )
  ) THEN
    RAISE EXCEPTION
      'portfolio_legacy_reader inherits EXECUTE on a non-vector public function; review and revoke the supplying grant';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public'
      AND type.typrelid = 0
      AND type.typelem = 0
      AND has_type_privilege('portfolio_legacy_reader', type.oid, 'USAGE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        JOIN pg_extension extension ON extension.oid = dependency.refobjid
        JOIN pg_roles extension_owner ON extension_owner.oid = extension.extowner
        WHERE dependency.classid = 'pg_type'::regclass
          AND dependency.objid = type.oid
          AND dependency.refclassid = 'pg_extension'::regclass
          AND dependency.deptype = 'e'
          AND extension.extname = 'vector'
          AND extension.extnamespace = namespace.oid
          AND extension_owner.rolname = 'supabase_admin'
      )
  ) THEN
    RAISE EXCEPTION
      'portfolio_legacy_reader inherits USAGE on a non-vector public standalone type; review and revoke the supplying grant';
  END IF;
END
$$;

COMMIT;
