import assert from "node:assert/strict";
import test from "node:test";
import { applyRuntimeBundle, loadRuntimeEnvironment } from "../../backend/runtime-config";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

const EDGE_TOKEN = `edge-${"x".repeat(35)}`;
const PREVIOUS_EDGE_TOKEN = `edge-${"p".repeat(35)}`;

function validRuntimeBundle() {
  return {
    ADMIN_AUTHORITY_URL: "https://admin.2jog.dev",
    ADMIN_IDENTITY_AUDIENCE: "2jog-services",
    ADMIN_IDENTITY_ISSUER: "https://admin.2jog.dev",
    ADMIN_IDENTITY_JWKS_URL: "https://admin.2jog.dev/.well-known/jwks.json",
    DATABASE_URL: testSupabaseDatabaseUrl("portfolio_runtime_login"),
    EDGE_ORIGIN_TOKEN: EDGE_TOKEN,
    EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN,
    FIREWORKS_AI_TOKEN: ["fireworks", "fixture"].join("-"),
    GRADIENT_AI_TOKEN: ["gradient", "fixture"].join("-"),
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };
}

test("runtime bundle installs only the fields the application uses", () => {
  const target: NodeJS.ProcessEnv = { GITHUB_USERNAME: "matt2jog" };
  applyRuntimeBundle(JSON.stringify(validRuntimeBundle()), target);

  assert.equal(target.DATABASE_URL, testSupabaseDatabaseUrl("portfolio_runtime_login"));
  assert.equal(target.ADMIN_IDENTITY_AUDIENCE, "2jog-services");
  assert.equal(target.EDGE_ORIGIN_TOKEN, EDGE_TOKEN);
  assert.equal(target.EDGE_ORIGIN_PREVIOUS_TOKEN, PREVIOUS_EDGE_TOKEN);
  assert.equal(target.GITHUB_USERNAME, "matt2jog");
  assert.equal(target.GITHUB_TOKEN, undefined);
  assert.equal(target.PORT, undefined);
});

test("runtime bundle accepts matching individual delivery and rejects mismatches without echoing values", () => {
  const bundle = validRuntimeBundle();
  const matching: NodeJS.ProcessEnv = {
    GITHUB_USERNAME: "matt2jog",
    DATABASE_URL: bundle.DATABASE_URL,
    FIREWORKS_AI_TOKEN: bundle.FIREWORKS_AI_TOKEN,
    SUPABASE_CA_CERT: bundle.SUPABASE_CA_CERT,
  };
  assert.doesNotThrow(() => applyRuntimeBundle(JSON.stringify(bundle), matching));

  const sensitiveMarker = "different-individual-gradient-value";
  const mismatched: NodeJS.ProcessEnv = {
    GITHUB_USERNAME: "matt2jog",
    GRADIENT_AI_TOKEN: sensitiveMarker,
  };
  assert.throws(
    () => applyRuntimeBundle(JSON.stringify(bundle), mismatched),
    (error: unknown) => error instanceof Error
      && /individual binding GRADIENT_AI_TOKEN does not match/.test(error.message)
      && !error.message.includes(sensitiveMarker),
  );
});

test("staging accepts a complete individual database boundary without a legacy bundle", () => {
  const target: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    DEPLOYMENT_STAGE: "staging",
    DATABASE_URL: testSupabaseDatabaseUrl("portfolio_staging_runtime_login"),
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
  };

  assert.doesNotThrow(() => loadRuntimeEnvironment(target));
  assert.throws(
    () => loadRuntimeEnvironment({
      ...target,
      DATABASE_URL: testSupabaseDatabaseUrl("portfolio_runtime_login"),
    }),
    /scoped Supabase runtime role/,
  );
});

test("runtime bundle clears a stale previous edge credential when rotation is complete", () => {
  const bundle = validRuntimeBundle();
  delete (bundle as Partial<typeof bundle>).EDGE_ORIGIN_PREVIOUS_TOKEN;
  const target: NodeJS.ProcessEnv = {
    EDGE_ORIGIN_PREVIOUS_TOKEN: PREVIOUS_EDGE_TOKEN,
    GITHUB_USERNAME: "matt2jog",
  };

  applyRuntimeBundle(JSON.stringify(bundle), target);

  assert.equal(target.EDGE_ORIGIN_PREVIOUS_TOKEN, undefined);
});

