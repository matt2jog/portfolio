SET LOCAL search_path = portfolio, extensions, public;

DO $career_write_authority$
BEGIN
  IF to_regrole('portfolio_runtime') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE
      all_skills,
      bio,
      bio_paragraphs,
      education,
      experience_bullets,
      experiences,
      personal_information,
      portfolio_skills,
      projects,
      skills_group,
      xyz_bullets
    FROM portfolio_runtime;
  END IF;

  IF to_regrole('admin_runtime') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA portfolio TO admin_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      education,
      experience_bullets
    TO admin_runtime;
    GRANT UPDATE ON TABLE xyz_bullets TO admin_runtime;
  END IF;
END
$career_write_authority$;
