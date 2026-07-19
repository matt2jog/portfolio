-- Preserve skill presentation data while repairing legacy dangling references before constraints.
UPDATE all_skills
SET grouping_id = NULL
WHERE grouping_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM skills_group
    WHERE skills_group.id = all_skills.grouping_id
  );
--> statement-breakpoint
DELETE FROM portfolio_skills
WHERE NOT EXISTS (
  SELECT 1
  FROM all_skills
  WHERE all_skills.id = portfolio_skills.all_skill_id
);
--> statement-breakpoint
ALTER TABLE all_skills
  ADD CONSTRAINT all_skills_grouping_id_skills_group_id_fk
  FOREIGN KEY (grouping_id)
  REFERENCES skills_group(id)
  ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE portfolio_skills
  ADD CONSTRAINT portfolio_skills_all_skill_id_all_skills_id_fk
  FOREIGN KEY (all_skill_id)
  REFERENCES all_skills(id)
  ON DELETE CASCADE;
