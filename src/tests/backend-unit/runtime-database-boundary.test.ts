import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRuntimeDatabasePool,
  assertRuntimeDatabaseSession,
} from "../../backend/data/runtime-database-boundary";
import {
  assertPortfolioMigratorBootstrapSession,
  assertUnprivilegedDatabaseSession,
} from "../../shared/postgres-session";

function runtimeQueryable(overrides: Record<string, unknown> = {}) {
  return {
    async query(text: string) {
      if (text === "RESET ROLE" || text.startsWith("SET ROLE")) return { rows: [] };
      if (text.includes('"loginCanLogin"')) {
        return {
          rows: [{
            sessionUser: "portfolio_runtime_login",
            currentUser: "portfolio_runtime_login",
            loginCanLogin: true,
            loginIsPrivileged: false,
            capabilityCanLogin: false,
            capabilityIsPrivileged: false,
            canSetCapability: true,
            timezone: "UTC",
            ...overrides,
          }],
        };
      }
      return {
        rows: [{
          currentUser: "portfolio_runtime",
          hasSchemaUsage: true,
          canCreateDatabaseObjects: false,
          canCreatePublicObjects: false,
          ...overrides,
        }],
      };
    },
  };
}

test("runtime accepts the scoped login and capability role", async () => {
  await assert.doesNotReject(assertRuntimeDatabaseSession(runtimeQueryable()));
});

test("runtime rejects privileged or mismatched database identities", async () => {
  for (const overrides of [
    { sessionUser: "postgres" },
    { loginIsPrivileged: true },
    { capabilityCanLogin: true },
    { capabilityIsPrivileged: true },
    { canSetCapability: false },
    { hasSchemaUsage: false },
    { canCreateDatabaseObjects: true },
    { canCreatePublicObjects: true },
  ]) {
    await assert.rejects(
      assertRuntimeDatabaseSession(runtimeQueryable(overrides)),
      /Portfolio runtime database/i,
    );
  }
});

test("runtime startup always releases its checked-out connection", async () => {
  let releases = 0;
  await assertRuntimeDatabasePool({
    async connect() {
      return {
        ...runtimeQueryable(),
        release() {
          releases += 1;
        },
      };
    },
  });
  assert.equal(releases, 1);
});

test("migrator additionally owns and can create in the Portfolio schema", async () => {
  const base = runtimeQueryable({
    sessionUser: "portfolio_migrator_login",
    currentUser: "portfolio_migrator_login",
  });
  let capabilityChecks = 0;
  await assertPortfolioMigratorBootstrapSession({
    async query(text: string) {
      if (text.includes('"ownsSchema"')) {
        return { rows: [{ ownsSchema: true, canCreateInSchema: true }] };
      }
      if (text.includes('"currentUser"') && !text.includes('"loginCanLogin"')) {
        capabilityChecks += 1;
        return {
          rows: [{
            currentUser: "portfolio_migrator",
            hasSchemaUsage: true,
            canCreateDatabaseObjects: false,
            canCreatePublicObjects: false,
          }],
        };
      }
      return base.query(text);
    },
  });
  assert.equal(capabilityChecks, 1);
});

test("unsupported capability names are rejected before SQL interpolation", async () => {
  await assert.rejects(
    assertUnprivilegedDatabaseSession(
      runtimeQueryable(),
      "portfolio_runtime; DROP SCHEMA portfolio" as "portfolio_runtime",
      "Portfolio runtime",
    ),
    /role is invalid/i,
  );
});
