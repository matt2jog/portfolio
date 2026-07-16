-- Portfolio clean-target role/bootstrap contract.
-- This is the only database-administrator step that precedes migrations. It
-- creates roles and the empty private schema, but deliberately creates no
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

ALTER ROLE portfolio_runtime_login LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_migrator_login LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_legal_login LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_legacy_reader_login LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_fence_login LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_runtime NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_migrator NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE legal_audit_writer NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_audit_owner NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_compensation_operator NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_legacy_reader NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_fence_operator NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_fence_owner NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

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
    'ALTER ROLE portfolio_fence_login IN DATABASE %I SET search_path TO portfolio, extensions',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_fence_operator IN DATABASE %I SET search_path TO portfolio, extensions',
    current_database()
  );
  EXECUTE format(
    'ALTER ROLE portfolio_fence_owner IN DATABASE %I SET search_path TO portfolio, extensions',
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
      AND namespace.nspname = 'extensions'
      AND owner.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'vector must exist in extensions and be owned by postgres';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA extensions TO portfolio_migrator;
GRANT USAGE ON TYPE extensions.vector TO portfolio_migrator;

-- PostgreSQL grants PUBLIC routine execution and type usage by default. Establish
-- the exact global baseline before the first migration so RESET ROLE cannot
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

-- The bootstrap administrator installs a dormant, lease-based source fence.
-- Ordinary release workflows can only activate, abort, or commit an exact
-- lease through portfolio_fence_operator; they cannot create triggers or use
-- the postgres administrator. Expired, uncommitted leases fail open so every
-- pre-authority failure leaves the previous public writer viable.
CREATE TABLE IF NOT EXISTS public.portfolio_source_write_fence_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fence_token text NOT NULL CHECK (fence_token ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.portfolio_source_write_fence_control OWNER TO portfolio_fence_owner;
REVOKE ALL ON TABLE public.portfolio_source_write_fence_control FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.portfolio_legacy_write_fence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.portfolio_source_write_fence_control
    WHERE singleton
      AND (committed_at IS NOT NULL OR expires_at > clock_timestamp())
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Legacy public Portfolio data authority is fenced';
  END IF;
  RETURN NULL;
END
$function$;
ALTER FUNCTION public.portfolio_legacy_write_fence() OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION public.portfolio_legacy_write_fence() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.activate_portfolio_source_write_fence(
  requested_token text,
  requested_lifetime_seconds integer
) RETURNS TABLE (fence_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
BEGIN
  IF requested_token !~ '^[0-9a-f]{64}$'
     OR requested_lifetime_seconds < 300
     OR requested_lifetime_seconds > 1800 THEN
    RAISE EXCEPTION 'Invalid Portfolio source-fence lease request';
  END IF;
  DELETE FROM public.portfolio_source_write_fence_control
  WHERE committed_at IS NULL AND expires_at <= clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.portfolio_source_write_fence_control) THEN
    RAISE EXCEPTION 'A Portfolio source-fence lease is already active or committed';
  END IF;
  INSERT INTO public.portfolio_source_write_fence_control
    (singleton, fence_token, expires_at)
  VALUES (true, requested_token, clock_timestamp() + make_interval(secs => requested_lifetime_seconds));
  RETURN QUERY
    SELECT control.fence_token, control.expires_at
    FROM public.portfolio_source_write_fence_control control;
END
$function$;
ALTER FUNCTION public.activate_portfolio_source_write_fence(text, integer)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION public.activate_portfolio_source_write_fence(text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.abort_portfolio_source_write_fence(requested_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
DECLARE removed integer;
BEGIN
  DELETE FROM public.portfolio_source_write_fence_control
  WHERE fence_token = requested_token AND committed_at IS NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed = 1 OR NOT EXISTS (
    SELECT 1 FROM public.portfolio_source_write_fence_control
  );
END
$function$;
ALTER FUNCTION public.abort_portfolio_source_write_fence(text)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION public.abort_portfolio_source_write_fence(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.commit_portfolio_source_write_fence(requested_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE public.portfolio_source_write_fence_control
  SET committed_at = clock_timestamp(), expires_at = 'infinity'::timestamptz
  WHERE fence_token = requested_token
    AND committed_at IS NULL
    AND expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$function$;
ALTER FUNCTION public.commit_portfolio_source_write_fence(text)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION public.commit_portfolio_source_write_fence(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.activate_portfolio_source_write_fence(text, integer)
  TO portfolio_fence_operator;
GRANT EXECUTE ON FUNCTION public.abort_portfolio_source_write_fence(text)
  TO portfolio_fence_operator;
GRANT EXECUTE ON FUNCTION public.commit_portfolio_source_write_fence(text)
  TO portfolio_fence_operator;

DO $triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'admin_policy_acceptance', 'ai_models', 'all_skills', 'audit_logs',
    'bio', 'bio_paragraphs', 'browser_request_logs', 'browser_tracking',
    'browser_tracking_ips', 'education', 'experiences',
    'github_timeline_events', 'ip_rate_logs', 'legal_document_versions',
    'linkedin_timeline_events', 'personal_information', 'portfolio_skills',
    'projects', 'session', 'skills_group', 'users', 'welcome_messages',
    'xyz_bullets'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS portfolio_legacy_write_fence_row ON public.%I', table_name);
      EXECUTE format('DROP TRIGGER IF EXISTS portfolio_legacy_write_fence_truncate ON public.%I', table_name);
      EXECUTE format('CREATE TRIGGER portfolio_legacy_write_fence_row BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.portfolio_legacy_write_fence()', table_name);
      EXECUTE format('CREATE TRIGGER portfolio_legacy_write_fence_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.portfolio_legacy_write_fence()', table_name);
    END IF;
  END LOOP;
END
$triggers$;

COMMIT;
