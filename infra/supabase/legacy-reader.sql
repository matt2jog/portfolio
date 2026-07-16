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

ALTER ROLE portfolio_legacy_reader_login
  LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE portfolio_legacy_reader
  NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

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
  ) THEN
    RAISE EXCEPTION
      'portfolio_legacy_reader still inherits EXECUTE on a public function; review and revoke the supplying grant';
  END IF;
END
$$;

COMMIT;
