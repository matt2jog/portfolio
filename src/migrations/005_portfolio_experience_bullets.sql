SET LOCAL search_path TO portfolio, pg_catalog;

CREATE TABLE experience_bullets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id varchar NOT NULL
    CONSTRAINT experience_bullets_experience_id_experiences_id_fk
    REFERENCES experiences(id) ON DELETE CASCADE,
  bullet_text text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX experience_bullets_experience_id_position_idx
  ON experience_bullets(experience_id, position, id);

DO $import_legacy_experience_bullets$
DECLARE
  source_exists boolean := to_regclass('public.experience_bullets') IS NOT NULL;
  source_count bigint;
  imported_count bigint;
  experience_count bigint;
BEGIN
  SELECT count(*) INTO experience_count FROM experiences;

  IF NOT source_exists THEN
    IF experience_count <> 0 THEN
      RAISE EXCEPTION
        'public.experience_bullets is missing while Portfolio has % experiences; refusing a lossy migration',
        experience_count;
    END IF;
    RETURN;
  END IF;

  IF NOT has_table_privilege(current_user, 'public.experience_bullets', 'SELECT') THEN
    RAISE EXCEPTION
      'portfolio_migrator requires a temporary SELECT grant on public.experience_bullets';
  END IF;

  SELECT count(*) INTO source_count FROM public.experience_bullets;
  IF source_count <> 12 THEN
    RAISE EXCEPTION
      'Expected exactly 12 legacy experience bullets, found %',
      source_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.experience_bullets AS legacy
    LEFT JOIN experiences AS experience
      ON experience.id = legacy.experience_id::varchar
    WHERE experience.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Legacy experience bullets contain an experience_id absent from portfolio.experiences';
  END IF;

  INSERT INTO experience_bullets (
    id,
    experience_id,
    bullet_text,
    position,
    created_at,
    updated_at
  )
  SELECT
    legacy.id::varchar,
    legacy.experience_id::varchar,
    legacy.bullet_text::text,
    legacy.position::integer,
    legacy.created_at::timestamp,
    legacy.updated_at::timestamp
  FROM public.experience_bullets AS legacy
  ORDER BY legacy.experience_id, legacy.position, legacy.id;

  GET DIAGNOSTICS imported_count = ROW_COUNT;
  IF imported_count <> source_count THEN
    RAISE EXCEPTION
      'Imported % of % legacy experience bullets',
      imported_count,
      source_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.experience_bullets AS legacy
    FULL OUTER JOIN experience_bullets AS imported
      ON imported.id = legacy.id::varchar
    WHERE legacy.id IS NULL
       OR imported.id IS NULL
       OR imported.experience_id IS DISTINCT FROM legacy.experience_id::varchar
       OR imported.bullet_text IS DISTINCT FROM legacy.bullet_text::text
       OR imported.position IS DISTINCT FROM legacy.position::integer
       OR imported.created_at IS DISTINCT FROM legacy.created_at::timestamp
       OR imported.updated_at IS DISTINCT FROM legacy.updated_at::timestamp
  ) THEN
    RAISE EXCEPTION
      'Imported experience bullets do not exactly match public.experience_bullets';
  END IF;
END
$import_legacy_experience_bullets$;

CREATE OR REPLACE VIEW resume_experience_bullets AS
SELECT
  id,
  experience_id,
  bullet_text AS text,
  position,
  created_at,
  updated_at
FROM experience_bullets;

REVOKE ALL ON TABLE experience_bullets, resume_experience_bullets FROM PUBLIC;

DO $experience_bullet_grants$
BEGIN
  IF to_regrole('portfolio_runtime') IS NOT NULL THEN
    GRANT SELECT ON TABLE experience_bullets TO portfolio_runtime;
  END IF;

  IF to_regrole('resume_app') IS NOT NULL THEN
    REVOKE ALL ON TABLE experience_bullets FROM resume_app;
    GRANT SELECT ON TABLE resume_experience_bullets TO resume_app;
  END IF;
END
$experience_bullet_grants$;
