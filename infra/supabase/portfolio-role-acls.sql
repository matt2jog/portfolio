-- Portfolio target-role and ACL contract.
-- Run as the target Supabase database administrator. Passwords are created and
-- rotated only through the typed secret workflow; this file never sets one.

BEGIN;

SET timezone TO 'UTC';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN (
    'portfolio_runtime_login', 'portfolio_migrator_login',
    'portfolio_legal_login', 'portfolio_legacy_reader_login',
    'portfolio_fence_login',
    'portfolio_runtime', 'portfolio_migrator',
    'legal_audit_writer', 'portfolio_audit_owner',
    'portfolio_compensation_operator', 'portfolio_legacy_reader',
    'portfolio_fence_operator', 'portfolio_fence_owner'
  )) <> 13 THEN
    RAISE EXCEPTION 'Portfolio pre-migration role bootstrap has not completed';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format(
    'REVOKE CREATE ON DATABASE %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
    current_database()
  );
  EXECUTE format(
    'REVOKE TEMPORARY ON DATABASE %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
    current_database()
  );
  EXECUTE format(
    'GRANT TEMPORARY ON DATABASE %I TO portfolio_migrator',
    current_database()
  );
END
$$;

ALTER SCHEMA portfolio OWNER TO portfolio_migrator;

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
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    WHERE type.typname = 'vector'
      AND type.typrelid = 0
      AND (
        (namespace.nspname = 'extensions' AND owner.rolname = 'postgres')
        OR (namespace.nspname = 'public' AND owner.rolname = 'supabase_admin')
      )
  ) THEN
    RAISE EXCEPTION 'vector type must match the local or managed Supabase pgvector contract';
  END IF;
END
$$;

-- Strip direct grants for Portfolio target roles from every non-system
-- namespace. PUBLIC-supplied privileges are not mutated here because this is a
-- shared Supabase project; the connected-role assertion rejects any effective
-- access outside the reviewed portfolio/extensions/public namespace allowlist.
DO $$
DECLARE
  namespace record;
BEGIN
  FOR namespace IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname <> 'information_schema'
      AND nspname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner CASCADE',
      namespace.nspname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
      namespace.nspname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
      namespace.nspname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
      namespace.nspname
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  type_object record;
BEGIN
  FOR type_object IN
    SELECT namespace.nspname, type.typname
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    WHERE type.typrelid = 0
      AND type.typelem = 0
      AND namespace.nspname <> 'information_schema'
      AND namespace.nspname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
      type_object.nspname,
      type_object.typname
    );
  END LOOP;
END
$$;

-- Table-level REVOKE does not remove column ACLs. Remove every direct target
-- role column grant before rebuilding the reviewed table-level matrix.
DO $$
DECLARE
  column_acl record;
BEGIN
  FOR column_acl IN
    SELECT DISTINCT namespace.nspname, object.relname, attribute.attname
    FROM pg_attribute attribute
    JOIN pg_class object ON object.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    WHERE attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND namespace.nspname <> 'information_schema'
      AND namespace.nspname NOT LIKE 'pg_%'
      AND privilege.grantee IN (
        SELECT oid FROM pg_roles
        WHERE rolname IN (
          'portfolio_migrator',
          'portfolio_runtime',
          'legal_audit_writer',
          'portfolio_audit_owner',
          'portfolio_compensation_operator',
          'portfolio_legacy_reader',
          'portfolio_fence_operator',
          'portfolio_fence_owner',
          'portfolio_runtime_login',
          'portfolio_migrator_login',
          'portfolio_legal_login',
          'portfolio_legacy_reader_login',
          'portfolio_fence_login'
        )
      )
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) '
      || 'ON TABLE %2$I.%3$I FROM portfolio_runtime_login, portfolio_migrator_login, portfolio_legal_login, portfolio_legacy_reader_login, portfolio_fence_login, portfolio_migrator, portfolio_runtime, legal_audit_writer, portfolio_audit_owner, portfolio_compensation_operator, portfolio_legacy_reader, portfolio_fence_operator, portfolio_fence_owner',
      column_acl.attname,
      column_acl.nspname,
      column_acl.relname
    );
  END LOOP;
END
$$;

