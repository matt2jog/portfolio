import assert from "node:assert/strict";
import test from "node:test";
import { parseDeploymentBundle } from "../../scripts/release/deployment-config";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

const CLOUDFLARE_TOKEN = `cloudflare-${"x".repeat(24)}`;
const EDGE_TOKEN = `edge-${"x".repeat(35)}`;
const PREVIOUS_EDGE_TOKEN = `edge-${"p".repeat(35)}`;
function validDeploymentBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "deployment",
    },
    CLOUDFLARE_API_TOKEN: CLOUDFLARE_TOKEN,
    MIGRATION_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_migrator_login", { direct: true }),
    SOURCE_FENCE_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_fence_login", { direct: true }),
    EDGE_ORIGIN_TOKEN: EDGE_TOKEN,
    EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN,
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };
}

test("deployment bundle accepts only the typed Portfolio deployment boundary", () => {
  const parsed = parseDeploymentBundle(JSON.stringify(validDeploymentBundle()));
  assert.equal(parsed.CLOUDFLARE_API_TOKEN, CLOUDFLARE_TOKEN);
  assert.equal(
    parsed.MIGRATION_DATABASE_URL,
    testSupabaseDatabaseUrl("portfolio_migrator_login", { direct: true }),
  );
  assert.equal(
    parsed.SOURCE_FENCE_DATABASE_URL,
    testSupabaseDatabaseUrl("portfolio_fence_login", { direct: true }),
  );
  assert.equal(parsed.EDGE_ORIGIN_TOKEN, EDGE_TOKEN);
  assert.equal(parsed.EDGE_ORIGIN_PREVIOUS_TOKEN, PREVIOUS_EDGE_TOKEN);
  assert.equal(parsed.SUPABASE_CA_CERT, TEST_SUPABASE_CA_CERT);
  assert.equal(parsed.SUPABASE_CA_SHA256, TEST_SUPABASE_CA_SHA256);
  assert.equal(parsed.SUPABASE_PROJECT_REF, TEST_SUPABASE_PROJECT_REF);
});

test("deployment bundle permits omitting the previous edge credential after rotation", () => {
  const bundle = validDeploymentBundle();
  delete (bundle as Partial<typeof bundle>).EDGE_ORIGIN_PREVIOUS_TOKEN;
  const parsed = parseDeploymentBundle(JSON.stringify(bundle));

  assert.equal(parsed.EDGE_ORIGIN_PREVIOUS_TOKEN, undefined);
});

test("deployment bundle rejects missing, unexpected, malformed, and wrong-boundary values", () => {
  const missing = validDeploymentBundle();
  delete (missing as Partial<typeof missing>).MIGRATION_DATABASE_URL;
  assert.throws(() => parseDeploymentBundle(JSON.stringify(missing)), /schema/);

  const unexpected = { ...validDeploymentBundle(), HS256_SHARED_SECRET: "forbidden" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(unexpected)), /schema/);

  const unexpectedMetadata = validDeploymentBundle();
  Object.assign(unexpectedMetadata._meta, { extra: "forbidden" });
  assert.throws(() => parseDeploymentBundle(JSON.stringify(unexpectedMetadata)), /metadata/);

  const wrongBoundary = validDeploymentBundle();
  wrongBoundary._meta.boundary = "runtime";
  assert.throws(() => parseDeploymentBundle(JSON.stringify(wrongBoundary)), /metadata/);

  assert.throws(() => parseDeploymentBundle("{"), /not valid JSON/);
  assert.throws(() => parseDeploymentBundle("[]"), /JSON object/);
});

test("deployment bundle errors never contain secret values", () => {
  const marker = ["do", "not", "echo", "deployment", "fixture"].join("-");
  const invalid = { ...validDeploymentBundle(), EDGE_ORIGIN_TOKEN: marker, EXTRA: true };
  assert.throws(
    () => parseDeploymentBundle(JSON.stringify(invalid)),
    (error: unknown) => error instanceof Error && !error.message.includes(marker),
  );
});

test("deployment bundle enforces token length and the scoped Supabase migration URL", () => {
  const shortCloudflareToken = { ...validDeploymentBundle(), CLOUDFLARE_API_TOKEN: "short" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(shortCloudflareToken)), /CLOUDFLARE_API_TOKEN/);

  const invalidDatabase = { ...validDeploymentBundle(), MIGRATION_DATABASE_URL: "not-a-database-uri" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(invalidDatabase)), /MIGRATION_DATABASE_URL/);

  const localDatabase = {
    ...validDeploymentBundle(),
    MIGRATION_DATABASE_URL: "postgresql://portfolio_migration:fixture@localhost:5432/portfolio",
  };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(localDatabase)), /MIGRATION_DATABASE_URL|Supabase/i);

  const crossProjectDatabase = {
    ...validDeploymentBundle(),
    MIGRATION_DATABASE_URL: testSupabaseDatabaseUrl("portfolio_migrator_login", {
      direct: true,
      projectRef: "otherprojectref00000",
    }),
  };
  assert.throws(
    () => parseDeploymentBundle(JSON.stringify(crossProjectDatabase)),
    /MIGRATION_DATABASE_URL|Supabase|project/i,
  );

  const adminDatabase = {
    ...validDeploymentBundle(),
    MIGRATION_DATABASE_URL: testSupabaseDatabaseUrl("postgres", { direct: true }),
  };
  assert.throws(
    () => parseDeploymentBundle(JSON.stringify(adminDatabase)),
    /MIGRATION_DATABASE_URL|role|username/i,
  );

  const invalidCa = { ...validDeploymentBundle(), SUPABASE_CA_CERT: "not-a-certificate" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(invalidCa)), /SUPABASE_CA_CERT/);
});
