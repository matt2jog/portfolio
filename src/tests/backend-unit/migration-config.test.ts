import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMigrationBundle,
  loadMigrationEnvironment,
} from "../../backend/migration-config";

function bundle() {
  return {
    MIGRATION_DATABASE_URL: "postgresql://portfolio_migrator_login:fixture@db.example/postgres",
    RUNTIME_DATABASE_URL: "postgresql://portfolio_runtime_login:fixture@db.example/postgres",
    SUPABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
    SUPABASE_CA_SHA256: "a".repeat(64),
    SUPABASE_PROJECT_REF: "qvbpgvazqfyhwjsfulsb",
  };
}

test("database bootstrap bundle installs only migration runtime fields", () => {
  const target: NodeJS.ProcessEnv = {};
  applyMigrationBundle(JSON.stringify(bundle()), target);
  assert.equal(target.DATABASE_URL, bundle().MIGRATION_DATABASE_URL);
  assert.equal(target.RUNTIME_DATABASE_URL, undefined);
  assert.equal(target.SUPABASE_PROJECT_REF, "qvbpgvazqfyhwjsfulsb");
});

test("database bootstrap bundle proves matching individual delivery before installation", () => {
  const matching: NodeJS.ProcessEnv = {
    DATABASE_URL: bundle().MIGRATION_DATABASE_URL,
    SUPABASE_CA_CERT: bundle().SUPABASE_CA_CERT,
  };
  assert.doesNotThrow(() => applyMigrationBundle(JSON.stringify(bundle()), matching));

  const sensitive = "different-individual-database-value";
  const mismatched: NodeJS.ProcessEnv = { DATABASE_URL: sensitive };
  assert.throws(
    () => applyMigrationBundle(JSON.stringify(bundle()), mismatched),
    (error: unknown) => error instanceof Error
      && /individual binding DATABASE_URL does not match/.test(error.message)
      && !error.message.includes(sensitive),
  );
});

test("migration bundle is removed before parsing and errors do not echo values", () => {
  const target: NodeJS.ProcessEnv = { PORTFOLIO_DATABASE_BOOTSTRAP_BUNDLE: "{" };
  assert.throws(() => loadMigrationEnvironment(target), /not valid JSON/);
  assert.equal(target.PORTFOLIO_DATABASE_BOOTSTRAP_BUNDLE, undefined);

  const sensitive = "do-not-echo-migration-secret";
  assert.throws(
    () => applyMigrationBundle(JSON.stringify({
      ...bundle(),
      MIGRATION_DATABASE_URL: "",
      EXTRA: sensitive,
    }), {}),
    (error: unknown) => error instanceof Error && !error.message.includes(sensitive),
  );
});
