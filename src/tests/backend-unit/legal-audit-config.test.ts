import assert from "node:assert/strict";
import test from "node:test";
import { parseLegalAuditBundle } from "../../scripts/legal/legal-audit-config";

const SUPABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----";

function validLegalAuditBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "legal_audit",
    },
    DATABASE_URL: "postgresql://localhost:5432/portfolio",
    LEGAL_AUDIT_WRITE_ROLE_PASSWORD: "legal-writer-fixture",
    SUPABASE_CA_CERT,
  };
}

test("legal audit bundle exposes only its writer trust boundary", () => {
  const parsed = parseLegalAuditBundle(JSON.stringify(validLegalAuditBundle()));
  assert.equal(parsed.DATABASE_URL, "postgresql://localhost:5432/portfolio");
  assert.equal(parsed.LEGAL_AUDIT_WRITE_ROLE_PASSWORD, "legal-writer-fixture");
  assert.equal(parsed.SUPABASE_CA_CERT, SUPABASE_CA_CERT);
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
  const invalid = { ...validLegalAuditBundle(), LEGAL_AUDIT_WRITE_ROLE_PASSWORD: marker, EXTRA: true };
  assert.throws(
    () => parseLegalAuditBundle(JSON.stringify(invalid)),
    (error: unknown) => error instanceof Error && !error.message.includes(marker),
  );
});
