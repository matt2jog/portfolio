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
  const legacyReader = read("infra/supabase/legacy-reader.sql");

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
  assert.doesNotMatch(pre, /^\s*CREATE\s+(?:TABLE|FUNCTION|VIEW)\b/im);
  assert.match(
    post,
    /CREATE TABLE IF NOT EXISTS portfolio_control\.portfolio_source_write_fence_control/,
  );
  assert.match(
    post,
    /CREATE OR REPLACE FUNCTION portfolio_control\.activate_portfolio_source_write_fence/,
  );
  assert.match(
    post,
    /SET ROLE portfolio_fence_owner;\s*GRANT USAGE, CREATE ON SCHEMA portfolio_control TO portfolio_fence_owner;[\s\S]*CREATE TABLE IF NOT EXISTS portfolio_control\.portfolio_source_write_fence_control[\s\S]*CREATE OR REPLACE FUNCTION portfolio_control\.commit_portfolio_source_write_fence[\s\S]*RESET ROLE;[\s\S]*DO \$triggers\$/,
  );
  assert.match(pre, /CREATE SCHEMA IF NOT EXISTS portfolio AUTHORIZATION portfolio_migrator/);
  assert.match(
    pre,
    /CREATE SCHEMA IF NOT EXISTS portfolio_control AUTHORIZATION portfolio_fence_owner/,
  );
  assert.match(
    pre,
    /GRANT portfolio_migrator, portfolio_audit_owner,\s*portfolio_compensation_operator, portfolio_fence_owner\s+TO postgres\s+WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;/,
  );
  assert.match(
    post,
    /REVOKE portfolio_migrator, portfolio_audit_owner,\s*portfolio_compensation_operator, portfolio_fence_owner\s+FROM postgres;[\s\S]*Fail closed unless LOGIN identities remain pure authenticators/,
  );
  const membershipInvariantEnd = post.indexOf(
    "RAISE EXCEPTION 'Portfolio capability role memberships are not exact'",
    post.indexOf("-- Fail closed unless LOGIN identities remain pure authenticators"),
  );
  const membershipInvariantStart = post.lastIndexOf("IF EXISTS (", membershipInvariantEnd);
  const membershipInvariant = post.slice(membershipInvariantStart, membershipInvariantEnd);
  assert.match(membershipInvariant, /grantor\.rolname = 'supabase_admin'/);
  assert.match(membershipInvariant, /member\.rolname = 'postgres'/);
  assert.match(membershipInvariant, /membership\.admin_option[\s\S]*NOT membership\.inherit_option[\s\S]*NOT membership\.set_option/);
  assert.match(membershipInvariant, /grantor\.rolname = 'postgres'[\s\S]*\) <> 7 OR/);
  assert.match(membershipInvariant, /\) NOT IN \(0, 8\) THEN/);
  assert.match(pre, /SET timezone TO 'UTC'/i);
  assert.match(post, /pg_default_acl/);
  assert.match(post, /aclexplode/);
  assert.match(post, /PUBLIC/);

  for (const reconciler of [pre, legacyReader]) {
    assert.doesNotMatch(
      reconciler,
      /^\s*ALTER\s+ROLE\b(?:(?!;)[\s\S])*\b(?:SUPERUSER|NOSUPERUSER|BYPASSRLS|NOBYPASSRLS|CREATEDB|NOCREATEDB|CREATEROLE|NOCREATEROLE|REPLICATION|NOREPLICATION)\b/im,
    );
    assert.match(reconciler, /FROM pg_catalog\.pg_roles/);
    assert.match(reconciler, /rolcanlogin/);
    assert.match(reconciler, /rolinherit/);
    assert.match(reconciler, /rolsuper/);
    assert.match(reconciler, /rolbypassrls/);
    assert.match(reconciler, /rolcreatedb/);
    assert.match(reconciler, /rolcreaterole/);
    assert.match(reconciler, /rolreplication/);
    assert.match(reconciler, /prohibited role attributes/);
    assert.match(reconciler, /cardinality\(alter_clauses\) > 0/);
    assert.match(reconciler, /'ALTER ROLE %I %s'/);
  }
});

