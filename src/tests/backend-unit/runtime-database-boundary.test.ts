import assert from "node:assert/strict";
import test from "node:test";
import { assertRuntimeDatabaseSession } from "../../backend/data/runtime-database-boundary";

function queryable(overrides: Record<string, unknown> = {}) {
  return {
    async query() {
      return {
        rows: [{
          sessionUser: "portfolio_runtime",
          currentUser: "portfolio_runtime",
          roleExists: true,
          inheritsPrivilegedRole: false,
          canCreateDatabaseObjects: false,
          canCreatePublicSchemaObjects: false,
          ...overrides,
        }],
      };
    },
  };
}

test("runtime database boundary accepts only the exact unprivileged runtime session", async () => {
  await assert.doesNotReject(assertRuntimeDatabaseSession(queryable()));
});

test("runtime database boundary rejects admin, switched, inherited, and DDL-capable sessions", async () => {
  for (const evidence of [
    { sessionUser: "postgres", currentUser: "postgres" },
    { sessionUser: "portfolio_runtime", currentUser: "postgres" },
    { inheritsPrivilegedRole: true },
    { canCreateDatabaseObjects: true },
    { canCreatePublicSchemaObjects: true },
    { roleExists: false },
  ]) {
    await assert.rejects(
      assertRuntimeDatabaseSession(queryable(evidence)),
      /runtime database session boundary/i,
    );
  }
});
