import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeEnvironment, validateRuntimeEnvironment } from "../../backend/runtime-config";

function productionEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    TURSO_DATABASE_URL: "libsql://personal-brand-career-prod.example.turso.io",
    TURSO_AUTH_TOKEN: "fixture",
    GITHUB_USERNAME: "matt2jog",
  };
}

test("production accepts credential-free Turso coordinates with a separate token", () => {
  const target = productionEnvironment();
  const snapshot = { ...target };
  assert.doesNotThrow(() => loadRuntimeEnvironment(target));
  assert.deepEqual(target, snapshot);
});

test("production rejects local databases, embedded credentials, and missing tokens", () => {
  assert.throws(() => validateRuntimeEnvironment({ ...productionEnvironment(), TURSO_DATABASE_URL: "file:test.db" }), /remote Turso/);
  assert.throws(() => validateRuntimeEnvironment({ ...productionEnvironment(), TURSO_DATABASE_URL: "libsql://user:secret@example.turso.io" }), /credential-free/);
  assert.throws(() => validateRuntimeEnvironment({ ...productionEnvironment(), TURSO_AUTH_TOKEN: undefined }), /TURSO_AUTH_TOKEN/);
});

test("GitHub activity configuration remains explicit", () => {
  assert.throws(() => validateRuntimeEnvironment({ ...productionEnvironment(), GITHUB_USERNAME: undefined }), /GITHUB_USERNAME/);
  assert.throws(() => validateRuntimeEnvironment({ ...productionEnvironment(), GITHUB_TOKEN: "" }), /GITHUB_TOKEN/);
});

test("development can load before local database coordinates are supplied", () => {
  assert.doesNotThrow(() => loadRuntimeEnvironment({ NODE_ENV: "development" }));
});
