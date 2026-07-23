import assert from "node:assert/strict";
import test from "node:test";
import { probeDatabaseBootstrapBundle } from "../../scripts/release/probe-database-bootstrap-from-bundle";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

function bundle(): string {
  return JSON.stringify({
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
  });
}

test("Node pg bootstrap probe verifies admin and migrator identities", async () => {
  const roles = ["postgres", "portfolio_migrator_login"];
  const ended: string[] = [];
  const healthy = await probeDatabaseBootstrapBundle(bundle(), () => {
    const role = roles.shift();
    assert.ok(role);
    return {
      async connect() {},
      async query<T>() {
        return {
          rows: [{
            sessionUser: role,
            currentUser: role,
          }] as T[],
        };
      },
      async end() {
        ended.push(role);
      },
    };
  });

  assert.deepEqual(healthy, ["admin", "migrator"]);
  assert.deepEqual(ended, ["postgres", "portfolio_migrator_login"]);
});

test("Node pg bootstrap probe closes a mismatched session and fails closed", async () => {
  let ended = false;
  await assert.rejects(
    probeDatabaseBootstrapBundle(bundle(), () => ({
      async connect() {},
      async query<T>() {
        return {
          rows: [{
            sessionUser: "unexpected",
            currentUser: "unexpected",
          }] as T[],
        };
      },
      async end() {
        ended = true;
      },
    })),
    /identity mismatch/,
  );
  assert.equal(ended, true);
});
