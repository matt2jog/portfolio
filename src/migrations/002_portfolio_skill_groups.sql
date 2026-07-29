ALTER TABLE portfolio_skills
  ADD COLUMN group_id varchar
  CONSTRAINT portfolio_skills_group_id_skills_group_id_fk
  REFERENCES skills_group(id) ON DELETE SET NULL;

UPDATE portfolio_skills AS portfolio_skill
SET group_id = skill.grouping_id
FROM all_skills AS skill
WHERE skill.id = portfolio_skill.all_skill_id
  AND portfolio_skill.group_id IS NULL;

CREATE INDEX portfolio_skills_group_id_position_idx
  ON portfolio_skills(group_id, position)
  WHERE deleted_at IS NULL;

DO $grant_resume_owner$
BEGIN
  IF to_regrole('resume_owner') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA portfolio TO resume_owner;
    GRANT SELECT ON portfolio.portfolio_skills, portfolio.resume_skill_variants TO resume_owner;
  END IF;
END
$grant_resume_owner$;
