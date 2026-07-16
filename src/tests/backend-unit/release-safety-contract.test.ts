import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.resolve(root, relativePath), "utf8");
}

test("database bootstrap separates privilege-free logins from NOLOGIN capabilities", () => {
  const pre = read("infra/supabase/portfolio-pre-migration.sql");
  const post = read("infra/supabase/portfolio-role-acls.sql");

  for (const login of [
    "portfolio_runtime_login",
    "portfolio_migrator_login",
    "portfolio_legal_login",
  ]) {
    assert.match(pre, new RegExp(`CREATE ROLE ${login} LOGIN[\\s\\S]+NOINHERIT`));
    assert.doesNotMatch(post, new RegExp(`(?:GRANT|OWNER TO)[^;]+${login}`));
  }
  for (const capability of [
    "portfolio_runtime",
    "portfolio_migrator",
    "legal_audit_writer",
    "portfolio_audit_owner",
    "portfolio_compensation_operator",
  ]) {
    assert.match(pre, new RegExp(`CREATE ROLE ${capability} NOLOGIN[\\s\\S]+NOINHERIT`));
  }
  for (const owner of [
    "portfolio_migrator",
    "portfolio_audit_owner",
    "portfolio_compensation_operator",
  ]) {
    assert.match(
      pre,
      new RegExp(`FOR ROLE ${owner}[\\s\\S]*REVOKE EXECUTE ON ROUTINES FROM PUBLIC`),
    );
    assert.match(
      pre,
      new RegExp(`FOR ROLE ${owner}[\\s\\S]*REVOKE USAGE ON TYPES FROM PUBLIC`),
    );
  }
  assert.doesNotMatch(pre, /CREATE TABLE|CREATE FUNCTION|CREATE VIEW/);
  assert.match(pre, /CREATE SCHEMA IF NOT EXISTS portfolio AUTHORIZATION portfolio_migrator/);
  assert.match(pre, /SET timezone TO 'UTC'/i);
  assert.match(post, /pg_default_acl/);
  assert.match(post, /aclexplode/);
  assert.match(post, /PUBLIC/);
});

test("production session verification proves login, SET ROLE, capability, and RESET ROLE", () => {
  const session = read("src/shared/postgres-session.ts");

  assert.match(session, /SET ROLE/);
  assert.match(session, /RESET ROLE/);
  assert.match(session, /portfolio_runtime_login/);
  assert.match(session, /portfolio_migrator_login/);
  assert.match(session, /portfolio_legal_login/);
  assert.match(session, /directLoginPrivilegesAreEmpty/);
  assert.match(session, /defaultAclIsExact/);
  assert.match(session, /effectiveAclIsExact/);
  assert.match(session, /current_setting\('TimeZone'\)/);
});

test("deploy executes legal and cutover gates before bootstrap, migration, post-ACL, then candidate", () => {
  const workflow = read(".github/workflows/deploy.yml");
  const databaseRelease = read("src/scripts/release/run-database-release-from-bundle.ts");

  assert.match(databaseRelease, /portfolio-pre-migration\.sql/);
  assert.match(databaseRelease, /run-migrations-from-bundle/);
  assert.match(databaseRelease, /portfolio-role-acls\.sql/);
  assert.ok(
    databaseRelease.lastIndexOf("portfolio-pre-migration.sql")
      < databaseRelease.indexOf("run-migrations-from-bundle"),
  );
  assert.ok(
    databaseRelease.lastIndexOf("run-migrations-from-bundle")
      < databaseRelease.lastIndexOf("portfolio-role-acls.sql"),
  );
  assert.match(workflow, /prepare_release:/);
  assert.match(workflow, /prepare_release:[\s\S]+needs:\s*legal_audit/);
  assert.match(workflow, /release:[\s\S]+needs:\s*prepare_release/);
  assert.ok(workflow.indexOf("Consume exact finalized cutover evidence") < workflow.indexOf("Run pre-role bootstrap"));
  assert.match(workflow, /PORTFOLIO_CUTOVER_EVIDENCE_RUN_ID/);
  assert.match(workflow, /PORTFOLIO_CUTOVER_EVIDENCE_SHA256/);
  assert.match(workflow, /portfolio-release-record/);
});

test("authority cutover binds evidence and disables rollback to a public writer", () => {
  const release = read(".github/scripts/deploy-cloud-run.sh");
  const evidence = read("src/scripts/release/cutover-evidence.ts");
  const record = read("src/scripts/release/release-record.ts");

  assert.match(evidence, /cutoverReady/);
  assert.match(evidence, /writeFence/);
  assert.match(evidence, /adminSnapshot/);
  assert.match(evidence, /careerCheckpoint/);
  assert.match(evidence, /migrationLedgerDigest/);
  assert.match(record, /runtimeBundleVersion/);
  assert.match(record, /deploymentBundleVersion/);
  assert.match(record, /legalAuditBundleVersion/);
  assert.match(record, /pubsubConfigurationGeneration/);
  assert.match(record, /cutoverEvidenceSha256/);
  assert.match(record, /edgeVersion/);
  assert.match(release, /PORTFOLIO_AUTHORITY_PHASE/);
  assert.match(release, /private-compatible/);
  assert.match(release, /automatic rollback is disabled/i);
});

test("audit context is fail-closed, request-wired, and emits only summaries", () => {
  const audit = read("src/backend/data/database-audit.ts");
  const backend = read("src/backend/index.ts");
  const migration = read("src/migrations/0016_database_audit_compensation.sql");

  assert.doesNotMatch(audit, /defaultAuditContext/);
  assert.match(audit, /Database audit context is required/);
  assert.match(audit, /auditSummarySink/);
  assert.match(audit, /database_audit_chain_summary/);
  assert.match(backend, /createDatabaseAuditContextMiddleware/);
  assert.match(backend, /createServiceDatabaseAuditContextMiddleware/);
  assert.match(migration, /database_audit_chain_summary/);
  assert.match(migration, /SET TimeZone = 'UTC'/i);
});

test("all database bundles bind the canonical project and CA fingerprint", () => {
  const tls = read("src/shared/postgres-tls.ts");
  const schema = read("config/secret-schema.prod.json");

  assert.match(tls, /qvbpgvazqfyhwjsfulsb/);
  assert.match(tls, /expectedCaSha256/);
  assert.match(tls, /fingerprint256/);
  assert.match(schema, /SUPABASE_CA_SHA256/);
  assert.match(schema, /DATABASE_ADMIN_URL/);
});

test("legal reusable identity mode is explicit and legacy copy remains bounded", () => {
  const legal = read(".github/workflows/legal-audit.yml");
  const deploy = read(".github/workflows/deploy.yml");
  const migration = read("src/scripts/legacy-data-migration.ts");

  assert.match(legal, /identity_mode/);
  assert.match(legal, /inputs\.identity_mode == 'reusable'/);
  assert.match(deploy, /identity_mode:\s*reusable/);
  assert.match(migration, /LEGACY_COPY_BATCH_SIZE/);
  assert.match(migration, /AsyncGenerator/);
  assert.doesNotMatch(migration, /result\.rows\.map\(\(row\) => row\.payload\)/);
  assert.equal(existsSync(path.resolve(root, "src/scripts/release/cutover-evidence.ts")), true);
});
