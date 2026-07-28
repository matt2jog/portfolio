DROP TABLE IF EXISTS "career_event_quarantine";
--> statement-breakpoint
DROP TABLE IF EXISTS "career_event_checkpoints";
--> statement-breakpoint
DROP TABLE IF EXISTS "career_event_inbox";

CREATE OR REPLACE VIEW "resume_cv_profile" AS
SELECT
  "id",
  "name",
  "title",
  "location",
  "phone",
  "email",
  "portfolio_url" AS "website",
  "linkedin_url",
  "linkedin_url" AS "linkedin_display",
  "github_url",
  "github_url" AS "github_display",
  "updated_at"
FROM "personal_information";

CREATE OR REPLACE VIEW "resume_education" AS
SELECT
  "id", "school", "location", "degree", "dates", "position",
  "created_at", "updated_at"
FROM "education";

CREATE OR REPLACE VIEW "resume_experiences" AS
SELECT
  "id", "role", "company", "location", "duration", "description",
  "technologies", "is_active", "position", "created_at", "updated_at"
FROM "experiences";

CREATE OR REPLACE VIEW "resume_experience_bullets" AS
SELECT
  "id",
  "id" AS "experience_id",
  "description" AS "text",
  0::integer AS "position",
  "created_at",
  "updated_at"
FROM "experiences"
WHERE length(trim("description")) > 0;

CREATE OR REPLACE VIEW "resume_projects" AS
SELECT
  "id", "title", "description", "tech", "position", "long_description",
  "deployed_url", "github_url", "created_at"
FROM "projects"
WHERE "deleted_at" IS NULL;

CREATE OR REPLACE VIEW "resume_project_bullets" AS
SELECT
  "id", "project_id", "position", "created_at", "updated_at",
  "bullet_text" AS "text"
FROM "xyz_bullets";

CREATE OR REPLACE VIEW "resume_skill_concepts" AS
SELECT
  "id",
  "grouping_id" AS "tag_group_id",
  NULL::text AS "note",
  NULL::timestamp AS "created_at",
  NULL::timestamp AS "updated_at"
FROM "all_skills";

CREATE OR REPLACE VIEW "resume_skill_variants" AS
SELECT
  "id",
  "id" AS "concept_id",
  "name" AS "wording",
  true AS "is_default",
  "id" AS "legacy_all_skill_id",
  NULL::timestamp AS "created_at",
  NULL::timestamp AS "updated_at"
FROM "all_skills";

CREATE OR REPLACE VIEW "resume_skill_taxonomy_categories" AS
SELECT "id", "name", "created_at", "updated_at"
FROM "skills_group";

CREATE OR REPLACE VIEW "resume_skill_concept_categories" AS
SELECT
  "id",
  "id" AS "concept_id",
  "grouping_id" AS "category_id"
FROM "all_skills"
WHERE "grouping_id" IS NOT NULL;

DO $grant_resume_reads$
BEGIN
  IF to_regrole('resume_app') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA portfolio TO resume_app;
    GRANT SELECT ON TABLE
      portfolio.resume_cv_profile,
      portfolio.resume_education,
      portfolio.resume_experiences,
      portfolio.resume_experience_bullets,
      portfolio.resume_projects,
      portfolio.resume_project_bullets,
      portfolio.resume_skill_concepts,
      portfolio.resume_skill_variants,
      portfolio.resume_skill_taxonomy_categories,
      portfolio.resume_skill_concept_categories
    TO resume_app;
  END IF;
END
$grant_resume_reads$;
