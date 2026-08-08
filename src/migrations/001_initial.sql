CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  auth0_sub TEXT UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  tech TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tech)),
  image TEXT,
  hover_image TEXT,
  deployed_url TEXT,
  github_url TEXT,
  ai_system_prompt TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER,
  archived_by TEXT
);

CREATE TABLE xyz_bullets (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bullet_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX xyz_bullets_project_position_idx ON xyz_bullets(project_id, position, id);

CREATE TABLE ai_models (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  label TEXT NOT NULL,
  model_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  fireworks_model_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE bio (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  headline TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE bio_paragraphs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  bio_id TEXT NOT NULL REFERENCES bio(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE skills_group (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE all_skills (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  grouping_id TEXT REFERENCES skills_group(id) ON DELETE SET NULL,
  embedding TEXT CHECK (embedding IS NULL OR json_valid(embedding)),
  embedding_model TEXT,
  CHECK (lower(trim(name)) <> 'gcp pubsub')
);

CREATE TABLE portfolio_skills (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  all_skill_id TEXT NOT NULL REFERENCES all_skills(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES skills_group(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  archived_by TEXT
);
CREATE UNIQUE INDEX portfolio_skills_active_skill_uidx
  ON portfolio_skills(all_skill_id) WHERE deleted_at IS NULL;

CREATE TABLE experiences (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  role TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Remote',
  duration TEXT NOT NULL,
  description TEXT NOT NULL,
  technologies TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(technologies)),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE experience_bullets (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  bullet_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX experience_bullets_experience_position_idx
  ON experience_bullets(experience_id, position, id);

CREATE TABLE education (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  school TEXT NOT NULL,
  location TEXT NOT NULL,
  degree TEXT NOT NULL,
  dates TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE personal_information (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  short_bio TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_formatted TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  github_url TEXT NOT NULL,
  devpost_url TEXT NOT NULL,
  portfolio_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE github_timeline_events (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  ext_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  repo TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX github_timeline_events_timestamp_idx ON github_timeline_events(timestamp DESC);

CREATE TABLE linkedin_timeline_events (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  ext_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  source TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX linkedin_timeline_events_timestamp_idx ON linkedin_timeline_events(timestamp DESC);

CREATE TABLE admin_policy_acceptance (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  admin_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  policy_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
  UNIQUE (admin_id, policy_version, terms_version, privacy_version)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT CHECK (payload IS NULL OR json_valid(payload)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE browser_tracking (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  hashed_uuid TEXT NOT NULL UNIQUE,
  tr_en TEXT,
  consented_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE welcome_messages (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX welcome_messages_archived_at_idx ON welcome_messages(archived_at);

CREATE TABLE legal_document_versions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('privacy', 'terms', 'tracking')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  committed_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (doc_type, content_hash)
);
CREATE INDEX legal_document_versions_doc_type_committed_at_idx
  ON legal_document_versions(doc_type, committed_at);

CREATE VIEW legal_document_active_ranges AS
SELECT id, doc_type, content, content_hash, commit_sha, committed_at,
       lead(committed_at) OVER (PARTITION BY doc_type ORDER BY committed_at) AS effective_until
FROM legal_document_versions;

CREATE VIEW resume_cv_profile AS
SELECT id, name, title, location, phone, email, portfolio_url AS website,
       linkedin_url, linkedin_url AS linkedin_display,
       github_url, github_url AS github_display, updated_at
FROM personal_information;

CREATE VIEW resume_education AS
SELECT id, school, location, degree, dates, position, created_at, updated_at FROM education;

CREATE VIEW resume_experiences AS
SELECT id, role, company, location, duration, description, technologies,
       is_active, position, created_at, updated_at FROM experiences;

CREATE VIEW resume_experience_bullets AS
SELECT id, experience_id, bullet_text AS text, position, created_at, updated_at
FROM experience_bullets;

CREATE VIEW resume_projects AS
SELECT id, title, description, tech, position, long_description,
       deployed_url, github_url, created_at
FROM projects WHERE deleted_at IS NULL;

CREATE VIEW resume_project_bullets AS
SELECT id, project_id, position, created_at, updated_at, bullet_text AS text FROM xyz_bullets;

CREATE VIEW resume_skill_concepts AS
SELECT id, grouping_id AS tag_group_id, NULL AS note,
       NULL AS created_at, NULL AS updated_at FROM all_skills;

CREATE VIEW resume_skill_variants AS
SELECT id, id AS concept_id, name AS wording, 1 AS is_default,
       id AS legacy_all_skill_id, NULL AS created_at, NULL AS updated_at FROM all_skills;

CREATE VIEW resume_skill_taxonomy_categories AS
SELECT id, name, created_at, updated_at FROM skills_group;

CREATE VIEW resume_skill_concept_categories AS
SELECT id, id AS concept_id, grouping_id AS category_id
FROM all_skills WHERE grouping_id IS NOT NULL;