test("runtime bundle rejects missing fields and ignores unrelated fields", () => {
  const missing = validRuntimeBundle();
  delete (missing as Partial<typeof missing>).DATABASE_URL;
  assert.throws(() => applyRuntimeBundle(JSON.stringify(missing), {}), /DATABASE_URL/);

  const target: NodeJS.ProcessEnv = { GITHUB_USERNAME: "matt2jog" };
  applyRuntimeBundle(
    JSON.stringify({ ...validRuntimeBundle(), UNUSED_TRANSITION_FIELD: "ignored" }),
    target,
  );
  assert.equal(target.UNUSED_TRANSITION_FIELD, undefined);
});

test("runtime bundle accepts a matching token and preserves individual secret delivery", () => {
  const withToken = { ...validRuntimeBundle(), GITHUB_TOKEN: "read-only-fixture" };
  const target: NodeJS.ProcessEnv = {
    GITHUB_USERNAME: "matt2jog",
    GITHUB_TOKEN: "read-only-fixture",
  };
  applyRuntimeBundle(JSON.stringify(withToken), target);
  assert.equal(target.GITHUB_TOKEN, "read-only-fixture");

  applyRuntimeBundle(JSON.stringify(validRuntimeBundle()), target);
  assert.equal(target.GITHUB_TOKEN, "read-only-fixture");

  assert.throws(
    () => applyRuntimeBundle(
      JSON.stringify({ ...validRuntimeBundle(), GITHUB_TOKEN: "different-token" }),
      target,
    ),
    /must match during cutover/,
  );
});

test("runtime requires the non-secret GitHub username outside the secret bundle", () => {
  assert.throws(
    () => applyRuntimeBundle(JSON.stringify(validRuntimeBundle()), {}),
    /GITHUB_USERNAME/,
  );
});
test("runtime bundle parse errors never include secret values", () => {
  const sensitiveMarker = ["do", "not", "echo", "runtime", "fixture", "123456789"].join("-");
  const bundle = { ...validRuntimeBundle(), DATABASE_URL: sensitiveMarker };

  assert.throws(
    () => applyRuntimeBundle(JSON.stringify(bundle), {}),
    (error: unknown) => error instanceof Error && !error.message.includes(sensitiveMarker),
  );
});

test("runtime bundle JSON is removed from the environment before validation", () => {
  const target: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PORTFOLIO_RUNTIME_BUNDLE: "{",
  };
  assert.throws(() => loadRuntimeEnvironment(target), /not valid JSON/);
  assert.equal(target.PORTFOLIO_RUNTIME_BUNDLE, undefined);
});

test("runtime bundle rejects malformed, non-object, and short-edge payloads", () => {
  assert.throws(() => applyRuntimeBundle("{", {}), /not valid JSON/);
  assert.throws(() => applyRuntimeBundle("[]", {}), /JSON object/);

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
    ["SUPABASE_CA_SHA256", "not-a-fingerprint"],
    ["SUPABASE_PROJECT_REF", "not-a-project-ref"],
  ] as const) {
    const bundle = { ...validRuntimeBundle(), [key]: value };
    assert.throws(() => applyRuntimeBundle(JSON.stringify(bundle), {}), new RegExp(key), key);
  }
});

test("runtime production bundle rejects non-Supabase and privileged database sessions", () => {
  for (const databaseUrl of [
    "postgresql://portfolio_runtime:fixture@localhost:5432/portfolio",
    "postgresql://portfolio_runtime:fixture@127.0.0.1:5432/portfolio",
    testSupabaseDatabaseUrl("postgres"),
  ]) {
    assert.throws(
      () => applyRuntimeBundle(JSON.stringify({ ...validRuntimeBundle(), DATABASE_URL: databaseUrl }), {}),
      /DATABASE_URL|Supabase|role|username/i,
      databaseUrl,
    );
  }
});
