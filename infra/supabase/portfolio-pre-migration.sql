-- Portfolio clean-target role/bootstrap contract.
-- This is the only database-administrator step that precedes migrations. It
-- creates roles and empty private schemas, but deliberately creates no
-- relation, routine, type, or default ACL that could satisfy/poison the
-- empty-target migration gate.

BEGIN;

SET timezone TO 'UTC';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_runtime_login') THEN
    CREATE ROLE portfolio_runtime_login LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_migrator_login') THEN
    CREATE ROLE portfolio_migrator_login LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_legal_login') THEN
    CREATE ROLE portfolio_legal_login LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_legacy_reader_login') THEN
    CREATE ROLE portfolio_legacy_reader_login LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_fence_login') THEN
    CREATE ROLE portfolio_fence_login LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_runtime') THEN
    CREATE ROLE portfolio_runtime NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_migrator') THEN
    CREATE ROLE portfolio_migrator NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_audit_writer') THEN
    CREATE ROLE legal_audit_writer NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_audit_owner') THEN
    CREATE ROLE portfolio_audit_owner NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_compensation_operator') THEN
    CREATE ROLE portfolio_compensation_operator NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_legacy_reader') THEN
    CREATE ROLE portfolio_legacy_reader NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_fence_operator') THEN
    CREATE ROLE portfolio_fence_operator NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_fence_owner') THEN
    CREATE ROLE portfolio_fence_owner NOLOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END
$$;

-- Supabase's managed postgres role has CREATEROLE but is intentionally not a
-- true superuser. Merely mentioning SUPERUSER/NOSUPERUSER in ALTER ROLE is
-- therefore forbidden. Existing privileged roles require explicit break-glass
-- repair; ordinary LOGIN and INHERIT drift can be reconciled safely.
DO $role_attributes$
DECLARE
  expected record;
  actual record;
  alter_clauses text[];
BEGIN
  FOR expected IN
    SELECT role_name, can_login, inherits
    FROM (VALUES
      ('portfolio_runtime_login', true, false),
      ('portfolio_migrator_login', true, false),
      ('portfolio_legal_login', true, false),
      ('portfolio_legacy_reader_login', true, false),
      ('portfolio_fence_login', true, false),
      ('portfolio_runtime', false, false),
      ('portfolio_migrator', false, false),
      ('legal_audit_writer', false, false),
      ('portfolio_audit_owner', false, false),
      ('portfolio_compensation_operator', false, false),
      ('portfolio_legacy_reader', false, false),
      ('portfolio_fence_operator', false, false),
      ('portfolio_fence_owner', false, false)
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
      RAISE EXCEPTION 'Portfolio role % is missing after role creation', expected.role_name;
    END IF;
    IF actual.rolsuper OR actual.rolbypassrls OR actual.rolcreatedb
       OR actual.rolcreaterole OR actual.rolreplication THEN
      RAISE EXCEPTION
        'Portfolio role % has prohibited role attributes; break-glass superuser repair is required before bootstrap',
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
      RAISE EXCEPTION 'Portfolio role % does not match its exact attribute contract', expected.role_name;
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
    WHERE member.rolname IN (
        'portfolio_runtime_login', 'portfolio_migrator_login',
        'portfolio_legal_login', 'portfolio_legacy_reader_login',
        'portfolio_fence_login',
        'portfolio_runtime', 'portfolio_migrator',
        'legal_audit_writer', 'portfolio_audit_owner',
        'portfolio_compensation_operator', 'portfolio_legacy_reader',
        'portfolio_fence_operator', 'portfolio_fence_owner'
      )
      OR granted.rolname IN (
        'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer',
        'portfolio_audit_owner', 'portfolio_compensation_operator',
        'portfolio_legacy_reader', 'portfolio_fence_operator',
        'portfolio_fence_owner'
      )
  LOOP
    EXECUTE format('REVOKE %I FROM %I', edge.granted_role, edge.member_role);
  END LOOP;
END
$$;

GRANT portfolio_runtime TO portfolio_runtime_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT portfolio_migrator TO portfolio_migrator_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT legal_audit_writer TO portfolio_legal_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT portfolio_legacy_reader TO portfolio_legacy_reader_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT portfolio_fence_operator TO portfolio_fence_login
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT portfolio_audit_owner, portfolio_compensation_operator
  TO portfolio_migrator
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

-- Supabase's managed postgres administrator is not a true superuser. Give the
-- bootstrap session only the bounded SET ROLE memberships needed to transfer
-- schema/object ownership and reconcile owner-scoped default privileges. The
-- membership must be inherited during this bounded bootstrap because Supabase's
-- managed postgres role cannot ALTER DEFAULT PRIVILEGES through SET-only membership.
-- post-migration ACL script revokes these memberships before its exact graph
-- assertion, so they never survive a successful bootstrap.
GRANT portfolio_migrator, portfolio_audit_owner,
  portfolio_compensation_operator, portfolio_fence_owner
  TO postgres
  WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;

DO $$
BEGIN
  EXECUTE format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_runtime, portfolio_migrator, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
    current_database()
  );
  EXECUTE format(
    'GRANT TEMPORARY ON DATABASE %I TO portfolio_migrator',
    current_database()
  );
END
$$;

CREATE SCHEMA IF NOT EXISTS portfolio AUTHORIZATION portfolio_migrator;
ALTER SCHEMA portfolio OWNER TO portfolio_migrator;
CREATE SCHEMA IF NOT EXISTS portfolio_control AUTHORIZATION portfolio_fence_owner;
ALTER SCHEMA portfolio_control OWNER TO portfolio_fence_owner;
REVOKE ALL ON SCHEMA portfolio_control FROM PUBLIC;

