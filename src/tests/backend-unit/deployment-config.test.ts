import assert from "node:assert/strict";
import test from "node:test";
import { parseDeploymentBundle } from "../../scripts/release/deployment-config";

const CLOUDFLARE_TOKEN = `cloudflare-${"x".repeat(24)}`;
const EDGE_TOKEN = `edge-${"x".repeat(35)}`;
const PREVIOUS_EDGE_TOKEN = `edge-${"p".repeat(35)}`;
const SUPABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----";

function validDeploymentBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "deployment",
    },
    CLOUDFLARE_API_TOKEN: CLOUDFLARE_TOKEN,
    DATABASE_URL: "postgresql://localhost:5432/portfolio",
    EDGE_ORIGIN_TOKEN: EDGE_TOKEN,
    EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN,
    SUPABASE_CA_CERT,
  };
}

test("deployment bundle accepts only the typed Portfolio deployment boundary", () => {
  const parsed = parseDeploymentBundle(JSON.stringify(validDeploymentBundle()));
  assert.equal(parsed.CLOUDFLARE_API_TOKEN, CLOUDFLARE_TOKEN);
  assert.equal(parsed.DATABASE_URL, "postgresql://localhost:5432/portfolio");
  assert.equal(parsed.EDGE_ORIGIN_TOKEN, EDGE_TOKEN);
  assert.equal(parsed.EDGE_ORIGIN_PREVIOUS_TOKEN, PREVIOUS_EDGE_TOKEN);
  assert.equal(parsed.SUPABASE_CA_CERT, SUPABASE_CA_CERT);
});

test("deployment bundle permits omitting the previous edge credential after rotation", () => {
  const bundle = validDeploymentBundle();
  delete (bundle as Partial<typeof bundle>).EDGE_ORIGIN_PREVIOUS_TOKEN;
  const parsed = parseDeploymentBundle(JSON.stringify(bundle));

  assert.equal(parsed.EDGE_ORIGIN_PREVIOUS_TOKEN, undefined);
});

test("deployment bundle rejects missing, unexpected, malformed, and wrong-boundary values", () => {
  const missing = validDeploymentBundle();
  delete (missing as Partial<typeof missing>).DATABASE_URL;
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

test("deployment bundle enforces token length and database URI types", () => {
  const shortCloudflareToken = { ...validDeploymentBundle(), CLOUDFLARE_API_TOKEN: "short" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(shortCloudflareToken)), /CLOUDFLARE_API_TOKEN/);

  const invalidDatabase = { ...validDeploymentBundle(), DATABASE_URL: "not-a-database-uri" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(invalidDatabase)), /DATABASE_URL/);

  const invalidCa = { ...validDeploymentBundle(), SUPABASE_CA_CERT: "not-a-certificate" };
  assert.throws(() => parseDeploymentBundle(JSON.stringify(invalidCa)), /SUPABASE_CA_CERT/);
});
