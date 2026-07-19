import assert from "node:assert/strict";
import test from "node:test";
import { parseDatabaseBootstrapBundle } from "../../scripts/release/database-bootstrap-config";
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
      boundary: "database_bootstrap",
    },
    DATABASE_ADMIN_URL: testSupabaseDatabaseUrl("postgres"),
    RUNTIME_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_runtime_login"),
    MIGRATION_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_migrator_login"),
    LEGAL_AUDIT_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_legal_login"),
    LEGACY_READER_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_legacy_reader_login"),
    SOURCE_FENCE_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_fence_login"),
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };
}

test("database bootstrap is the only typed boundary containing admin plus every scoped login", () => {
  const parsed = parseDatabaseBootstrapBundle(JSON.stringify(validBundle()));
  assert.deepEqual(Object.keys(parsed).sort(), [
    "DATABASE_ADMIN_URL",
    "LEGACY_READER_DATABASE_URL",
    "LEGAL_AUDIT_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "RUNTIME_DATABASE_URL",
    "SOURCE_FENCE_DATABASE_URL",
    "SUPABASE_CA_CERT",
    "SUPABASE_CA_SHA256",
    "SUPABASE_PROJECT_REF",
  ]);
});

test("database bootstrap rejects missing, extra, cross-project, and wrong-role URLs without echoing credentials", () => {
  const wrongRole = validBundle();
  wrongRole.SOURCE_FENCE_DATABASE_URL = testSupabaseDatabaseUrl("postgres");
  const wrongProject = validBundle();
  wrongProject.RUNTIME_DATABASE_URL = testSupabaseDatabaseUrl("portfolio_runtime_login", {
    projectRef: "zyxwvutsrqponmlkjihg",
  });
  const marker = "do-not-echo-bootstrap-secret";
  for (const value of [
    { ...validBundle(), EXTRA: "forbidden" },
    { ...validBundle(), DATABASE_ADMIN_URL: marker },
    wrongRole,
    wrongProject,
  ]) {
    assert.throws(
      () => parseDatabaseBootstrapBundle(JSON.stringify(value)),
      (error: unknown) => error instanceof Error && !error.message.includes(marker),
    );
  }
});
