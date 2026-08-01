import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.PUBLIC_BASE_URL = "https://2jog.dev";
const testDatabaseUrl = new URL("postgresql://localhost:5432/test");
testDatabaseUrl.username = "test";
testDatabaseUrl.password = "test";
process.env.DATABASE_URL ||= testDatabaseUrl.toString();

const {
  buildLoginUrl,
  normalizePortfolioReturn,
  requirePreboundAuth0Admin,
  selectSingleAdminIdentityMatch,
} = await import("../../backend/auth");

test("local administrator reconciliation rejects ambiguous rows", () => {
  assert.throws(
    () => selectSingleAdminIdentityMatch([{ id: "subject-row" }, { id: "email-row" }]),
    /conflicting rows/i,
  );
  assert.equal(selectSingleAdminIdentityMatch([{ id: "single-row" }])?.id, "single-row");
  assert.equal(selectSingleAdminIdentityMatch([]), undefined);
});

test("Auth0 sessions reuse only an exact prebound administrator subject", () => {
  const admin = {
    id: "admin-id",
    email: "admin@example.test",
    auth0Sub: "auth0|admin",
    name: "Admin",
    role: "admin" as const,
  };
  assert.equal(requirePreboundAuth0Admin(admin), admin);
  assert.throws(() => requirePreboundAuth0Admin(undefined), /subject_not_prebound/);
  assert.throws(
    () => requirePreboundAuth0Admin({ ...admin, role: "user" }),
    /subject_not_prebound/,
  );
});

test("Auth0 login preserves only an exact local Admin return target", () => {
  assert.equal(
    normalizePortfolioReturn("https://2jog.dev/admin/projects?view=archived&sort=recent"),
    "https://2jog.dev/admin/projects?view=archived&sort=recent",
  );
  assert.equal(normalizePortfolioReturn("https://attacker.example/admin"), "https://2jog.dev/admin");
  assert.equal(normalizePortfolioReturn("https://2jog.dev/not-admin"), "https://2jog.dev/admin");
  assert.equal(
    buildLoginUrl("https://2jog.dev/admin?tab=projects"),
    "https://2jog.dev/auth/login?returnTo=https%3A%2F%2F2jog.dev%2Fadmin%3Ftab%3Dprojects",
  );
});
