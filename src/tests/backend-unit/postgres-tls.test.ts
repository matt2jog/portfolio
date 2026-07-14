import assert from "node:assert/strict";
import test from "node:test";
import { postgresConnectionConfig } from "../../shared/postgres-tls";

const CA = "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----";

function testDatabaseUrl(host: string): string {
  const url = new URL(`postgresql://${host}/postgres`);
  url.username = "fixture-user";
  url.password = "fixture-password";
  return url.toString();
}

test("non-Supabase Postgres keeps its connection string and does not force a private CA", () => {
  assert.deepEqual(
    postgresConnectionConfig("postgresql://localhost:5432/portfolio", undefined),
    { connectionString: "postgresql://localhost:5432/portfolio", ssl: undefined },
  );
});

test("Supabase direct and pooler hosts require strict TLS with the supplied CA", () => {
  for (const databaseUrl of [
    `${testDatabaseUrl("db.project.supabase.co:5432")}?sslmode=require`,
    `${testDatabaseUrl("aws-0-us-east-1.pooler.supabase.com:6543")}?sslrootcert=ignored`,
  ]) {
    const config = postgresConnectionConfig(databaseUrl, CA.replace(/\n/g, "\\n"));
    assert.equal(config.ssl?.rejectUnauthorized, true);
    assert.equal(config.ssl?.ca, CA);
    assert.doesNotMatch(config.connectionString, /sslmode|sslrootcert/i);
  }
});

test("Supabase TLS fails closed when the CA is missing or malformed", () => {
  const databaseUrl = testDatabaseUrl("db.project.supabase.co:5432");
  assert.throws(() => postgresConnectionConfig(databaseUrl, undefined), /SUPABASE_CA_CERT/);
  assert.throws(() => postgresConnectionConfig(databaseUrl, "not-a-certificate"), /SUPABASE_CA_CERT/);
});
