-- Apply legal-history view hardening to databases that already ran migration 0005.
CREATE OR REPLACE VIEW legal_document_active_ranges WITH (security_invoker = true) AS
SELECT
  id,
  doc_type,
  content,
  content_hash,
  commit_sha,
  committed_at,
  LEAD(committed_at) OVER (
    PARTITION BY doc_type ORDER BY committed_at
  ) AS effective_until
FROM legal_document_versions;

REVOKE ALL ON legal_document_active_ranges FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON legal_document_active_ranges FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON legal_document_active_ranges FROM authenticated';
  END IF;
END
$$;
