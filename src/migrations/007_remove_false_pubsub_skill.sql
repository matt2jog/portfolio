-- Resume removes its memberships first and now protects canonical references
-- with ON DELETE RESTRICT. This migration removes only the disproven skill.

DELETE FROM portfolio_skills AS membership
USING all_skills AS skill
WHERE membership.all_skill_id = skill.id
  AND lower(btrim(skill.name)) = 'gcp pubsub';

DELETE FROM all_skills
WHERE lower(btrim(name)) = 'gcp pubsub';

ALTER TABLE portfolio_skills
  DROP CONSTRAINT portfolio_skills_all_skill_id_all_skills_id_fk;

ALTER TABLE portfolio_skills
  ADD CONSTRAINT portfolio_skills_all_skill_id_all_skills_id_fk
  FOREIGN KEY (all_skill_id)
  REFERENCES all_skills(id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE portfolio_skills
  VALIDATE CONSTRAINT portfolio_skills_all_skill_id_all_skills_id_fk;

WITH ranked AS (
  SELECT
    membership.id,
    (
      row_number() OVER (
        PARTITION BY membership.group_id
        ORDER BY membership.position, membership.id
      ) - 1
    )::integer AS position
  FROM portfolio_skills AS membership
  WHERE membership.deleted_at IS NULL
)
UPDATE portfolio_skills AS membership
SET position = ranked.position
FROM ranked
WHERE membership.id = ranked.id;

DO $verify_false_pubsub_removed$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM all_skills
    WHERE lower(btrim(name)) = 'gcp pubsub'
  ) OR EXISTS (
    SELECT 1
    FROM portfolio_skills AS membership
    JOIN all_skills AS skill ON skill.id = membership.all_skill_id
    WHERE lower(btrim(skill.name)) = 'gcp pubsub'
  ) THEN
    RAISE EXCEPTION 'False Pub/Sub skill remains in Portfolio';
  END IF;
END
$verify_false_pubsub_removed$;
