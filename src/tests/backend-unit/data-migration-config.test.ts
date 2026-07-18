import assert from "node:assert/strict";
import test from "node:test";
import { parseDataMigrationBundle } from "../../scripts/release/data-migration-config";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

function validBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "data_migration",
    },
    LEGACY_PORTFOLIO_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_legacy_reader_login"),
    LEGACY_PORTFOLIO_SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    LEGACY_PORTFOLIO_SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
    SOURCE_FENCE_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_fence_login"),
    TARGET_PORTFOLIO_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_migrator_login"),
    TARGET_PORTFOLIO_SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    TARGET_PORTFOLIO_SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    TARGET_PORTFOLIO_SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };
}

test("data-migration bundle isolates the legacy reader from the private target migrator", () => {
  const parsed = parseDataMigrationBundle(JSON.stringify(validBundle()));
  assert.equal(parsed.LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF, TEST_SUPABASE_PROJECT_REF);
  assert.equal(parsed.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF, TEST_SUPABASE_PROJECT_REF);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "LEGACY_PORTFOLIO_DATABASE_URL",
    "LEGACY_PORTFOLIO_SUPABASE_CA_CERT",
    "LEGACY_PORTFOLIO_SUPABASE_CA_SHA256",
    "LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF",
    "SOURCE_FENCE_DATABASE_URL",
    "TARGET_PORTFOLIO_DATABASE_URL",
    "TARGET_PORTFOLIO_SUPABASE_CA_CERT",
    "TARGET_PORTFOLIO_SUPABASE_CA_SHA256",
    "TARGET_PORTFOLIO_SUPABASE_PROJECT_REF",
  ]);
  assert.equal("_meta" in parsed, false);
});

test("data-migration bundle rejects wrong metadata, extras, roles, and cross-project copies", () => {
  const wrongMetadata = validBundle();
  wrongMetadata._meta.boundary = "deployment";
  const crossProject = validBundle();
  crossProject.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF = "zyxwvutsrqponmlkjihg";
  crossProject.TARGET_PORTFOLIO_DATABASE_URL = testSupabaseDatabaseUrl("portfolio_migrator", {
    projectRef: crossProject.TARGET_PORTFOLIO_SUPABASE_PROJECT_REF,
  });
  const wrongReader = validBundle();
  wrongReader.LEGACY_PORTFOLIO_DATABASE_URL = testSupabaseDatabaseUrl("postgres");
  for (const value of [
    wrongMetadata,
    { ...validBundle(), EXTRA: "forbidden" },
    crossProject,
    wrongReader,
  ]) {
    assert.throws(() => parseDataMigrationBundle(JSON.stringify(value)), /data-migration|source|target|scoped|schema/i);
  }
});

test("data-migration bundle rejects mismatched CA material inside the shared project", () => {
  const mismatchedCa = validBundle();
  mismatchedCa.TARGET_PORTFOLIO_SUPABASE_CA_CERT = `${TEST_SUPABASE_CA_CERT}\n`;
  assert.throws(
    () => parseDataMigrationBundle(JSON.stringify(mismatchedCa)),
    /shared|certificate|data-migration/i,
  );
});

test("data-migration validation errors never echo credentials", () => {
  const marker = "do-not-echo-migration-secret";
  const invalid = { ...validBundle(), LEGACY_PORTFOLIO_DATABASE_URL: marker };
  assert.throws(
    () => parseDataMigrationBundle(JSON.stringify(invalid)),
    (error: unknown) => error instanceof Error && !error.message.includes(marker),
  );
});
