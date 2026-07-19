import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Pool, type PoolClient, type QueryResult } from "pg";

import {
  classifyDatabaseStatement,
  createDatabaseAccessTelemetry,
  createAuditedPool,
  withDatabaseAuditContext,
  type DatabaseAccessTelemetry,
} from "../../backend/data/database-audit";
import {
  assertDatabaseCompensationOperator,
  compensateDatabaseMutation,
} from "../../backend/data/database-compensation";

test("database access classification emits only bounded semantic metadata", () => {
  assert.deepEqual(
    classifyDatabaseStatement(
      'SELECT "projects"."id" FROM "portfolio"."projects" WHERE "projects"."id" = $1',
    ),
    { operation: "select", relation: "portfolio.projects" },
  );
  assert.deepEqual(
    classifyDatabaseStatement(
      'INSERT INTO "portfolio"."welcome_messages" ("slug") VALUES ($1)',
    ),
    { operation: "insert", relation: "portfolio.welcome_messages" },
  );
  assert.deepEqual(classifyDatabaseStatement("BEGIN"), {
    operation: "begin",
    relation: null,
  });

  const telemetry = createDatabaseAccessTelemetry({
    classification: { operation: "select", relation: "portfolio.projects" },
    status: "failed",
    durationMs: 12.25,
    rowCount: null,
    sqlstate: "42P01",
    databaseActor: "portfolio_runtime",
  });
  assert.deepEqual(telemetry, {
    operation: "select",
    relation: "portfolio.projects",
    status: "failed",
    durationMs: 12.25,
    rowCount: null,
    sqlstate: "42P01",
    databaseActor: "portfolio_runtime",
  });
  assert.doesNotMatch(
    JSON.stringify(telemetry),
    /query|statement|parameter|payload|credential|token/i,
  );
});

