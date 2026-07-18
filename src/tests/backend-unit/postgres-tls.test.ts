import assert from "node:assert/strict";
import test from "node:test";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../../shared/postgres-tls";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

function testDatabaseUrl(host: string): string {
  const url = new URL(`postgresql://${host}/postgres`);
  url.username = "fixture-user";
  url.password = "fixture-password";
  return url.toString();
}

test("non-Supabase Postgres keeps its connection string and does not force a private CA", () => {
  assert.deepEqual(
    postgresConnectionConfig("postgresql://localhost:5432/portfolio", undefined),
    { connectionString: "postgresql://localhost:5432/portfolio", ssl: undefined, options: "-c TimeZone=UTC" },
  );
  assert.throws(
    () => postgresConnectionConfig(
      "postgresql://localhost:5432/portfolio",
      undefined,
      "portfolio, extensions",
      undefined,
      "portfolio_runtime; RESET ROLE",
    ),
    /safe identifier/,
  );
});

test("Supabase direct and pooler hosts require strict TLS with the supplied CA", () => {
  for (const databaseUrl of [
    `${testDatabaseUrl("db.project.supabase.co:5432")}?sslmode=require`,
    `${testDatabaseUrl("aws-0-us-east-1.pooler.supabase.com:6543")}?sslrootcert=ignored`,
  ]) {
    const config = postgresConnectionConfig(
      databaseUrl,
      TEST_SUPABASE_CA_CERT.replace(/\n/g, "\\n"),
      undefined,
      TEST_SUPABASE_CA_SHA256,
    );
    assert.equal(config.ssl?.rejectUnauthorized, true);
    assert.equal(config.ssl?.ca, TEST_SUPABASE_CA_CERT);
    assert.doesNotMatch(config.connectionString, /sslmode|sslrootcert/i);
  }
});

test("Supabase TLS fails closed when the CA is missing or malformed", () => {
  const databaseUrl = testDatabaseUrl("db.project.supabase.co:5432");
  assert.throws(() => postgresConnectionConfig(databaseUrl, undefined), /SUPABASE_CA_CERT/);
  assert.throws(() => postgresConnectionConfig(databaseUrl, "not-a-certificate"), /SUPABASE_CA_CERT/);
});

test("production Supabase validation binds direct and pooler URLs to one project and role", () => {
  for (const databaseUrl of [
    testSupabaseDatabaseUrl("portfolio_runtime_login", { direct: true }),
    testSupabaseDatabaseUrl("portfolio_runtime_login"),
  ]) {
    const config = productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: TEST_SUPABASE_PROJECT_REF,
      supabaseCaCert: TEST_SUPABASE_CA_CERT,
      expectedCaSha256: TEST_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
      capabilityRole: "portfolio_runtime",
      searchPath: "portfolio, extensions",
    });
    assert.equal(config.ssl?.rejectUnauthorized, true);
    assert.equal(config.ssl?.ca, TEST_SUPABASE_CA_CERT);
    assert.doesNotMatch(config.connectionString, /sslmode|sslrootcert/i);
    assert.equal(
      config.options,
      "-c search_path=portfolio,extensions -c TimeZone=UTC",
    );
    assert.doesNotMatch(config.options ?? "", /(?:^|\s)-c\s+role=/);
  }
});

test("production Supabase validation rejects transaction mode, wrong database, and URL-owned options", () => {
  for (const databaseUrl of [
    testSupabaseDatabaseUrl("portfolio_runtime_login", { direct: true, port: 6543 }),
    testSupabaseDatabaseUrl("portfolio_runtime_login", { port: 6543 }),
    testSupabaseDatabaseUrl("portfolio_runtime_login").replace(/\/postgres$/, "/portfolio"),
    `${testSupabaseDatabaseUrl("portfolio_runtime_login")}?options=-c%20search_path%3Dpublic`,
    `${testSupabaseDatabaseUrl("portfolio_runtime_login")}?sslmode=require`,
  ]) {
    assert.throws(
      () => productionSupabaseConnectionConfig({
        databaseUrl,
        projectRef: TEST_SUPABASE_PROJECT_REF,
        supabaseCaCert: TEST_SUPABASE_CA_CERT,
        expectedCaSha256: TEST_SUPABASE_CA_SHA256,
        expectedRole: "portfolio_runtime_login",
        searchPath: "portfolio, extensions",
      }),
      /port 5432|database|query|option|TLS|ssl/i,
    );
  }
});

test("production Supabase validation rejects local, private, IP, .local, and arbitrary hosts", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "10.1.2.3",
    "172.16.1.2",
    "192.168.1.2",
    "database.internal",
    "database.local",
    "postgres.example.com",
    "supabase.com",
    "attacker.supabase.com",
    "db.otherprojectref00000.supabase.co",
  ]) {
    const url = testDatabaseUrl(host + ":5432");
    assert.throws(
      () => productionSupabaseConnectionConfig({
        databaseUrl: url,
        projectRef: TEST_SUPABASE_PROJECT_REF,
        supabaseCaCert: TEST_SUPABASE_CA_CERT,
        expectedCaSha256: TEST_SUPABASE_CA_SHA256,
        expectedRole: "portfolio_runtime_login",
      }),
      /Supabase|host|project/i,
      host,
    );
  }
});

test("production Supabase validation rejects a different pooler tenant, role, or invalid project ref", () => {
  assert.throws(
    () => productionSupabaseConnectionConfig({
      databaseUrl: testSupabaseDatabaseUrl("portfolio_runtime_login", { projectRef: "otherprojectref00000" }),
      projectRef: TEST_SUPABASE_PROJECT_REF,
      supabaseCaCert: TEST_SUPABASE_CA_CERT,
      expectedCaSha256: TEST_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
    }),
    /project|username/i,
  );
  assert.throws(
    () => productionSupabaseConnectionConfig({
      databaseUrl: testSupabaseDatabaseUrl("postgres"),
      projectRef: TEST_SUPABASE_PROJECT_REF,
      supabaseCaCert: TEST_SUPABASE_CA_CERT,
      expectedCaSha256: TEST_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
    }),
    /role|username/i,
  );
  assert.throws(
    () => productionSupabaseConnectionConfig({
      databaseUrl: testSupabaseDatabaseUrl("portfolio_runtime_login"),
      projectRef: "not-a-project-ref",
      supabaseCaCert: TEST_SUPABASE_CA_CERT,
      expectedCaSha256: TEST_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_runtime_login",
    }),
    /project.ref/i,
  );
});

test("production Supabase validation binds the migration URL to portfolio_migrator", () => {
  for (const databaseUrl of [
    testSupabaseDatabaseUrl("portfolio_migrator_login", { direct: true }),
    testSupabaseDatabaseUrl("portfolio_migrator_login"),
  ]) {
    assert.doesNotThrow(() => productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: TEST_SUPABASE_PROJECT_REF,
      supabaseCaCert: TEST_SUPABASE_CA_CERT,
      expectedCaSha256: TEST_SUPABASE_CA_SHA256,
      expectedRole: "portfolio_migrator_login",
      capabilityRole: "portfolio_migrator",
      searchPath: "portfolio, extensions",
    }));
  }
});