-- A private service schema has one global ACL matrix, not merely an ACL for
-- the role performing this preflight. Strip every direct non-owner grant from
-- Portfolio objects before rebuilding the reviewed runtime/legal grants.
DO $$
DECLARE
  grantee record;
BEGIN
  REVOKE ALL PRIVILEGES ON SCHEMA portfolio FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA portfolio FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA portfolio FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA portfolio FROM PUBLIC;

  FOR grantee IN SELECT rolname FROM pg_roles
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA portfolio FROM %I CASCADE', grantee.rolname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA portfolio FROM %I',
      grantee.rolname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA portfolio FROM %I',
      grantee.rolname
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA portfolio FROM %I',
      grantee.rolname
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  type_object record;
BEGIN
  FOR type_object IN
    SELECT
      type.typname,
      privilege.grantee,
      grantee.rolname AS grantee_name
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      type.typacl,
      acldefault('T', type.typowner)
    )) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE type.typrelid = 0
      AND type.typelem = 0
      AND namespace.nspname = 'portfolio'
      AND privilege.grantee <> type.typowner
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TYPE portfolio.%I FROM %s',
      type_object.typname,
      CASE WHEN type_object.grantee = 0
        THEN 'PUBLIC'
        ELSE format('%I', type_object.grantee_name)
      END
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  column_acl record;
BEGIN
  FOR column_acl IN
    SELECT DISTINCT
      object.relname,
      attribute.attname,
      privilege.grantee,
      grantee.rolname AS grantee_name
    FROM pg_attribute attribute
    JOIN pg_class object ON object.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND namespace.nspname = 'portfolio'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) '
      || 'ON TABLE portfolio.%2$I FROM %3$s',
      column_acl.attname,
      column_acl.relname,
      CASE WHEN column_acl.grantee = 0
        THEN 'PUBLIC'
        ELSE format('%I', column_acl.grantee_name)
      END
    );
  END LOOP;
END
$$;

-- Reconcile every default ACL that is owned by, or grants to, a Portfolio
-- identity. PostgreSQL's routine/type PUBLIC defaults are global; per-schema
-- revocation alone cannot remove them, so the owner-wide revocation below is
-- mandatory before any schema-local cleanup.
DO $$
DECLARE
  default_acl record;
  owner_role text;
BEGIN
  FOR default_acl IN
    SELECT DISTINCT
      owner.rolname AS owner_name,
      namespace.nspname AS schema_name,
      defaults.defaclobjtype,
      privilege.grantee,
      grantee.rolname AS grantee_name
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE owner.rolname IN (
        'portfolio_migrator', 'portfolio_audit_owner',
        'portfolio_compensation_operator', 'portfolio_fence_owner'
      )
      OR (
        grantee.rolname IN (
          'portfolio_runtime_login', 'portfolio_migrator_login',
          'portfolio_legal_login', 'portfolio_legacy_reader_login',
          'portfolio_fence_login',
          'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer',
          'portfolio_audit_owner', 'portfolio_compensation_operator',
          'portfolio_legacy_reader', 'portfolio_fence_operator',
          'portfolio_fence_owner'
        )
        AND NOT (
          owner.rolname IN (
            'portfolio_migrator', 'portfolio_audit_owner',
            'portfolio_compensation_operator', 'portfolio_fence_owner'
          )
          AND privilege.grantee = defaults.defaclrole
        )
      )
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %1$I %2$s REVOKE ALL PRIVILEGES ON %3$s FROM %4$s',
      default_acl.owner_name,
      CASE WHEN default_acl.schema_name IS NULL THEN ''
        ELSE format('IN SCHEMA %I', default_acl.schema_name)
      END,
      CASE default_acl.defaclobjtype
        WHEN 'r' THEN 'TABLES'
        WHEN 'S' THEN 'SEQUENCES'
        WHEN 'f' THEN 'ROUTINES'
        WHEN 'T' THEN 'TYPES'
        WHEN 'n' THEN 'SCHEMAS'
        ELSE NULL
      END,
      CASE WHEN default_acl.grantee = 0 THEN 'PUBLIC'
        ELSE format('%I', default_acl.grantee_name)
      END
    );
  END LOOP;

  FOREACH owner_role IN ARRAY ARRAY[
    'portfolio_migrator', 'portfolio_audit_owner',
    'portfolio_compensation_operator', 'portfolio_fence_owner'
  ]
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON ROUTINES FROM PUBLIC',
      owner_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE USAGE ON TYPES FROM PUBLIC',
      owner_role
    );
  END LOOP;
