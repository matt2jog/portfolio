import assert from "node:assert/strict";
import test from "node:test";
import {
  portfolioDatabaseBoundary,
  renderPortfolioMigrationSql,
} from "../../shared/database-boundary";

test("Portfolio maps deployment stages to exact schemas and roles", () => {
  const production = portfolioDatabaseBoundary({});
  assert.equal(production.schema, "portfolio");
  assert.equal(production.runtimeLogin, "portfolio_runtime_login");
  assert.equal(production.migratorRole, "portfolio_migrator");

  const staging = portfolioDatabaseBoundary({ DEPLOYMENT_STAGE: "staging" });
  assert.deepEqual(staging, {
    stage: "staging",
    schema: "portfolio_staging",
    runtimeRole: "portfolio_staging_runtime",
    runtimeLogin: "portfolio_staging_runtime_login",
    migratorRole: "portfolio_staging_migrator",
    migratorLogin: "portfolio_staging_migrator_login",
    resumeOwnerRole: "resume_staging_owner",
    resumeAppRole: "resume_staging_app",
    searchPath: "portfolio_staging, extensions",
  });
  assert.throws(
    () => portfolioDatabaseBoundary({ DEPLOYMENT_STAGE: "preview" }),
    /production or staging/,
  );
});

test("Portfolio renders staging SQL without changing source checksums", () => {
  const source = [
    "SET LOCAL search_path = portfolio, extensions, public;",
    "SET LOCAL search_path TO portfolio, pg_catalog;",
    "SELECT * FROM portfolio.projects;",
    "SELECT * FROM public.experience_bullets;",
    "GRANT USAGE ON SCHEMA portfolio TO portfolio_runtime;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_migrator IN SCHEMA portfolio GRANT SELECT ON TABLES TO portfolio_runtime;",
    "GRANT SELECT ON portfolio.resume_projects TO resume_app;",
    "GRANT SELECT ON portfolio.resume_skill_variants TO resume_owner;",
  ].join("\n");
  assert.equal(renderPortfolioMigrationSql(source, portfolioDatabaseBoundary({})), source);
  assert.equal(
    renderPortfolioMigrationSql(
      source,
      portfolioDatabaseBoundary({ DEPLOYMENT_STAGE: "staging" }),
    ),
    [
      "SET LOCAL search_path = portfolio_staging, extensions, public;",
      "SET LOCAL search_path TO portfolio_staging, pg_catalog;",
      "SELECT * FROM portfolio_staging.projects;",
      "SELECT * FROM portfolio_staging.__no_legacy_experience_bullets;",
      "GRANT USAGE ON SCHEMA portfolio_staging TO portfolio_staging_runtime;",
      "ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_staging_migrator IN SCHEMA portfolio_staging GRANT SELECT ON TABLES TO portfolio_staging_runtime;",
      "GRANT SELECT ON portfolio_staging.resume_projects TO resume_staging_app;",
      "GRANT SELECT ON portfolio_staging.resume_skill_variants TO resume_staging_owner;",
    ].join("\n"),
  );
  assert.equal(source.includes("portfolio_staging"), false);
});
