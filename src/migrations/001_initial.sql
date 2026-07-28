SET LOCAL search_path = portfolio, extensions, public;

CREATE TABLE users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  google_sub text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'user',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  long_description text,
  tech text[] NOT NULL DEFAULT '{}',
  image text,
  hover_image text,
  deployed_url text,
  github_url text,
  ai_system_prompt text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp,
  archived_by varchar
);

CREATE TABLE xyz_bullets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL,
  bullet_text text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE ai_models (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  model_id text NOT NULL UNIQUE,
  provider text NOT NULL,
  fireworks_model_id text,
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE bio (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE bio_paragraphs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_id varchar NOT NULL,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE skills_group (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE all_skills (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grouping_id varchar
    CONSTRAINT all_skills_grouping_id_skills_group_id_fk
    REFERENCES skills_group(id) ON DELETE SET NULL,
  embedding vector(768),
  embedding_model text
);

CREATE TABLE portfolio_skills (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  all_skill_id varchar NOT NULL
    CONSTRAINT portfolio_skills_all_skill_id_all_skills_id_fk
    REFERENCES all_skills(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  deleted_at timestamp,
  archived_by varchar
);

CREATE TABLE experiences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  company text NOT NULL,
  location text NOT NULL DEFAULT 'Remote',
  duration text NOT NULL,
  description text NOT NULL,
  technologies text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE education (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  school text NOT NULL,
  location text NOT NULL,
  degree text NOT NULL,
  dates text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE personal_information (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL,
  location text NOT NULL,
  short_bio text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  phone_formatted text NOT NULL,
  linkedin_url text NOT NULL,
  github_url text NOT NULL,
  devpost_url text NOT NULL,
  portfolio_url text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE github_timeline_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ext_id varchar NOT NULL UNIQUE,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  repo text NOT NULL,
  timestamp timestamp NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE linkedin_timeline_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ext_id varchar NOT NULL UNIQUE,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  source text NOT NULL,
  timestamp timestamp NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE admin_policy_acceptance (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id varchar NOT NULL,
  timestamp timestamp NOT NULL DEFAULT now(),
  policy_version varchar NOT NULL,
  terms_version varchar NOT NULL,
  privacy_version varchar NOT NULL,
  accepted boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX admin_policy_acceptance_unique_idx
  ON admin_policy_acceptance (admin_id, policy_version, terms_version, privacy_version);

CREATE TABLE audit_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE browser_tracking (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_uuid text NOT NULL UNIQUE,
  tr_en text,
  consented_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE browser_tracking_ips (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_uuid text NOT NULL,
  ip text NOT NULL,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (hashed_uuid, ip)
);
CREATE INDEX browser_tracking_ips_uuid_idx ON browser_tracking_ips (hashed_uuid);

CREATE TABLE browser_request_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_uuid text NOT NULL,
  ip text,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer,
  duration_ms integer,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX browser_request_logs_uuid_idx ON browser_request_logs (hashed_uuid);

CREATE TABLE ip_rate_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer,
  tracking_ip_id varchar REFERENCES browser_tracking_ips(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX ip_rate_logs_ip_created_idx ON ip_rate_logs (ip, created_at);
CREATE INDEX ip_rate_logs_tracking_ip_id_idx ON ip_rate_logs (tracking_ip_id);

CREATE TABLE welcome_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  message text NOT NULL,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX welcome_messages_archived_at_idx ON welcome_messages (archived_at);

CREATE TABLE legal_document_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('privacy', 'terms', 'tracking')),
  content text NOT NULL,
  content_hash text NOT NULL,
  commit_sha text NOT NULL,
  committed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX legal_document_versions_doc_type_content_hash_key
  ON legal_document_versions (doc_type, content_hash);
CREATE INDEX legal_document_versions_doc_type_committed_at_idx
  ON legal_document_versions (doc_type, committed_at);
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;

CREATE VIEW legal_document_active_ranges WITH (security_invoker = true) AS
SELECT
  id,
  doc_type,
  content,
  content_hash,
  commit_sha,
  committed_at,
  lead(committed_at) OVER (PARTITION BY doc_type ORDER BY committed_at) AS effective_until
FROM legal_document_versions;

CREATE VIEW resume_cv_profile AS
SELECT
  id,
  name,
  title,
  location,
  phone,
  email,
  portfolio_url AS website,
  linkedin_url,
  linkedin_url AS linkedin_display,
  github_url,
  github_url AS github_display,
  updated_at
FROM personal_information;

CREATE VIEW resume_education AS
SELECT id, school, location, degree, dates, position, created_at, updated_at
FROM education;

CREATE VIEW resume_experiences AS
SELECT
  id,
  role,
  company,
  location,
  duration,
  description,
  technologies,
  is_active,
  position,
  created_at,
  updated_at
FROM experiences;

CREATE VIEW resume_experience_bullets AS
SELECT
  id,
  id AS experience_id,
  description AS text,
  0::integer AS position,
  created_at,
  updated_at
FROM experiences
WHERE length(trim(description)) > 0;

CREATE VIEW resume_projects AS
SELECT
  id,
  title,
  description,
  tech,
  position,
  long_description,
  deployed_url,
  github_url,
  created_at
FROM projects
WHERE deleted_at IS NULL;

CREATE VIEW resume_project_bullets AS
SELECT id, project_id, position, created_at, updated_at, bullet_text AS text
FROM xyz_bullets;

CREATE VIEW resume_skill_concepts AS
SELECT
  id,
  grouping_id AS tag_group_id,
  NULL::text AS note,
  NULL::timestamp AS created_at,
  NULL::timestamp AS updated_at
FROM all_skills;

CREATE VIEW resume_skill_variants AS
SELECT
  id,
  id AS concept_id,
  name AS wording,
  true AS is_default,
  id AS legacy_all_skill_id,
  NULL::timestamp AS created_at,
  NULL::timestamp AS updated_at
FROM all_skills;

CREATE VIEW resume_skill_taxonomy_categories AS
SELECT id, name, created_at, updated_at
FROM skills_group;

CREATE VIEW resume_skill_concept_categories AS
SELECT id, id AS concept_id, grouping_id AS category_id
FROM all_skills
WHERE grouping_id IS NOT NULL;

REVOKE ALL ON ALL TABLES IN SCHEMA portfolio FROM PUBLIC;

DO $grants$
BEGIN
  IF to_regrole('portfolio_runtime') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA portfolio TO portfolio_runtime;
    GRANT SELECT ON TABLE
      admin_policy_acceptance,
      ai_models,
      all_skills,
      bio,
      bio_paragraphs,
      browser_tracking,
      browser_tracking_ips,
      education,
      experiences,
      github_timeline_events,
      linkedin_timeline_events,
      personal_information,
      portfolio_skills,
      projects,
      skills_group,
      users,
      welcome_messages,
      xyz_bullets
    TO portfolio_runtime;
    GRANT INSERT, UPDATE ON TABLE
      admin_policy_acceptance,
      all_skills,
      browser_tracking,
      browser_tracking_ips,
      portfolio_skills,
      projects,
      skills_group,
      users,
      welcome_messages
    TO portfolio_runtime;
    GRANT INSERT ON TABLE
      audit_logs,
      browser_request_logs,
      github_timeline_events,
      ip_rate_logs
    TO portfolio_runtime;
    GRANT DELETE ON TABLE
      portfolio_skills,
      skills_group,
      welcome_messages
    TO portfolio_runtime;
  END IF;

  IF to_regrole('resume_app') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA portfolio TO resume_app;
    GRANT SELECT ON TABLE
      resume_cv_profile,
      resume_education,
      resume_experiences,
      resume_experience_bullets,
      resume_projects,
      resume_project_bullets,
      resume_skill_concepts,
      resume_skill_variants,
      resume_skill_taxonomy_categories,
      resume_skill_concept_categories
    TO resume_app;
  END IF;
END
$grants$;
