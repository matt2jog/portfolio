-- Append-only audit log for legal documents (privacy, terms, tracking).
-- Source of truth lives in /legal/*.md in git; this table records the content
-- as it existed at each commit that touched legal/**.md on the main branch.
-- The GitHub Actions workflow inserts rows; nobody updates or deletes.

CREATE TABLE IF NOT EXISTS legal_document_versions (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type      text NOT NULL,
  content       text NOT NULL,
  content_hash  text NOT NULL,
  commit_sha    text NOT NULL,
  committed_at  timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_document_versions_doc_type_check
    CHECK (doc_type IN ('privacy', 'terms', 'tracking'))
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_document_versions_doc_type_content_hash_key
  ON legal_document_versions (doc_type, content_hash);

CREATE INDEX IF NOT EXISTS legal_document_versions_doc_type_committed_at_idx
  ON legal_document_versions (doc_type, committed_at);

-- Derived view: each row carries effective_until (NULL = currently binding).
CREATE OR REPLACE VIEW legal_document_active_ranges AS
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

-- RLS: the Data API roles have no policy. A dedicated INSERT-only database role
-- receives a narrowly scoped policy when that role exists in the target database.
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_document_versions_anon_insert ON legal_document_versions;
DROP POLICY IF EXISTS legal_document_versions_writer_insert ON legal_document_versions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_audit_writer') THEN
    CREATE POLICY legal_document_versions_writer_insert
      ON legal_document_versions
      FOR INSERT
      TO legal_audit_writer
      WITH CHECK (true);
  END IF;
END
$$;