END
$$;

-- Install the dormant, lease-based source fence only after the canonical
-- migration batch has passed its empty-target fingerprint gate. Keeping these
-- controls in a dedicated private schema prevents operational state from
-- becoming Portfolio domain data or poisoning migration evidence.
CREATE TABLE IF NOT EXISTS portfolio_control.portfolio_source_write_fence_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fence_token text NOT NULL CHECK (fence_token ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE portfolio_control.portfolio_source_write_fence_control
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON TABLE portfolio_control.portfolio_source_write_fence_control FROM PUBLIC;

CREATE OR REPLACE FUNCTION portfolio_control.portfolio_legacy_write_fence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM portfolio_control.portfolio_source_write_fence_control
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
ALTER FUNCTION portfolio_control.portfolio_legacy_write_fence()
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION portfolio_control.portfolio_legacy_write_fence() FROM PUBLIC;

CREATE OR REPLACE FUNCTION portfolio_control.activate_portfolio_source_write_fence(
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
  DELETE FROM portfolio_control.portfolio_source_write_fence_control
  WHERE committed_at IS NULL AND expires_at <= clock_timestamp();
  IF EXISTS (
    SELECT 1 FROM portfolio_control.portfolio_source_write_fence_control
  ) THEN
    RAISE EXCEPTION 'A Portfolio source-fence lease is already active or committed';
  END IF;
  INSERT INTO portfolio_control.portfolio_source_write_fence_control
    (singleton, fence_token, expires_at)
  VALUES (
    true,
    requested_token,
    clock_timestamp() + make_interval(secs => requested_lifetime_seconds)
  );
  RETURN QUERY
    SELECT control.fence_token, control.expires_at
    FROM portfolio_control.portfolio_source_write_fence_control control;
END
$function$;
ALTER FUNCTION portfolio_control.activate_portfolio_source_write_fence(text, integer)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION portfolio_control.activate_portfolio_source_write_fence(text, integer)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION portfolio_control.abort_portfolio_source_write_fence(
  requested_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
DECLARE removed integer;
BEGIN
  DELETE FROM portfolio_control.portfolio_source_write_fence_control
  WHERE fence_token = requested_token AND committed_at IS NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed = 1 OR NOT EXISTS (
    SELECT 1 FROM portfolio_control.portfolio_source_write_fence_control
  );
END
$function$;
ALTER FUNCTION portfolio_control.abort_portfolio_source_write_fence(text)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION portfolio_control.abort_portfolio_source_write_fence(text)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION portfolio_control.commit_portfolio_source_write_fence(
  requested_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET TimeZone = 'UTC'
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE portfolio_control.portfolio_source_write_fence_control
  SET committed_at = clock_timestamp(), expires_at = 'infinity'::timestamptz
  WHERE fence_token = requested_token
    AND committed_at IS NULL
    AND expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$function$;
ALTER FUNCTION portfolio_control.commit_portfolio_source_write_fence(text)
  OWNER TO portfolio_fence_owner;
REVOKE ALL ON FUNCTION portfolio_control.commit_portfolio_source_write_fence(text)
  FROM PUBLIC;

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
      EXECUTE format(
        'DROP TRIGGER IF EXISTS portfolio_legacy_write_fence_row ON public.%I',
        table_name
      );
      EXECUTE format(
        'DROP TRIGGER IF EXISTS portfolio_legacy_write_fence_truncate ON public.%I',
        table_name
      );
      EXECUTE format(
        'CREATE TRIGGER portfolio_legacy_write_fence_row BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION portfolio_control.portfolio_legacy_write_fence()',
        table_name
      );
      EXECUTE format(
        'CREATE TRIGGER portfolio_legacy_write_fence_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION portfolio_control.portfolio_legacy_write_fence()',
        table_name
      );
    END IF;
  END LOOP;
END
$triggers$;

DO $$
BEGIN
  IF to_regclass('portfolio.database_mutation_audit') IS NULL THEN
    GRANT USAGE, CREATE ON SCHEMA portfolio
      TO portfolio_migrator WITH GRANT OPTION;
  ELSE
    GRANT USAGE, CREATE ON SCHEMA portfolio TO portfolio_migrator;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA portfolio TO portfolio_runtime, legal_audit_writer;
GRANT USAGE ON SCHEMA portfolio
  TO portfolio_audit_owner, portfolio_compensation_operator;
DO $$
BEGIN
  GRANT USAGE ON SCHEMA extensions
    TO portfolio_migrator, portfolio_runtime, legal_audit_writer;
  IF to_regtype('extensions.vector') IS NOT NULL THEN
    GRANT USAGE ON TYPE extensions.vector
      TO portfolio_migrator, portfolio_runtime, legal_audit_writer;
  ELSE
    GRANT USAGE ON SCHEMA public
      TO portfolio_migrator, portfolio_runtime, legal_audit_writer;
    GRANT USAGE ON TYPE public.vector
      TO portfolio_migrator, portfolio_runtime, legal_audit_writer;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA portfolio_control TO portfolio_fence_operator;
GRANT EXECUTE ON FUNCTION portfolio_control.activate_portfolio_source_write_fence(text, integer)
  TO portfolio_fence_operator;
GRANT EXECUTE ON FUNCTION portfolio_control.abort_portfolio_source_write_fence(text)
  TO portfolio_fence_operator;
GRANT EXECUTE ON FUNCTION portfolio_control.commit_portfolio_source_write_fence(text)
  TO portfolio_fence_operator;

DO $$
DECLARE
  expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('admin_policy_acceptance', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('ai_models', ARRAY['SELECT']::text[]),
      ('all_skills', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('audit_logs', ARRAY['INSERT']::text[]),
      ('bio', ARRAY['SELECT']::text[]),
      ('bio_paragraphs', ARRAY['SELECT']::text[]),
      ('browser_request_logs', ARRAY['INSERT']::text[]),
      ('browser_tracking', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('browser_tracking_ips', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('career_event_checkpoints', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('career_event_inbox', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('career_event_quarantine', ARRAY['INSERT']::text[]),
      ('education', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
      ('experiences', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
      ('github_timeline_events', ARRAY['SELECT', 'INSERT']::text[]),
      ('ip_rate_logs', ARRAY['INSERT']::text[]),
      ('linkedin_timeline_events', ARRAY['SELECT']::text[]),
      ('personal_information', ARRAY['SELECT']::text[]),
      ('portfolio_skills', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
      ('projects', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('skills_group', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
      ('users', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
      ('welcome_messages', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
      ('xyz_bullets', ARRAY['SELECT', 'INSERT', 'DELETE']::text[])
    ) AS matrix(relation_name, privileges)
  LOOP
    IF to_regclass(format('portfolio.%I', expected.relation_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT %s ON TABLE portfolio.%I TO portfolio_runtime',
        array_to_string(expected.privileges, ', '),
        expected.relation_name
      );
    END IF;
  END LOOP;

  IF to_regclass('portfolio.legal_document_versions') IS NOT NULL THEN
    GRANT INSERT ON TABLE portfolio.legal_document_versions TO legal_audit_writer;
  END IF;
END
$$;

-- Migration 0016 transfers immutable audit objects to non-login owner/operator
-- roles. Rebuild its exact grants after the global ACL scrub while remaining a
-- no-op before those objects exist.
DO $$
DECLARE
  expected record;
BEGIN
  FOR expected IN
    SELECT relation_name FROM (VALUES
      ('users'),
      ('projects'),
      ('ai_models'),
      ('xyz_bullets'),
      ('bio'),
      ('bio_paragraphs'),
      ('skills_group'),
      ('all_skills'),
      ('portfolio_skills'),
      ('github_timeline_events'),
      ('linkedin_timeline_events'),
      ('personal_information'),
      ('admin_policy_acceptance'),
      ('education'),
      ('experiences'),
      ('browser_tracking'),
      ('browser_tracking_ips'),
      ('browser_request_logs'),
      ('ip_rate_logs'),
      ('welcome_messages'),
      ('career_event_inbox'),
      ('career_event_checkpoints'),
      ('career_event_quarantine')
    ) AS matrix(relation_name)
  LOOP
    IF to_regclass(format('portfolio.%I', expected.relation_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portfolio.%I TO portfolio_compensation_operator',
        expected.relation_name
      );
    END IF;
  END LOOP;

  IF to_regclass('portfolio.database_mutation_audit') IS NOT NULL THEN
    GRANT SELECT ON TABLE portfolio.database_mutation_audit
      TO portfolio_compensation_operator;
    GRANT ALL PRIVILEGES ON TABLE portfolio.database_mutation_audit
      TO portfolio_audit_owner;
  END IF;
  IF to_regclass('portfolio.database_audit_chain_heads') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE portfolio.database_audit_chain_heads
      TO portfolio_audit_owner;
  END IF;
  IF to_regclass('portfolio.database_compensation_payloads') IS NOT NULL THEN
    GRANT SELECT ON TABLE portfolio.database_compensation_payloads
      TO portfolio_compensation_operator;
    GRANT ALL PRIVILEGES ON TABLE portfolio.database_compensation_payloads
      TO portfolio_audit_owner;
  END IF;
  IF to_regclass(
    'portfolio.database_mutation_audit_sequence_number_seq'
  ) IS NOT NULL THEN
    GRANT ALL PRIVILEGES
      ON SEQUENCE portfolio.database_mutation_audit_sequence_number_seq
      TO portfolio_audit_owner;
  END IF;
  IF to_regprocedure(
    'portfolio.suppress_redundant_updates_trigger()'
  ) IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION portfolio.suppress_redundant_updates_trigger()
      TO portfolio_audit_owner;
  END IF;
  IF to_regprocedure('portfolio.unique_key_recheck()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION portfolio.unique_key_recheck()
      TO portfolio_audit_owner;
  END IF;
  IF to_regprocedure(
    'portfolio.compensate_database_mutation(uuid,text)'
  ) IS NOT NULL THEN
    GRANT EXECUTE
      ON FUNCTION portfolio.compensate_database_mutation(uuid, text)
      TO portfolio_compensation_operator, portfolio_migrator;
  END IF;
  IF to_regprocedure(
    'portfolio.database_audit_chain_summary()'
  ) IS NOT NULL THEN
    GRANT EXECUTE
      ON FUNCTION portfolio.database_audit_chain_summary()
      TO portfolio_runtime;
  END IF;
  IF to_regprocedure(
    'portfolio.record_database_audit_release(text,text)'
  ) IS NOT NULL THEN
    GRANT EXECUTE
      ON FUNCTION portfolio.record_database_audit_release(text, text)
      TO portfolio_migrator;
  END IF;
END
$$;

DO $$
DECLARE
  policy_row record;
  legal_table regclass := to_regclass('portfolio.legal_document_versions');
BEGIN
  IF legal_table IS NOT NULL THEN
    ALTER TABLE portfolio.legal_document_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE portfolio.legal_document_versions NO FORCE ROW LEVEL SECURITY;
    FOR policy_row IN
      SELECT policy_catalog.polname
      FROM pg_policy policy_catalog
      WHERE policy_catalog.polrelid = legal_table
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON portfolio.legal_document_versions',
        policy_row.polname
      );
    END LOOP;
    CREATE POLICY legal_document_versions_writer_insert
      ON portfolio.legal_document_versions
      AS PERMISSIVE
      FOR INSERT
      TO legal_audit_writer
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class object
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    JOIN pg_roles owner ON owner.oid = object.relowner
    WHERE namespace.nspname = 'portfolio'
      AND owner.rolname <> CASE
        WHEN object.relname IN (
          'database_audit_chain_heads',
          'database_mutation_audit',
          'database_compensation_payloads',
          'database_audit_activation',
          'database_audit_releases',
          'database_mutation_audit_sequence_number_seq'
        ) OR EXISTS (
          SELECT 1
          FROM pg_index index_catalog
          JOIN pg_class indexed_table
            ON indexed_table.oid = index_catalog.indrelid
          WHERE index_catalog.indexrelid = object.oid
            AND indexed_table.relname IN (
              'database_audit_chain_heads',
              'database_mutation_audit',
              'database_compensation_payloads',
              'database_audit_activation',
              'database_audit_releases'
            )
        ) THEN 'portfolio_audit_owner'
        ELSE 'portfolio_migrator'
      END
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    JOIN pg_roles owner ON owner.oid = routine.proowner
    WHERE namespace.nspname = 'portfolio'
      AND owner.rolname <> CASE
        WHEN routine.proname IN (
          'suppress_redundant_updates_trigger', 'unique_key_recheck',
          'database_audit_chain_summary'
        ) AND pg_get_function_identity_arguments(routine.oid) = ''
          THEN 'portfolio_audit_owner'
        WHEN routine.proname = 'record_database_audit_release'
          AND pg_get_function_identity_arguments(routine.oid)
            = 'p_release_sha text, p_image_digest text'
          THEN 'portfolio_audit_owner'
        WHEN routine.proname = 'compensate_database_mutation'
          AND pg_get_function_identity_arguments(routine.oid)
            = 'requested_audit_id uuid, expected_current_digest text'
          THEN 'portfolio_compensation_operator'
        ELSE 'portfolio_migrator'
      END
  ) OR EXISTS (
    SELECT 1
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    WHERE namespace.nspname = 'portfolio'
      AND type.typrelid = 0
      AND type.typelem = 0
      AND owner.rolname <> 'portfolio_migrator'
  ) THEN
    RAISE EXCEPTION 'Portfolio object ownership does not match the migrator/audit role contract';
  END IF;
END
$$;

-- End the managed-administrator bootstrap window before proving the final
-- membership graph. Runtime and ordinary release identities never receive
-- these memberships.
REVOKE portfolio_migrator, portfolio_audit_owner,
  portfolio_compensation_operator, portfolio_fence_owner
  FROM postgres;

-- Fail closed unless LOGIN identities remain pure authenticators and the
-- complete capability/default ACL graph is exact. aclexplode includes PUBLIC
-- as grantee oid 0, so this catches both named and global drift.
DO $$
DECLARE
  login_oids oid[] := ARRAY(
    SELECT oid FROM pg_roles WHERE rolname IN (
      'portfolio_runtime_login', 'portfolio_migrator_login',
      'portfolio_legal_login', 'portfolio_legacy_reader_login',
      'portfolio_fence_login'
    )
  );
  default_acl_drift text;
BEGIN
  IF EXISTS (
    SELECT 1
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
    LEFT JOIN pg_roles managed_role
      ON managed_role.rolname = contract.role_name
    WHERE managed_role.oid IS NULL
      OR managed_role.rolcanlogin IS DISTINCT FROM contract.can_login
      OR managed_role.rolinherit IS DISTINCT FROM contract.inherits
      OR managed_role.rolsuper
      OR managed_role.rolbypassrls
      OR managed_role.rolcreatedb
      OR managed_role.rolcreaterole
      OR managed_role.rolreplication
  ) THEN
    RAISE EXCEPTION 'Portfolio managed role attributes are not exact and privilege-free';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_database database
    CROSS JOIN LATERAL aclexplode(COALESCE(
      database.datacl, acldefault('d', database.datdba)
    )) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      namespace.nspacl, acldefault('n', namespace.nspowner)
    )) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_class object
    CROSS JOIN LATERAL aclexplode(COALESCE(
      object.relacl,
      acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, object.relowner)
    )) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_proc routine
    CROSS JOIN LATERAL aclexplode(COALESCE(
      routine.proacl, acldefault('f', routine.proowner)
    )) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_type type
    CROSS JOIN LATERAL aclexplode(COALESCE(
      type.typacl, acldefault('T', type.typowner)
    )) privilege
    WHERE privilege.grantee = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_default_acl defaults
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole = ANY(login_oids)
      OR privilege.grantee = ANY(login_oids)
  ) THEN
    RAISE EXCEPTION 'A Portfolio LOGIN identity has a direct object/default privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspowner = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_class WHERE relowner = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_proc WHERE proowner = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_type WHERE typowner = ANY(login_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_extension WHERE extowner = ANY(login_oids)
  ) THEN
    RAISE EXCEPTION 'A Portfolio LOGIN identity owns a database object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname IN (
      'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer',
      'portfolio_audit_owner', 'portfolio_compensation_operator',
      'portfolio_legacy_reader', 'portfolio_fence_operator',
      'portfolio_fence_owner'
    )
      AND NOT (
        NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
        AND (granted.rolname, member.rolname) IN (
          ('portfolio_runtime', 'portfolio_runtime_login'),
          ('portfolio_migrator', 'portfolio_migrator_login'),
          ('legal_audit_writer', 'portfolio_legal_login'),
          ('portfolio_legacy_reader', 'portfolio_legacy_reader_login'),
          ('portfolio_fence_operator', 'portfolio_fence_login'),
          ('portfolio_audit_owner', 'portfolio_migrator'),
          ('portfolio_compensation_operator', 'portfolio_migrator')
        )
      )
  ) OR (
    SELECT count(*) FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    WHERE granted.rolname IN (
      'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer',
      'portfolio_audit_owner', 'portfolio_compensation_operator',
      'portfolio_legacy_reader', 'portfolio_fence_operator',
      'portfolio_fence_owner'
    )
  ) <> 7 THEN
    RAISE EXCEPTION 'Portfolio capability role memberships are not exact';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE owner.rolname IN (
        'portfolio_runtime_login', 'portfolio_migrator_login',
        'portfolio_legal_login', 'portfolio_legacy_reader_login',
        'portfolio_fence_login', 'portfolio_runtime',
        'legal_audit_writer', 'portfolio_legacy_reader',
        'portfolio_fence_operator'
      )
      OR (
        grantee.rolname IN (
          'portfolio_runtime_login', 'portfolio_migrator_login',
          'portfolio_legal_login', 'portfolio_legacy_reader_login',
          'portfolio_fence_login',
          'portfolio_runtime', 'portfolio_migrator', 'legal_audit_writer',
          'portfolio_audit_owner', 'portfolio_compensation_operator',
          'portfolio_legacy_reader', 'portfolio_fence_operator',
          'portfolio_fence_owner'
        )
        AND NOT (
          owner.rolname IN (
            'portfolio_migrator', 'portfolio_audit_owner',
            'portfolio_compensation_operator', 'portfolio_fence_owner'
          )
          AND privilege.grantee = defaults.defaclrole
        )
      )
      OR (
        owner.rolname IN (
          'portfolio_migrator', 'portfolio_audit_owner',
          'portfolio_compensation_operator', 'portfolio_fence_owner'
        )
        AND privilege.grantee <> defaults.defaclrole
      )
  ) THEN
    SELECT string_agg(
      format('%s:%s:%s:%s', owner.rolname, defaults.defaclnamespace, defaults.defaclobjtype, COALESCE(grantee.rolname, 'PUBLIC')),
      ',' ORDER BY owner.rolname, defaults.defaclnamespace, defaults.defaclobjtype, COALESCE(grantee.rolname, 'PUBLIC')
    )
    INTO default_acl_drift
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee;
    RAISE EXCEPTION 'Portfolio pg_default_acl includes an unexpected owner, named grantee, or PUBLIC grant: %', default_acl_drift;
  END IF;

  IF (
    SELECT count(*)
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    WHERE owner.rolname IN (
        'portfolio_migrator', 'portfolio_audit_owner',
        'portfolio_compensation_operator', 'portfolio_fence_owner'
      )
      AND defaults.defaclnamespace = 0
      AND defaults.defaclobjtype IN ('f', 'T')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(defaults.defaclacl) privilege
        WHERE privilege.grantee = 0
      )
  ) <> 8 THEN
    RAISE EXCEPTION 'Portfolio global routine/type PUBLIC default revocation is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class object
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      object.relacl,
      acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, object.relowner)
    )) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'portfolio'
      AND privilege.grantee <> object.relowner
      AND COALESCE(grantee.rolname, 'PUBLIC') NOT IN (
        'portfolio_runtime', 'legal_audit_writer',
        'portfolio_audit_owner', 'portfolio_compensation_operator'
      )
  ) THEN
    RAISE EXCEPTION 'Portfolio effective relation ACL contains an unexpected grantee, including PUBLIC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_db_role_setting settings
    CROSS JOIN LATERAL unnest(settings.setconfig) configuration
    WHERE configuration ~* '^pgrst\.db_schemas=.*(^|[, ])(portfolio|portfolio_control|resume)([, ]|$)'
  ) THEN
    RAISE EXCEPTION 'Private portfolio/control/resume schema is exposed through the Data API';
  END IF;
END
$$;

COMMIT;