test("the runtime database adapter is the single instrumented pg boundary", async () => {
  const [adapter, runtimeDb] = await Promise.all([
    readFile(
      new URL("../../backend/data/database-audit.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../backend/data/db.ts", import.meta.url), "utf8"),
  ]);

  assert.match(runtimeDb, /createAuditedPool/);
  assert.doesNotMatch(runtimeDb, /new Pool\s*\(/);
  assert.match(adapter, /AsyncLocalStorage/);
  assert.doesNotMatch(adapter, /telemetry[\s\S]{0,200}(?:text|values|params)/i);
});

test("the audited pool observes pool, callback, and explicit transaction queries", async () => {
  const originalConnect = Pool.prototype.connect;
  const statements: unknown[][] = [];
  let releases = 0;
  Object.defineProperty(Pool.prototype, "connect", {
    configurable: true,
    writable: true,
    value: async () => ({
      query: async (...args: unknown[]): Promise<QueryResult> => {
        statements.push(args);
        const statement = typeof args[0] === "string" ? args[0] : "";
        if (statement.includes("missing_relation")) {
          throw Object.assign(new Error("fixture relation is absent"), {
            code: "42P01",
          });
        }
        if (statement.includes("database_audit_chain_summary")) {
          return {
            command: "SELECT",
            rowCount: 1,
            oid: 0,
            fields: [],
            rows: [{
              chainName: "portfolio",
              headHash: "a".repeat(64),
              entryCount: "2",
              lastSequenceNumber: "2",
              updatedAt: "2026-07-15T12:00:00.000Z",
            }],
          } as QueryResult;
        }
        return {
          command: statement.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "",
          rowCount: /^\s*(?:SELECT|UPDATE|INSERT|DELETE)/i.test(statement) ? 1 : null,
          oid: 0,
          fields: [],
          rows: /^\s*SELECT/i.test(statement) ? [{ id: "fixture" }] : [],
        };
      },
      release: () => {
        releases += 1;
      },
    } as unknown as PoolClient),
  });

  const observed: DatabaseAccessTelemetry[] = [];
  const pool = createAuditedPool({}, {
    databaseActor: "portfolio_runtime",
    telemetrySink: (event) => observed.push(event),
  });
  try {
    await pool.query("SELECT id FROM portfolio.projects");
    await withDatabaseAuditContext({
      requestId: "request-1",
      traceId: "trace-1",
      actorKind: "admin",
      actorId: "admin:test",
      operation: "unit-update",
      correlationId: null,
      causationId: null,
      releaseId: "unit-test",
      authenticationAssertionDigest: "a".repeat(64),
    }, () => pool.query(
      "UPDATE portfolio.welcome_messages SET label = $1 WHERE id = $2",
      ["label", "id"],
    ));

    const client = await pool.connect();
    await client.query("BEGIN");
    await assert.rejects(
      client.query("DELETE FROM portfolio.ip_rate_logs WHERE id = $1", ["id"]),
      /Database audit context is required/,
    );
    await withDatabaseAuditContext({
      requestId: "request-2",
      traceId: "trace-2",
      actorKind: "service",
      actorId: "portfolio:test",
      operation: "unit-delete",
      correlationId: null,
      causationId: null,
      releaseId: "unit-test",
      authenticationAssertionDigest: null,
    }, () => client.query(
      "DELETE FROM portfolio.ip_rate_logs WHERE id = $1",
      ["id"],
    ));
    await client.query("COMMIT");
    client.release();

    await new Promise<void>((resolve, reject) => {
      pool.query("SELECT id FROM portfolio.users", (error, result) => {
        if (error) reject(error);
        else {
          assert.equal(result?.rowCount, 1);
          resolve();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      pool.connect((error, callbackClient, done) => {
        if (error || !callbackClient || !done) {
          reject(error ?? new Error("missing callback client"));
          return;
        }
        done();
        resolve();
      });
    });
    await assert.rejects(
      pool.query("SELECT id FROM portfolio.missing_relation"),
      /fixture relation is absent/,
    );

    assert.ok(observed.some((event) =>
      event.operation === "update"
      && event.relation === "portfolio.welcome_messages"
      && event.status === "succeeded"
    ));
    assert.ok(observed.some((event) =>
      event.operation === "delete"
      && event.relation === "portfolio.ip_rate_logs"
    ));
    assert.ok(observed.some((event) =>
      event.relation === "portfolio.missing_relation"
      && event.status === "failed"
      && event.sqlstate === "42P01"
    ));
    assert.ok(observed.some((event) => event.operation === "context"));
    const configuredContext = statements.find((args) =>
      typeof args[0] === "string"
      && args[0].includes("portfolio_audit.request_id")
      && Array.isArray(args[1])
      && args[1][0] === "request-1"
    );
    assert.ok(configuredContext);
    assert.ok(releases >= 5);
  } finally {
    await pool.end();
    Object.defineProperty(Pool.prototype, "connect", {
      configurable: true,
      writable: true,
      value: originalConnect,
    });
  }
});

test("the audited pool verifies each physical login once and reapplies its capability per checkout", async () => {
  const originalConnect = Pool.prototype.connect;
  const statements: string[] = [];
  let initializations = 0;
  const fixtureClient = {
    query: async (statement: string): Promise<QueryResult> => {
      statements.push(statement);
      return {
        command: statement.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "",
        rowCount: /^\s*SELECT/i.test(statement) ? 1 : null,
        oid: 0,
        fields: [],
        rows: /^\s*SELECT/i.test(statement) ? [{ ok: true }] : [],
      };
    },
    release: () => undefined,
  } as unknown as PoolClient;
  Object.defineProperty(Pool.prototype, "connect", {
    configurable: true,
    writable: true,
    value: async () => fixtureClient,
  });

  const pool = createAuditedPool({}, {
    databaseActor: "portfolio_runtime",
    capabilityRole: "portfolio_runtime",
    initializeConnection: async (client) => {
      initializations += 1;
      await client.query("RESET ROLE");
      await client.query("SET ROLE portfolio_runtime");
    },
  });
  try {
    await pool.query("SELECT 1");
    await pool.query("SELECT 2");
    assert.equal(initializations, 1);
    assert.equal(statements.filter((statement) => statement === "RESET ROLE").length, 1);
    assert.equal(
      statements.filter((statement) => statement === "SET ROLE portfolio_runtime").length,
      2,
    );
    assert.throws(
      () => createAuditedPool({}, {
        databaseActor: "portfolio_runtime",
        capabilityRole: "portfolio_runtime",
      }),
      /verified connection initializer/,
    );
  } finally {
    await pool.end();
    Object.defineProperty(Pool.prototype, "connect", {
      configurable: true,
      writable: true,
      value: originalConnect,
    });
  }
});

test("telemetry sink failures do not change successful query results", async () => {
  const originalConnect = Pool.prototype.connect;
  Object.defineProperty(Pool.prototype, "connect", {
    configurable: true,
    writable: true,
    value: async () => ({
      query: async (): Promise<QueryResult> => ({
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [{ ok: true }],
      }),
      release: () => undefined,
    } as unknown as PoolClient),
  });
  const pool = createAuditedPool({}, {
    databaseActor: "portfolio_runtime",
    telemetrySink: () => {
      throw new Error("fixture sink outage");
    },
  });
  try {
    assert.deepEqual(
      (await pool.query("SELECT true AS ok")).rows,
      [{ ok: true }],
    );
  } finally {
    await pool.end();
    Object.defineProperty(Pool.prototype, "connect", {
      configurable: true,
      writable: true,
      value: originalConnect,
    });
  }
});

test("database compensation validates and enforces its operator boundary", async () => {
  const auditId = "dfbc1a4d-c18f-4c94-9320-d08f77ea3f80";
  const compensationId = "ebca69ee-f44c-4d23-8584-85be9bf908e7";
  const digest = "b".repeat(64);
  const migrator = {
    query: async (statement: string): Promise<{ rows: unknown[] }> =>
      statement.includes("session_user")
        ? { rows: [{ sessionUser: "portfolio_migrator_login", currentUser: "portfolio_migrator" }] }
        : { rows: [{ compensationAuditId: compensationId }] },
  };
  assert.equal(
    await compensateDatabaseMutation(migrator as never, {
      auditId,
      expectedCurrentDigest: digest,
    }),
    compensationId,
  );
  await assert.rejects(
    compensateDatabaseMutation(migrator as never, {
      auditId: "invalid",
      expectedCurrentDigest: digest,
    }),
    /auditId is invalid/,
  );
  await assert.rejects(
    compensateDatabaseMutation(migrator as never, {
      auditId,
      expectedCurrentDigest: "invalid",
    }),
    /expectedCurrentDigest is invalid/,
  );
  await assert.rejects(
    assertDatabaseCompensationOperator({
      query: async () => ({
        rows: [{ sessionUser: "portfolio_runtime", currentUser: "portfolio_runtime" }],
      }),
    } as never),
    /dedicated portfolio_migrator operator boundary/,
  );
  await assert.rejects(
    compensateDatabaseMutation({
      query: async (statement: string) =>
        statement.includes("session_user")
          ? { rows: [{ sessionUser: "portfolio_migrator_login", currentUser: "portfolio_migrator" }] }
          : { rows: [] },
    } as never, { auditId, expectedCurrentDigest: digest }),
    /did not return an audited mutation identifier/,
  );
});

test("the database migration installs immutable audit and guarded compensation", async () => {
  const migration = await readFile(
    new URL(
      "../../migrations/0016_database_audit_compensation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /database_mutation_audit/);
  assert.match(migration, /database_audit_chain_heads/);
  assert.match(migration, /database_compensation_payloads/);
  assert.match(migration, /database_audit_activation/);
  assert.match(migration, /database_audit_releases/);
  assert.match(migration, /mode IN \('compatibility', 'enforced'\)/);
  assert.match(migration, /pre-audit-37abdbd7a15f/);
  assert.match(migration, /interval '48 hours'/i);
  assert.match(migration, /record_database_audit_release/);
  assert.match(migration, /portfolio_audit_owner/);
  assert.match(migration, /portfolio_compensation_operator/);
  assert.doesNotMatch(migration, /CREATE ROLE/);
  assert.match(migration, /before_redacted/);
  assert.match(migration, /after_redacted/);
  assert.match(migration, /interval '7 days'/i);
  assert.match(migration, /ALTER FUNCTION[\s\S]*OWNER TO portfolio_audit_owner/i);
  assert.match(
    migration,
    /ALTER FUNCTION %I\.compensate_database_mutation\(uuid, text\) OWNER TO portfolio_compensation_operator/i,
  );
  assert.match(
    migration,
    /CREATE TRIGGER database_mutation_audit AFTER INSERT OR UPDATE OR DELETE ON %I\.%I/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER database_mutation_audit_immutable BEFORE INSERT OR UPDATE OR DELETE ON %I\.database_mutation_audit/,
  );
  assert.match(migration, /previous_hash/);
  assert.match(migration, /entry_hash/);
  assert.match(migration, /pg_catalog\.sha256/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(migration, /BEFORE TRUNCATE/);
  assert.match(migration, /session_user[\s\S]*portfolio_migrator/i);
  assert.match(migration, /portfolio_audit\.event_silent/);
  assert.match(migration, /later overlapping mutation/i);
  assert.match(migration, /current row digest/i);
  assert.match(migration, /compensation_of/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC/i);
  assert.doesNotMatch(migration, /audit_mutation[^\n]*session/i);
  assert.doesNotMatch(migration, /audit_mutation[^\n]*audit_logs/i);
});
