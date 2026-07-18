import assert from "node:assert/strict";
import test from "node:test";
import {
  runDatabaseBootstrap,
  type DatabaseBootstrapDependencies,
} from "../../scripts/release/run-database-bootstrap-from-bundle";
import type { PortfolioDatabaseBootstrapBundle } from "../../scripts/release/database-bootstrap-config";

const url = (role: string) => `postgresql://${role}:password-${role}@db.example.test:5432/postgres`;
const bundle = {
  DATABASE_ADMIN_URL: url("postgres"),
  RUNTIME_DATABASE_URL: url("portfolio_runtime_login"),
  MIGRATION_DATABASE_URL: url("portfolio_migrator_login"),
  LEGAL_AUDIT_DATABASE_URL: url("portfolio_legal_login"),
  LEGACY_READER_DATABASE_URL: url("portfolio_legacy_reader_login"),
  SOURCE_FENCE_DATABASE_URL: url("portfolio_fence_login"),
  SUPABASE_CA_CERT: "unused",
  SUPABASE_CA_SHA256: "a".repeat(64),
  SUPABASE_PROJECT_REF: "qvbpgvazqfyhwjsfulsb",
} satisfies PortfolioDatabaseBootstrapBundle;

test("one-time bootstrap creates roles, rotates every login, migrates, reconciles ACLs, then proves all boundaries", async () => {
  const events: string[] = [];
  const dependencies: DatabaseBootstrapDependencies = {
    async executeAdministratorSql(filename) { events.push(filename); },
    async rotateLoginPassword(role, password) { events.push(`rotate:${role}:${password}`); },
    async runMigrationsFromBundle() { events.push("digest-pinned-migrations"); },
    async verifyScopedBoundaries() { events.push("verify-all-scoped-boundaries"); },
  };
  await runDatabaseBootstrap(
    bundle,
    `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${"b".repeat(64)}`,
    dependencies,
  );
  assert.deepEqual(events, [
    "portfolio-pre-migration.sql",
    "rotate:portfolio_runtime_login:password-portfolio_runtime_login",
    "rotate:portfolio_migrator_login:password-portfolio_migrator_login",
    "rotate:portfolio_legal_login:password-portfolio_legal_login",
    "rotate:portfolio_legacy_reader_login:password-portfolio_legacy_reader_login",
    "rotate:portfolio_fence_login:password-portfolio_fence_login",
    "digest-pinned-migrations",
    "portfolio-role-acls.sql",
    "verify-all-scoped-boundaries",
  ]);
});

test("a pre-generated source-fence URL is consumed only after its scoped role exists", async () => {
  const events: string[] = [];
  let rolesCreated = false;
  let fencePasswordRotated = false;
  const preGeneratedBundle = {
    ...bundle,
    SOURCE_FENCE_DATABASE_URL:
      "postgresql://portfolio_fence_login:pre%2Dgenerated%2Ffence@db.example.test:5432/postgres",
  };
  const dependencies: DatabaseBootstrapDependencies = {
    async executeAdministratorSql(filename) {
      events.push(filename);
      if (filename === "portfolio-pre-migration.sql") rolesCreated = true;
    },
    async rotateLoginPassword(role, password) {
      if (role !== "portfolio_fence_login") return;
      assert.equal(rolesCreated, true);
      assert.equal(password, "pre-generated/fence");
      fencePasswordRotated = true;
    },
    async runMigrationsFromBundle() {
      assert.equal(fencePasswordRotated, true);
    },
    async verifyScopedBoundaries(value) {
      assert.equal(fencePasswordRotated, true);
      assert.equal(
        new URL(value.SOURCE_FENCE_DATABASE_URL).username,
        "portfolio_fence_login",
      );
    },
  };

  await runDatabaseBootstrap(
    preGeneratedBundle,
    `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${"c".repeat(64)}`,
    dependencies,
  );
  assert.equal(events[0], "portfolio-pre-migration.sql");
  assert.equal(events.at(-1), "portfolio-role-acls.sql");
});