-- Repair ordinary owner privileges stripped by bootstrap versions that revoked
-- from every role, including each object's owner. Ownership still permits DDL,
-- but PostgreSQL allows an owner to revoke its own SELECT/INSERT/EXECUTE/USAGE
-- ACLs; that made an otherwise healthy target impossible to migrate again.
-- Restore privileges only to the reviewed owner of each existing Portfolio
-- object. This creates no object and therefore cannot satisfy the empty-target
-- migration gate.
DO $owner_acl_repair$
DECLARE
  owned_object record;
BEGIN
  GRANT ALL PRIVILEGES ON SCHEMA portfolio TO portfolio_migrator;

  FOR owned_object IN
    SELECT object.relname, object.relkind, owner.rolname AS owner_name
    FROM pg_class object
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    JOIN pg_roles owner ON owner.oid = object.relowner
    WHERE namespace.nspname = 'portfolio'
      AND object.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND owner.rolname IN (
        'portfolio_migrator', 'portfolio_audit_owner',
        'portfolio_compensation_operator'
      )
  LOOP
    IF owned_object.relkind = 'S' THEN
      EXECUTE format(
        'GRANT ALL PRIVILEGES ON SEQUENCE portfolio.%I TO %I',
        owned_object.relname,
        owned_object.owner_name
      );
    ELSE
      EXECUTE format(
        'GRANT ALL PRIVILEGES ON TABLE portfolio.%I TO %I',
        owned_object.relname,
        owned_object.owner_name
      );
    END IF;
  END LOOP;

  FOR owned_object IN
    SELECT
      routine.proname,
      pg_get_function_identity_arguments(routine.oid) AS identity_arguments,
      owner.rolname AS owner_name
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    JOIN pg_roles owner ON owner.oid = routine.proowner
    WHERE namespace.nspname = 'portfolio'
      AND owner.rolname IN (
        'portfolio_migrator', 'portfolio_audit_owner',
        'portfolio_compensation_operator'
      )
  LOOP
    EXECUTE format(
      'GRANT ALL PRIVILEGES ON ROUTINE portfolio.%I(%s) TO %I',
      owned_object.proname,
      owned_object.identity_arguments,
      owned_object.owner_name
    );
  END LOOP;

  FOR owned_object IN
    SELECT type.typname, owner.rolname AS owner_name
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    WHERE namespace.nspname = 'portfolio'
      AND type.typrelid = 0
      AND type.typelem = 0
      AND owner.rolname IN (
        'portfolio_migrator', 'portfolio_audit_owner',
        'portfolio_compensation_operator'
      )
  LOOP
    EXECUTE format(
      'GRANT ALL PRIVILEGES ON TYPE portfolio.%I TO %I',
      owned_object.typname,
      owned_object.owner_name
    );
  END LOOP;
END
$owner_acl_repair$;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'portfolio_runtime_login', 'portfolio_migrator_login',
    'portfolio_legal_login', 'portfolio_legacy_reader_login',
    'portfolio_fence_login',
    'portfolio_runtime', 'portfolio_migrator',
    'legal_audit_writer', 'portfolio_audit_owner',
    'portfolio_compensation_operator', 'portfolio_legacy_reader',
    'portfolio_fence_operator', 'portfolio_fence_owner'
  ]
  LOOP
    EXECUTE format('ALTER ROLE %I SET timezone TO %L', role_name, 'UTC');
    EXECUTE format(
      'ALTER ROLE %I IN DATABASE %I SET timezone TO %L',
      role_name, current_database(), 'UTC'
    );
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY[
    'portfolio_runtime_login', 'portfolio_migrator_login',
    'portfolio_legal_login', 'portfolio_fence_login',
    'portfolio_runtime', 'portfolio_migrator',
    'legal_audit_writer', 'portfolio_audit_owner',
    'portfolio_compensation_operator', 'portfolio_fence_operator',
    'portfolio_fence_owner'
  ]
  LOOP
    EXECUTE format(
      'ALTER ROLE %I IN DATABASE %I SET search_path TO portfolio, extensions',
      role_name, current_database()
    );
  END LOOP;
  EXECUTE format(
    'ALTER ROLE portfolio_legacy_reader_login IN DATABASE %I SET search_path TO public',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_fence_login IN DATABASE %I SET search_path TO portfolio_control, portfolio',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_fence_operator IN DATABASE %I SET search_path TO portfolio_control, portfolio',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_fence_owner IN DATABASE %I SET search_path TO portfolio_control, portfolio',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_legacy_reader IN DATABASE %I SET search_path TO public',
    current_database()
  );
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    JOIN pg_roles owner ON owner.oid = extension.extowner
    WHERE extension.extname = 'vector'
      AND (
        (namespace.nspname = 'extensions' AND owner.rolname = 'postgres')
        OR (namespace.nspname = 'public' AND owner.rolname = 'supabase_admin')
      )
  ) THEN
    RAISE EXCEPTION 'vector must match the local or managed Supabase pgvector contract';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regtype('extensions.vector') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA extensions TO portfolio_migrator;
    GRANT USAGE ON TYPE extensions.vector TO portfolio_migrator;
  ELSE
    GRANT USAGE ON SCHEMA public TO portfolio_migrator;
    GRANT USAGE ON TYPE public.vector TO portfolio_migrator;
  END IF;
END
$$;

-- PostgreSQL grants PUBLIC routine execution and type usage by default. Establish
-- the exact global baseline before the first migration so SET ROLE NONE cannot
-- expose a login identity through objects created by any Portfolio DDL owner.
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_migrator
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_migrator
  REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_audit_owner
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_audit_owner
  REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_compensation_operator
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_compensation_operator
  REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_fence_owner
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_fence_owner
  REVOKE USAGE ON TYPES FROM PUBLIC;

COMMIT;
