SET LOCAL search_path TO portfolio, pg_catalog;

CREATE TEMP TABLE portfolio_skill_groups_003 (
  id varchar PRIMARY KEY,
  name text NOT NULL,
  position integer NOT NULL
) ON COMMIT DROP;

INSERT INTO portfolio_skill_groups_003 (id, name, position)
VALUES
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'Languages & Web', 0),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Frameworks & Libraries', 1),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'AI & Machine Learning', 2),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'Data & Messaging', 3),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Cloud & Infrastructure', 4),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Developer Tools & Automation', 5);

CREATE TEMP TABLE portfolio_skill_targets_003 (
  group_id varchar NOT NULL REFERENCES portfolio_skill_groups_003(id),
  name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO portfolio_skill_targets_003 (group_id, name)
VALUES
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'Bash'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'C'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'C++'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'CSS'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'HTML'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'Java'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'JavaScript'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'PHP'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'Python'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'Python.h'),
  ('30391994-e84e-40a5-9c3d-3c1bf0c2f900', 'SQL'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'FastAPI'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Flask'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Matplotlib'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'NumPy'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Pennylane'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Pydantic'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Pytest-asyncio'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Quart'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'React'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'SciPy'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'SQLAlchemy'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'SQLModel'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'Tkinter'),
  ('bfb99156-5c74-4409-b7f4-bc1c32e4a165', 'WebGL'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'A* Search'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Agentic Memory'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'BERT'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Brownian Motion Simulation'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'CKKS'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'GraphRAG'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Homomorphic Encryption'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'K-Means'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'LangChain'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'LangGraph'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'LLM In-loop Evaluation'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'LLM-as-a-judge'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Monte Carlo Methods'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Multi-agent Systems'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Ontology Mapping'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'RAG'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Recommendation Algorithms'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'Sentiment Analysis'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'SLERP'),
  ('4ee4eb8e-74c7-436b-a447-5458da7b2200', 'XGBoost'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'AST-Indexing'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'Census Data'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'Data Processing'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'DBeaver'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'Firestore'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'GCP PubSub'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'Hadoop'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'HDFS'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'LoRa Telemetry'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'MySQL'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'PostgreSQL'),
  ('d5aba8d9-7831-48ee-a14f-523587893896', 'TimeScaleDB'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Ardupilot'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Avionics'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'AWS EC2'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'AWS S3'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Docker Compose'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Distributed Systems'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Embedded Systems'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'GCP Cloud Run'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'GCP Cron'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'GKE'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Linux'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'macOS'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Mesh Networks'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Multi-threaded Systems'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Socket I/O'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'TLS Decryption'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Wearable Tech'),
  ('f1842528-f792-42d3-9009-21bd935febcf', 'Windows'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Chrome Extensions'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'CI/CD'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Dorking'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Gemini API'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Git'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'GitHub Apps'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Jupyter'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'MCP'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'MITMProxy'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'OSRM'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Pyautogui'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Scrum'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Selenium'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Serp API'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'VS Code'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Vim'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Web Crawling'),
  ('f75e4b6b-bf57-4f25-a4d2-370a0de47622', 'Wireshark');

CREATE TEMP TABLE portfolio_skill_migration_context_003 (
  legacy_state boolean NOT NULL,
  deleted_skills integer NOT NULL DEFAULT 0,
  deleted_groups integer NOT NULL DEFAULT 0
) ON COMMIT DROP;

DO $validate_source$
DECLARE
  group_count integer;
  skill_count integer;
  active_membership_count integer;
BEGIN
  SELECT count(*) INTO group_count FROM skills_group;
  SELECT count(*) INTO skill_count FROM all_skills;
  SELECT count(*) INTO active_membership_count
  FROM portfolio_skills
  WHERE deleted_at IS NULL;

  IF group_count = 0 AND skill_count = 0 AND active_membership_count = 0 THEN
    INSERT INTO portfolio_skill_migration_context_003 (legacy_state) VALUES (false);
    RETURN;
  END IF;

  IF group_count <> 21 OR skill_count <> 99 OR active_membership_count <> 96 THEN
    RAISE EXCEPTION
      'Unexpected Portfolio skill state before 003: groups=%, skills=%, active memberships=%',
      group_count, skill_count, active_membership_count;
  END IF;

  IF (SELECT count(*) FROM portfolio_skill_groups_003) <> 6
     OR (SELECT count(*) FROM portfolio_skill_targets_003) <> 93
     OR (SELECT count(*) FROM skills_group AS skill_group
         JOIN portfolio_skill_groups_003 AS target ON target.id = skill_group.id) <> 6 THEN
    RAISE EXCEPTION 'Portfolio 003 target groups are incomplete';
  END IF;

  IF (SELECT count(*) FROM all_skills AS skill
      JOIN portfolio_skill_targets_003 AS target ON target.name = skill.name) <> 93
     OR (SELECT count(DISTINCT skill.name) FROM all_skills AS skill
         JOIN portfolio_skill_targets_003 AS target ON target.name = skill.name) <> 93 THEN
    RAISE EXCEPTION 'Portfolio 003 target skills do not match the canonical source';
  END IF;

  IF (SELECT count(*) FROM all_skills
      WHERE id IN (
        '408028d8-7356-4e1d-9836-beb1bcc486c3',
        'eedc6ae1-244f-47fc-9b94-3e2e1ca83eb6',
        '3c5116dd-dfa3-40e8-b916-797a6e7cb0b1'
      )) <> 3
     OR (SELECT count(*) FROM portfolio_skills
         WHERE deleted_at IS NULL
           AND all_skill_id IN (
             '408028d8-7356-4e1d-9836-beb1bcc486c3',
             'eedc6ae1-244f-47fc-9b94-3e2e1ca83eb6',
             '3c5116dd-dfa3-40e8-b916-797a6e7cb0b1'
           )) <> 3 THEN
    RAISE EXCEPTION 'Portfolio 003 removable canonical skills are not in the expected state';
  END IF;

  IF (SELECT count(*) FROM all_skills WHERE name IN ('hel', 'sdv', 'SmokeTest Skill')) <> 3
     OR (SELECT count(*) FROM portfolio_skills AS membership
         JOIN all_skills AS skill ON skill.id = membership.all_skill_id
         WHERE skill.name IN ('hel', 'sdv', 'SmokeTest Skill')) <> 0 THEN
    RAISE EXCEPTION 'Portfolio 003 disposable test skills are not in the expected state';
  END IF;

  IF (SELECT count(*) FROM portfolio_skills AS membership
      JOIN all_skills AS skill ON skill.id = membership.all_skill_id
      JOIN portfolio_skill_targets_003 AS target ON target.name = skill.name
      WHERE membership.deleted_at IS NULL) <> 93 THEN
    RAISE EXCEPTION 'Portfolio 003 target memberships are incomplete';
  END IF;

  INSERT INTO portfolio_skill_migration_context_003 (legacy_state) VALUES (true);
END
$validate_source$;

UPDATE skills_group AS skill_group
SET name = target.name,
    position = target.position,
    updated_at = now()
FROM portfolio_skill_groups_003 AS target
WHERE target.id = skill_group.id;

UPDATE all_skills AS skill
SET grouping_id = target.group_id
FROM portfolio_skill_targets_003 AS target
WHERE target.name = skill.name;

UPDATE portfolio_skills AS membership
SET group_id = target.group_id
FROM all_skills AS skill
JOIN portfolio_skill_targets_003 AS target ON target.name = skill.name
WHERE membership.all_skill_id = skill.id
  AND membership.deleted_at IS NULL;

WITH deleted AS (
  DELETE FROM all_skills
  WHERE id IN (
      '408028d8-7356-4e1d-9836-beb1bcc486c3',
      'eedc6ae1-244f-47fc-9b94-3e2e1ca83eb6',
      '3c5116dd-dfa3-40e8-b916-797a6e7cb0b1'
    )
    OR name IN ('hel', 'sdv', 'SmokeTest Skill')
  RETURNING 1
)
UPDATE portfolio_skill_migration_context_003
SET deleted_skills = (SELECT count(*) FROM deleted);

WITH deleted AS (
  DELETE FROM skills_group AS skill_group
  WHERE NOT EXISTS (
    SELECT 1
    FROM portfolio_skill_groups_003 AS target
    WHERE target.id = skill_group.id
  )
  RETURNING 1
)
UPDATE portfolio_skill_migration_context_003
SET deleted_groups = (SELECT count(*) FROM deleted);

WITH ranked AS (
  SELECT
    membership.id,
    (
      row_number() OVER (
        PARTITION BY membership.group_id
        ORDER BY lower(btrim(skill.name)), skill.name, membership.id
      ) - 1
    )::integer AS position
  FROM portfolio_skills AS membership
  JOIN all_skills AS skill ON skill.id = membership.all_skill_id
  WHERE membership.deleted_at IS NULL
)
UPDATE portfolio_skills AS membership
SET position = ranked.position
FROM ranked
WHERE ranked.id = membership.id;

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_skills_active_skill_uidx
  ON portfolio_skills(all_skill_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS skills_group_normalized_name_uidx
  ON skills_group(lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS all_skills_normalized_name_uidx
  ON all_skills(lower(btrim(name)));

DO $validate_result$
DECLARE
  is_legacy boolean;
  group_count integer;
  skill_count integer;
  active_membership_count integer;
BEGIN
  SELECT legacy_state INTO STRICT is_legacy
  FROM portfolio_skill_migration_context_003;

  IF is_legacy
     AND (SELECT deleted_skills FROM portfolio_skill_migration_context_003) <> 6 THEN
    RAISE EXCEPTION 'Portfolio 003 removed an unexpected number of canonical skills';
  END IF;
  IF is_legacy
     AND (SELECT deleted_groups FROM portfolio_skill_migration_context_003) <> 15 THEN
    RAISE EXCEPTION 'Portfolio 003 removed an unexpected number of display groups';
  END IF;

  SELECT count(*) INTO group_count FROM skills_group;
  SELECT count(*) INTO skill_count FROM all_skills;
  SELECT count(*) INTO active_membership_count
  FROM portfolio_skills
  WHERE deleted_at IS NULL;

  IF NOT is_legacy THEN
    IF group_count <> 0 OR skill_count <> 0 OR active_membership_count <> 0 THEN
      RAISE EXCEPTION 'Portfolio 003 changed an empty skill catalog';
    END IF;
    RETURN;
  END IF;

  IF group_count <> 6 OR skill_count <> 93 OR active_membership_count <> 93 THEN
    RAISE EXCEPTION
      'Unexpected Portfolio skill state after 003: groups=%, skills=%, active memberships=%',
      group_count, skill_count, active_membership_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM portfolio_skill_targets_003 AS target
    LEFT JOIN all_skills AS skill ON skill.name = target.name
    LEFT JOIN portfolio_skills AS membership
      ON membership.all_skill_id = skill.id
     AND membership.deleted_at IS NULL
    WHERE skill.grouping_id IS DISTINCT FROM target.group_id
       OR membership.group_id IS DISTINCT FROM target.group_id
  ) THEN
    RAISE EXCEPTION 'Portfolio 003 left a skill outside its canonical display group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM portfolio_skill_groups_003 AS target
    LEFT JOIN (
      SELECT group_id, count(*)::integer AS skill_count
      FROM portfolio_skills
      WHERE deleted_at IS NULL
      GROUP BY group_id
    ) AS actual ON actual.group_id = target.id
    WHERE actual.skill_count IS DISTINCT FROM CASE target.position
      WHEN 0 THEN 11
      WHEN 1 THEN 14
      WHEN 2 THEN 20
      WHEN 3 THEN 12
      WHEN 4 THEN 18
      WHEN 5 THEN 18
    END
  ) THEN
    RAISE EXCEPTION 'Portfolio 003 produced unexpected display-group counts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM portfolio_skills
    WHERE deleted_at IS NULL
    GROUP BY group_id
    HAVING min(position) <> 0
       OR max(position) <> count(*) - 1
       OR count(DISTINCT position) <> count(*)
  ) THEN
    RAISE EXCEPTION 'Portfolio 003 produced invalid skill ordering';
  END IF;
END
$validate_result$;

DO $revoke_resume_owner$
BEGIN
  IF to_regrole('resume_owner') IS NOT NULL THEN
    REVOKE SELECT ON portfolio_skills, resume_skill_variants FROM resume_owner;
    REVOKE USAGE ON SCHEMA portfolio FROM resume_owner;
  END IF;
END
$revoke_resume_owner$;
