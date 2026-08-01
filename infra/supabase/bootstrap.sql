DO $roles$
BEGIN
  IF to_regrole('portfolio_migrator') IS NULL THEN
    CREATE ROLE portfolio_migrator NOLOGIN NOINHERIT;
  END IF;
  IF to_regrole('portfolio_migrator_login') IS NULL THEN
    CREATE ROLE portfolio_migrator_login LOGIN NOINHERIT;
  END IF;
  IF to_regrole('portfolio_runtime') IS NULL THEN
    CREATE ROLE portfolio_runtime NOLOGIN NOINHERIT;
  END IF;
  IF to_regrole('portfolio_runtime_login') IS NULL THEN
    CREATE ROLE portfolio_runtime_login LOGIN INHERIT;
  END IF;
  IF to_regrole('admin_runtime') IS NULL THEN
    CREATE ROLE admin_runtime NOLOGIN NOINHERIT;
  END IF;
  IF to_regrole('admin_staging_runtime') IS NULL THEN
    CREATE ROLE admin_staging_runtime NOLOGIN NOINHERIT;
  END IF;
END
$roles$;

ALTER ROLE portfolio_migrator
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN NOINHERIT;
ALTER ROLE portfolio_migrator_login
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN NOINHERIT;
ALTER ROLE portfolio_runtime
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN NOINHERIT;
ALTER ROLE portfolio_runtime_login
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN INHERIT;
ALTER ROLE admin_runtime
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN NOINHERIT;
ALTER ROLE admin_staging_runtime
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN NOINHERIT;

GRANT portfolio_migrator TO portfolio_migrator_login;
GRANT portfolio_runtime TO portfolio_runtime_login
  WITH INHERIT TRUE, SET TRUE;

CREATE SCHEMA IF NOT EXISTS portfolio AUTHORIZATION portfolio_migrator;
ALTER SCHEMA portfolio OWNER TO portfolio_migrator;
REVOKE ALL ON SCHEMA portfolio FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA portfolio TO portfolio_migrator;
GRANT USAGE ON SCHEMA portfolio TO portfolio_runtime;

DO $extensions$
BEGIN
  IF to_regnamespace('extensions') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA extensions TO portfolio_migrator, portfolio_runtime;
  END IF;
END
$extensions$;

REVOKE CREATE ON SCHEMA public
  FROM portfolio_migrator, portfolio_migrator_login, portfolio_runtime, portfolio_runtime_login;
