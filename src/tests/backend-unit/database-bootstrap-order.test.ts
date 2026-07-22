import assert from "node:assert/strict";
import test from "node:test";
import {
  connectWithSupabaseRetry,
  runDatabaseBootstrap,
  waitForCredentialPropagation,
  type DatabaseBootstrapDependencies,
} from "../../scripts/release/run-database-bootstrap-from-bundle";
import type { PortfolioDatabaseBootstrapBundle } from "../../scripts/release/database-bootstrap-config";

const urlWithCredentials = (role: string, password: string) => {
  const value = new URL("postgresql://db.example.test:5432/postgres");
  value.username = role;
  value.password = password;
  return value.toString();
};
const url = (role: string) => urlWithCredentials(role, `password-${role}`);
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
    async waitForLoginCredentials() { events.push("wait-for-login-propagation"); },
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
    "wait-for-login-propagation",
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
    SOURCE_FENCE_DATABASE_URL: urlWithCredentials(
      "portfolio_fence_login",
      "pre-generated/fence",
    ),
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
    async waitForLoginCredentials() {
      assert.equal(fencePasswordRotated, true);
      events.push("wait-for-login-propagation");
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

test("bootstrap waits through bounded Supabase password propagation before migrations", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  await waitForCredentialPropagation(
    "portfolio_migrator_login",
    async () => {
      attempts += 1;
      return attempts === 3;
    },
    async (milliseconds) => { sleeps.push(milliseconds); },
  );
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [5_000, 5_000]);
});

test("bootstrap retries only transient Supabase pooler connection failures", async () => {
  let attempts = 0;
  let closed = 0;
  const sleeps: number[] = [];
  const client = await connectWithSupabaseRetry(
    () => ({
      async connect() {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("connection refused"), { code: "08006" });
        if (attempts === 2) throw Object.assign(new Error("auth_query secret check timed out"), { code: "XX000" });
      },
      async end() { closed += 1; },
    }),
    async (milliseconds) => { sleeps.push(milliseconds); },
  );
  assert.equal(attempts, 3);
  assert.equal(closed, 2);
  assert.deepEqual(sleeps, [5_000, 5_000]);
  await client.end();
});

test("bootstrap fails immediately for non-transient credential errors", async () => {
  let attempts = 0;
  await assert.rejects(connectWithSupabaseRetry(
    () => ({
      async connect() {
        attempts += 1;
        throw Object.assign(new Error("password authentication failed"), { code: "28P01" });
      },
      async end() {},
    }),
    async () => assert.fail("non-transient failures must not sleep"),
  ), /password authentication failed/);
  assert.equal(attempts, 1);
});