test("database bootstrap preserves the managed Supabase pgvector installation", () => {
  const pre = read("infra/supabase/portfolio-pre-migration.sql");
  const post = read("infra/supabase/portfolio-role-acls.sql");
  const ledger = read("src/scripts/migration-ledger.ts");
  const vectorMigration = read("src/migrations/0004_keen_naoko.sql");

  for (const contract of [pre, post, ledger]) {
    assert.match(contract, /supabase_admin/);
    assert.match(contract, /public/);
  }
  assert.match(vectorMigration, /\bvector\(768\)/);
  assert.match(ledger, /portfolio, public, extensions, pg_temp/);
  assert.match(ledger, /pg_temp, public, extensions/);
  assert.doesNotMatch(`${pre}\n${post}\n${ledger}`, /ALTER EXTENSION vector SET SCHEMA|DROP EXTENSION vector/);
  assert.match(ledger, /managed Supabase pgvector contract/);
});

test("managed ACL reconciliation mutates only objects with explicit Portfolio grants", () => {
  const post = read("infra/supabase/portfolio-role-acls.sql");
  const start = post.indexOf("-- Strip only explicit grants held by Portfolio target roles");
  const end = post.indexOf("-- Table-level REVOKE does not remove column ACLs", start);
  const managedReconciliation = post.slice(start, end);

  assert.ok(start >= 0 && end > start, "managed-object reconciliation block must exist");
  assert.doesNotMatch(
    managedReconciliation,
    /ON ALL (?:TABLES|SEQUENCES|ROUTINES) IN SCHEMA %I/,
  );
  assert.match(managedReconciliation, /aclexplode\(namespace\.nspacl\)/);
  assert.match(managedReconciliation, /aclexplode\(object\.relacl\)/);
  assert.match(managedReconciliation, /aclexplode\(routine\.proacl\)/);
  assert.match(managedReconciliation, /aclexplode\(type\.typacl\)/);
  assert.match(managedReconciliation, /pg_get_function_identity_arguments\(routine\.oid\)/);
  assert.match(managedReconciliation, /privilege\.grantee IN \(/);
  for (const ownerBoundary of [
    /privilege\.grantee <> namespace\.nspowner/,
    /privilege\.grantee <> object\.relowner/,
    /privilege\.grantee <> routine\.proowner/,
    /privilege\.grantee <> type\.typowner/,
  ]) {
    assert.match(managedReconciliation, ownerBoundary);
  }
  assert.doesNotMatch(
    managedReconciliation,
    /FROM portfolio_runtime_login, portfolio_migrator_login/,
  );

  const managedRevokes = [
    ...managedReconciliation.matchAll(
      /'REVOKE ALL PRIVILEGES ON (?:SCHEMA|SEQUENCE|TABLE|ROUTINE|TYPE) [^']+'/g,
    ),
  ].map((match) => match[0]);
  assert.equal(managedRevokes.length, 5);
  for (const statement of managedRevokes) {
    assert.match(statement, / CASCADE'$/);
  }
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

test("bootstrap owns administrator reconciliation while deploy gates the migrator-only release", () => {
  const workflow = read(".github/workflows/deploy.yml");
  const bootstrap = read("src/scripts/release/run-database-bootstrap-from-bundle.ts");
  const databaseRelease = read("src/scripts/release/run-database-release-from-bundle.ts");

  assert.match(bootstrap, /portfolio-pre-migration\.sql/);
  assert.match(bootstrap, /runMigrationsFromBundle/);
  assert.match(bootstrap, /portfolio-role-acls\.sql/);
  assert.ok(
    bootstrap.indexOf("await actions.executeAdministratorSql(\"portfolio-pre-migration.sql\"")
      < bootstrap.indexOf("await actions.runMigrationsFromBundle"),
  );
  assert.ok(
    bootstrap.indexOf("await actions.runMigrationsFromBundle")
      < bootstrap.indexOf("await actions.executeAdministratorSql(\"portfolio-role-acls.sql\""),
  );
  assert.match(databaseRelease, /runMigrationsFromBundle/);
  assert.doesNotMatch(databaseRelease, /portfolio-pre-migration\.sql|portfolio-role-acls\.sql/);
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
