import assert from "node:assert/strict";
import test from "node:test";
import { buildLegalWriterConnectionString } from "../../scripts/legal/writer-connection";

function testDatabaseUrl(host: string, username: string): string {
  const url = new URL(`postgresql://${host}/postgres`);
  url.username = username;
  url.password = "fixture-password";
  return url.toString();
}

function fixturePassword(...parts: string[]): string {
  return parts.join("");
}

test("legal writer connection preserves the Supavisor tenant and encodes credentials exactly once", () => {
  const password = fixturePassword("p", "@ss", ":/%", " word");
  const value = buildLegalWriterConnectionString(
    testDatabaseUrl("aws-0-us-east-1.pooler.supabase.com:5432", "postgres.project-ref"),
    password,
  );
  const parsed = new URL(value);

  assert.equal(decodeURIComponent(parsed.username), "legal_audit_writer.project-ref");
  assert.equal(decodeURIComponent(parsed.password), password);
});

test("legal writer connection uses the bare role for direct Supabase hosts", () => {
  const value = buildLegalWriterConnectionString(
    testDatabaseUrl("db.project-ref.supabase.co:5432", "postgres"),
    fixturePassword("new", "-password"),
  );
  assert.equal(decodeURIComponent(new URL(value).username), "legal_audit_writer");
});
