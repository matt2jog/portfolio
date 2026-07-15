import assert from "node:assert/strict";
import test from "node:test";
import { parseLegalAuditBundle } from "../../scripts/legal/legal-audit-config";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

function validLegalAuditBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "legal_audit",
    },
    LEGAL_AUDIT_DATABASE_URL: testSupabaseDatabaseUrl("legal_audit_writer"),
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };
}

test("legal audit bundle exposes only its writer trust boundary", () => {
  const parsed = parseLegalAuditBundle(JSON.stringify(validLegalAuditBundle()));
  assert.equal(parsed.LEGAL_AUDIT_DATABASE_URL, testSupabaseDatabaseUrl("legal_audit_writer"));
  assert.equal(parsed.SUPABASE_CA_CERT, TEST_SUPABASE_CA_CERT);
  assert.equal(parsed.SUPABASE_PROJECT_REF, TEST_SUPABASE_PROJECT_REF);
});

test("legal audit bundle rejects deployment credentials and wrong metadata", () => {
  assert.throws(
    () => parseLegalAuditBundle(JSON.stringify({ ...validLegalAuditBundle(), CLOUDFLARE_API_TOKEN: "forbidden" })),
    /schema/,
  );
  const wrongBoundary = validLegalAuditBundle();
  wrongBoundary._meta.boundary = "deployment";
  assert.throws(() => parseLegalAuditBundle(JSON.stringify(wrongBoundary)), /metadata/);
});

test("legal audit bundle errors never echo secret values", () => {
  const marker = "do-not-echo-legal-secret";
  const invalid = { ...validLegalAuditBundle(), LEGAL_AUDIT_DATABASE_URL: marker, EXTRA: true };
  assert.throws(
    () => parseLegalAuditBundle(JSON.stringify(invalid)),
    (error: unknown) => error instanceof Error && !error.message.includes(marker),
  );
});

test("legal audit bundle rejects local, cross-project, and admin database URLs", () => {
  for (const databaseUrl of [
    "postgresql://legal_audit_writer:fixture@localhost:5432/portfolio",
    testSupabaseDatabaseUrl("legal_audit_writer", { projectRef: "otherprojectref00000" }),
    testSupabaseDatabaseUrl("postgres"),
  ]) {
    assert.throws(
      () => parseLegalAuditBundle(JSON.stringify({
        ...validLegalAuditBundle(),
        LEGAL_AUDIT_DATABASE_URL: databaseUrl,
      })),
      /LEGAL_AUDIT_DATABASE_URL|Supabase|project|role|username/i,
    );
  }
});
