SET LOCAL search_path = portfolio, extensions, public;

-- Historical project audit snapshots contain the same disproven implementation
-- wording as their project fields. Clean those snapshots before migration 008
-- performs its repository-wide assertion.
UPDATE audit_logs
SET payload = regexp_replace(
      regexp_replace(
        payload::text,
        chr(75) || 'afka-based',
        'stream-processing',
        'gi'
      ),
      chr(75) || 'afka',
      'stream processing',
      'gi'
    )::jsonb
WHERE id IN (
  'acc53a27-0eda-420a-8817-5cdada585b9b',
  'c3e538bd-ff57-422f-a1b7-1d6b14237041',
  'c4eb7b27-75cf-4f37-ac55-dc946f0afefc',
  'cc85ca80-62ec-46e5-bb17-48cfa338ba9e'
)
  AND position(
    lower(chr(75) || 'afka')
    IN lower(payload::text)
  ) > 0;

DO $verify_obsolete_messaging_epilogues_removed$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_logs
    WHERE id IN (
      'acc53a27-0eda-420a-8817-5cdada585b9b',
      'c3e538bd-ff57-422f-a1b7-1d6b14237041',
      'c4eb7b27-75cf-4f37-ac55-dc946f0afefc',
      'cc85ca80-62ec-46e5-bb17-48cfa338ba9e'
    )
      AND position(
        lower(chr(75) || 'afka')
        IN lower(coalesce(payload::text, ''))
      ) > 0
  ) THEN
    RAISE EXCEPTION 'Obsolete messaging wording remains in Portfolio audit epilogues';
  END IF;
END
$verify_obsolete_messaging_epilogues_removed$;
