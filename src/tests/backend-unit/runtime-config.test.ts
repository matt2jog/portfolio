import assert from "node:assert/strict";
import test from "node:test";
import { applyRuntimeBundle } from "../../backend/runtime-config";

const EDGE_TOKEN = `edge-${"x".repeat(35)}`;
const PREVIOUS_EDGE_TOKEN = `edge-${"p".repeat(35)}`;

function validRuntimeBundle() {
  return {
    _meta: {
      schema_version: 1,
      service: "portfolio",
      environment: "prod",
      boundary: "runtime",
    },
    ADMIN_AUTHORITY_URL: "https://admin.2jog.dev",
    ADMIN_IDENTITY_AUDIENCE: "2jog-services",
    ADMIN_IDENTITY_ISSUER: "https://admin.2jog.dev",
    ADMIN_IDENTITY_JWKS_URL: "https://admin.2jog.dev/.well-known/jwks.json",
    DATABASE_URL: "postgresql://localhost:5432/portfolio",
    EDGE_ORIGIN_TOKEN: EDGE_TOKEN,
    EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN,
    FIREWORKS_AI_TOKEN: ["fireworks", "fixture"].join("-"),
    GRADIENT_AI_TOKEN: ["gradient", "fixture"].join("-"),
    SUPABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
  };
}

test("runtime bundle validates its boundary and installs only schema-owned keys", () => {
  const target: NodeJS.ProcessEnv = { DATABASE_URL: "stale-value" };
  applyRuntimeBundle(JSON.stringify(validRuntimeBundle()), target);

  assert.equal(target.DATABASE_URL, "postgresql://localhost:5432/portfolio");
  assert.equal(target.ADMIN_IDENTITY_AUDIENCE, "2jog-services");
  assert.equal(target.EDGE_ORIGIN_TOKEN, EDGE_TOKEN);
  assert.equal(target.EDGE_ORIGIN_PREVIOUS_TOKEN, PREVIOUS_EDGE_TOKEN);
  assert.equal(target.PORT, undefined);
});

test("runtime bundle clears a stale previous edge credential when rotation is complete", () => {
  const bundle = validRuntimeBundle();
  delete (bundle as Partial<typeof bundle>).EDGE_ORIGIN_PREVIOUS_TOKEN;
  const target: NodeJS.ProcessEnv = { EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN };

  applyRuntimeBundle(JSON.stringify(bundle), target);

  assert.equal(target.EDGE_ORIGIN_PREVIOUS_TOKEN, undefined);
});

test("runtime bundle rejects missing fields, wrong metadata, and unexpected keys", () => {
  const missing = validRuntimeBundle();
  delete (missing as Partial<typeof missing>).DATABASE_URL;
  assert.throws(() => applyRuntimeBundle(JSON.stringify(missing), {}), /DATABASE_URL/);

  const wrongBoundary = validRuntimeBundle();
  wrongBoundary._meta.boundary = "deployment";
  assert.throws(() => applyRuntimeBundle(JSON.stringify(wrongBoundary), {}), /metadata/);

  const unexpectedMetadata = validRuntimeBundle();
  Object.assign(unexpectedMetadata._meta, { extra: "forbidden" });
  assert.throws(() => applyRuntimeBundle(JSON.stringify(unexpectedMetadata), {}), /metadata/);

  const unexpected = { ...validRuntimeBundle(), HS256_SHARED_SECRET: "forbidden" };
  assert.throws(() => applyRuntimeBundle(JSON.stringify(unexpected), {}), /unexpected/i);
});

test("runtime bundle parse errors never include secret values", () => {
  const sensitiveMarker = ["do", "not", "echo", "runtime", "fixture", "123456789"].join("-");
  const bundle = { ...validRuntimeBundle(), EDGE_ORIGIN_TOKEN: sensitiveMarker, EXTRA: "nope" };

  assert.throws(
    () => applyRuntimeBundle(JSON.stringify(bundle), {}),
    (error: unknown) => error instanceof Error && !error.message.includes(sensitiveMarker),
  );
});

test("runtime bundle rejects malformed, non-object, legacy-session, and short-edge payloads", () => {
  assert.throws(() => applyRuntimeBundle("{", {}), /not valid JSON/);
  assert.throws(() => applyRuntimeBundle("[]", {}), /JSON object/);

  const legacySession = { ...validRuntimeBundle(), SESSION_SECRET: "legacy-secret" };
  assert.throws(() => applyRuntimeBundle(JSON.stringify(legacySession), {}), /unexpected/i);

  const shortEdgeToken = validRuntimeBundle();
  shortEdgeToken.EDGE_ORIGIN_TOKEN = "too-short";
  assert.throws(() => applyRuntimeBundle(JSON.stringify(shortEdgeToken), {}), /EDGE_ORIGIN_TOKEN/);
});

test("runtime bundle enforces the shared auth contract and typed URI/PEM fields", () => {
  for (const [key, value] of [
    ["ADMIN_AUTHORITY_URL", "http://admin.2jog.dev"],
    ["ADMIN_IDENTITY_ISSUER", "https://attacker.example"],
    ["ADMIN_IDENTITY_AUDIENCE", "wrong-audience"],
    ["ADMIN_IDENTITY_JWKS_URL", "https://admin.2jog.dev/not-jwks"],
    ["DATABASE_URL", "not-a-database-uri"],
    ["SUPABASE_CA_CERT", "not-a-pem-certificate"],
  ] as const) {
    const bundle = { ...validRuntimeBundle(), [key]: value };
    assert.throws(() => applyRuntimeBundle(JSON.stringify(bundle), {}), new RegExp(key), key);
  }
});

test("runtime bundle rejects dormant or paid-provider credentials", () => {
  for (const key of [
    "APIFY_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "KAFKA_BOOTSTRAP_SERVERS",
    "KAFKA_CA_CERT",
    "KAFKA_SASL_PASSWORD",
    "KAFKA_SASL_USERNAME",
  ]) {
    const bundle = { ...validRuntimeBundle(), [key]: "must-not-be-delivered" };
    assert.throws(() => applyRuntimeBundle(JSON.stringify(bundle), {}), /unexpected/i, key);
  }
});
