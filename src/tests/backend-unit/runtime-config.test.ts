import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeEnvironment,
  validateRuntimeEnvironment,
} from "../../backend/runtime-config";
import {
  TEST_SUPABASE_CA_CERT,
  TEST_SUPABASE_CA_SHA256,
  TEST_SUPABASE_PROJECT_REF,
  testSupabaseDatabaseUrl,
} from "../support/supabase";

function runtimeEnvironment(
  stage: "production" | "staging" = "production",
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_STAGE: stage,
    DATABASE_URL: testSupabaseDatabaseUrl(
      stage === "production" ? "portfolio_runtime_login" : "portfolio_staging_runtime_login",
    ),
    SUPABASE_CA_CERT: TEST_SUPABASE_CA_CERT,
    SUPABASE_CA_SHA256: TEST_SUPABASE_CA_SHA256,
    SUPABASE_PROJECT_REF: TEST_SUPABASE_PROJECT_REF,
    GITHUB_USERNAME: "matt2jog",
    GITHUB_TOKEN: "read-only-fixture",
    GRADIENT_AI_TOKEN: "gradient-fixture",
    FIREWORKS_AI_TOKEN: "fireworks-fixture",
  };
}

test("production validates individual runtime bindings without mutating them", () => {
  const target = runtimeEnvironment();
  const snapshot = { ...target };
  assert.doesNotThrow(() => loadRuntimeEnvironment(target));
  assert.deepEqual(target, snapshot);
});

test("staging requires its isolated runtime role", () => {
  const staging = runtimeEnvironment("staging");
  assert.doesNotThrow(() => validateRuntimeEnvironment(staging));
  assert.throws(
    () => validateRuntimeEnvironment({
      ...staging,
      DATABASE_URL: testSupabaseDatabaseUrl("portfolio_runtime_login"),
    }),
    /scoped Supabase runtime role/,
  );
});

test("production rejects missing or privileged database bindings", () => {
  for (const databaseUrl of [
    undefined,
    "postgresql://portfolio_runtime:fixture@localhost:5432/portfolio",
    testSupabaseDatabaseUrl("postgres"),
  ]) {
    assert.throws(
      () => validateRuntimeEnvironment({ ...runtimeEnvironment(), DATABASE_URL: databaseUrl }),
      /DATABASE_URL|Supabase|role|username/i,
    );
  }
});

test("GitHub activity configuration is explicit and an optional token cannot be empty", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ ...runtimeEnvironment(), GITHUB_USERNAME: undefined }),
    /GITHUB_USERNAME/,
  );
  assert.throws(
    () => validateRuntimeEnvironment({ ...runtimeEnvironment(), GITHUB_TOKEN: "" }),
    /GITHUB_TOKEN/,
  );
  assert.doesNotThrow(() => validateRuntimeEnvironment({
    ...runtimeEnvironment(),
    GITHUB_TOKEN: undefined,
  }));
});

test("development does not require production cloud bindings", () => {
  assert.doesNotThrow(() => loadRuntimeEnvironment({ NODE_ENV: "development" }));
});
