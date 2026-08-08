-- Test-only contract fixture. Admin owns the canonical career migration.
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
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
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bullet_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE ai_models (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  model_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  fireworks_model_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE bio (
  id TEXT PRIMARY KEY NOT NULL,
  headline TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE bio_paragraphs (
  id TEXT PRIMARY KEY NOT NULL,
  bio_id TEXT NOT NULL REFERENCES bio(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE experiences (
  id TEXT PRIMARY KEY NOT NULL,
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
  id TEXT PRIMARY KEY NOT NULL,
  experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  bullet_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE skills_group (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE all_skills (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  grouping_id TEXT REFERENCES skills_group(id) ON DELETE SET NULL,
  embedding TEXT CHECK (embedding IS NULL OR json_valid(embedding)),
  embedding_model TEXT,
  CHECK (lower(trim(name)) <> 'gcp pubsub')
);

CREATE TABLE portfolio_skills (
  id TEXT PRIMARY KEY NOT NULL,
  all_skill_id TEXT NOT NULL REFERENCES all_skills(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES skills_group(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  archived_by TEXT
);

CREATE TABLE personal_information (
  id TEXT PRIMARY KEY NOT NULL,
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

CREATE TABLE linkedin_timeline_events (
  id TEXT PRIMARY KEY NOT NULL,
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

CREATE TABLE welcome_messages (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE VIEW resume_projects AS
SELECT id, title, description, tech, position, long_description,
       deployed_url, github_url, created_at
FROM projects WHERE deleted_at IS NULL;

CREATE VIEW resume_experiences AS
SELECT id, role, company, location, duration, description, technologies,
       is_active, position, created_at, updated_at FROM experiences;

CREATE VIEW resume_experience_bullets AS
SELECT id, experience_id, bullet_text AS text, position, created_at, updated_at
FROM experience_bullets;

CREATE VIEW resume_skill_variants AS
SELECT id, id AS concept_id, name AS wording, 1 AS is_default,
       id AS legacy_all_skill_id, NULL AS created_at, NULL AS updated_at
FROM all_skills;
