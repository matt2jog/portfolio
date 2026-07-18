import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";

import {
  createAuditedPool,
  withDatabaseAuditContext,
  type DatabaseAccessTelemetry,
} from "../../backend/data/database-audit";
import { compensateDatabaseMutation } from "../../backend/data/database-compensation";
import { postgresConnectionConfig } from "../../shared/postgres-tls";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for database audit integration tests");
}

function roleUrl(role: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function ensureLoginRole(
  admin: Client,
  role: "portfolio_migrator_login" | "portfolio_runtime_login",
  password: string,
): Promise<void> {
  const exists = await admin.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1) AS exists",
    [role],
  );
  if (!exists.rows[0]?.exists) {
    await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT`);
  }
  const passwordStatement = await admin.query<{ statement: string }>(
    "SELECT pg_catalog.format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS statement",
    [role, password],
  );
  await admin.query(passwordStatement.rows[0]!.statement);
}

async function latestUpdateAudit(
  admin: Client,
  rowId: string,
): Promise<{ auditId: string; afterDigest: string }> {
  const result = await admin.query<{ auditId: string; afterDigest: string }>(`
    SELECT audit_id::text AS "auditId", after_digest AS "afterDigest"
    FROM portfolio.database_mutation_audit
    WHERE table_name = 'welcome_messages'
      AND operation = 'UPDATE'
      AND row_key = pg_catalog.jsonb_build_object('id', $1::text)
      AND changed_columns @> ARRAY['label']::text[]
    ORDER BY sequence_number DESC
    LIMIT 1
  `, [rowId]);
  assert.equal(result.rows.length, 1);
  return result.rows[0]!;
}

test("PostgreSQL audit telemetry, immutable chain, and compensation guards", async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const telemetry: DatabaseAccessTelemetry[] = [];
  const auditedPool = createAuditedPool(
    postgresConnectionConfig(databaseUrl, undefined, "portfolio, extensions"),
    {
      databaseActor: "portfolio_runtime",
      telemetrySink: (event) => telemetry.push(event),
    },
  );
  const rolePassword = randomBytes(24).toString("base64url");
  const migratorPassword = randomBytes(24).toString("base64url");
  const runtime = new Client(
    postgresConnectionConfig(
      roleUrl("portfolio_runtime_login", rolePassword),
      undefined,
      "portfolio, extensions",
      undefined,
      "portfolio_runtime",
    ),
  );
  const migrator = new Client(
    postgresConnectionConfig(
      roleUrl("portfolio_migrator_login", migratorPassword),
      undefined,
      "portfolio, extensions",
      undefined,
      "portfolio_migrator",
    ),
  );
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const compatibilityId = randomUUID();
  const slugs = ids.map((id) => `audit-${id}`);

  try {
    await admin.connect();
    await ensureLoginRole(admin, "portfolio_runtime_login", rolePassword);
    await ensureLoginRole(admin, "portfolio_migrator_login", migratorPassword);
    await admin.query(`
      GRANT USAGE ON SCHEMA portfolio TO portfolio_runtime, portfolio_migrator;
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON TABLE portfolio.welcome_messages
        TO portfolio_runtime, portfolio_migrator;
      GRANT EXECUTE
        ON FUNCTION portfolio.compensate_database_mutation(uuid, text)
        TO portfolio_migrator;
      REVOKE ALL
        ON TABLE portfolio.database_mutation_audit, portfolio.database_audit_chain_heads
        FROM portfolio_runtime;
      REVOKE EXECUTE
        ON FUNCTION portfolio.compensate_database_mutation(uuid, text)
        FROM portfolio_runtime;
    `);
    await runtime.connect();
    await migrator.connect();
    await runtime.query("SET ROLE portfolio_runtime");
    await migrator.query("SET ROLE portfolio_migrator");

    await runtime.query(
      `INSERT INTO portfolio.welcome_messages
        (id, slug, label, message)
       VALUES ($1, $2, 'Compatibility', 'legacy release remains writable')`,
      [compatibilityId, `compatibility-${compatibilityId}`],
    );
    const compatibilityAudit = await admin.query<{
      actorKind: string;
      releaseId: string;
    }>(`
      SELECT actor_kind AS "actorKind", release_id AS "releaseId"
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
      ORDER BY sequence_number DESC
      LIMIT 1
    `, [compatibilityId]);
    assert.deepEqual(compatibilityAudit.rows, [{
      actorKind: "legacy-database-session",
      releaseId: "pre-audit-37abdbd7a15f",
    }]);
    await admin.query(`
      UPDATE portfolio.database_audit_activation
      SET mode = 'enforced',
          enforced_at = pg_catalog.clock_timestamp(),
          enforced_release_sha = $1
      WHERE singleton
    `, ["b".repeat(40)]);
    await assert.rejects(
      runtime.query(
        `INSERT INTO portfolio.welcome_messages
          (id, slug, label, message)
         VALUES ($1, $2, 'Missing context', 'must fail closed')`,
        [randomUUID(), `missing-context-${randomUUID()}`],
      ),
      (error: unknown) => (error as { code?: string }).code === "PDA01",
    );
    await admin.query(`
      UPDATE portfolio.database_audit_activation
      SET mode = 'compatibility',
          enforced_at = NULL,
          enforced_release_sha = NULL
      WHERE singleton
    `);

    const parameterSentinel = `never-telemeter-${randomUUID()}`;
    await auditedPool.query(
      "SELECT id FROM portfolio.projects WHERE id = $1",
      [parameterSentinel],
    );
    await assert.rejects(
      auditedPool.query("SELECT * FROM portfolio.telemetry_missing_relation"),
      (error: unknown) => (error as { code?: string }).code === "42P01",
    );
    const transactionClient = await auditedPool.connect();
    try {
      await transactionClient.query("BEGIN");
      await transactionClient.query("SELECT id FROM portfolio.projects LIMIT 0");
      await transactionClient.query("ROLLBACK");
    } finally {
      transactionClient.release();
    }

    assert.ok(telemetry.some((event) =>
      event.operation === "select"
      && event.relation === "portfolio.projects"
      && event.status === "succeeded"
      && event.rowCount === 0
    ));
    assert.ok(telemetry.some((event) =>
      event.relation === "portfolio.telemetry_missing_relation"
      && event.status === "failed"
      && event.sqlstate === "42P01"
    ));
    assert.ok(telemetry.some((event) => event.operation === "begin"));
    assert.ok(telemetry.some((event) => event.operation === "rollback"));
    const serializedTelemetry = JSON.stringify(telemetry);
    assert.doesNotMatch(serializedTelemetry, new RegExp(parameterSentinel));
    assert.doesNotMatch(serializedTelemetry, /SELECT |INSERT |UPDATE |DELETE /i);

    const requestId = randomUUID();
    await withDatabaseAuditContext({
      requestId,
      traceId: randomUUID(),
      actorKind: "admin",
      actorId: "admin:test",
      operation: "welcome-message-test",
      correlationId: randomUUID(),
      causationId: null,
      releaseId: "integration-test",
      authenticationAssertionDigest: "a".repeat(64),
    }, async () => {
      const client = await auditedPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO portfolio.welcome_messages
            (id, slug, label, message)
           VALUES ($1, $2, 'Original', 'message-a')`,
          [ids[0], slugs[0]],
        );
        await client.query(
          "UPDATE portfolio.welcome_messages SET label = 'Changed' WHERE id = $1",
          [ids[0]],
        );
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    });

    const contextualAudit = await admin.query<{
      requestId: string;
      actorKind: string;
      actorId: string;
      databaseActor: string;
      beforeRedacted: unknown;
      afterRedacted: unknown;
    }>(`
      SELECT
        request_id AS "requestId",
        actor_kind AS "actorKind",
        actor_id AS "actorId",
        database_session_user AS "databaseActor",
        before_redacted AS "beforeRedacted",
        after_redacted AS "afterRedacted"
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
        AND operation = 'UPDATE'
      ORDER BY sequence_number DESC
      LIMIT 1
    `, [ids[0]]);
    assert.deepEqual(contextualAudit.rows, [{
      requestId,
      actorKind: "admin",
      actorId: "admin:test",
      databaseActor: "postgres",
      beforeRedacted: {
        fields: ["label"],
        rowKey: { id: ids[0] },
      },
      afterRedacted: {
        fields: ["label"],
        rowKey: { id: ids[0] },
      },
    }]);
    assert.doesNotMatch(
      JSON.stringify(contextualAudit.rows),
      /Original|Changed|message-a/,
    );

    const serviceRequestId = randomUUID();
    await withDatabaseAuditContext({
      requestId: serviceRequestId,
      traceId: serviceRequestId,
      actorKind: "service",
      actorId: "portfolio_runtime",
      operation: "background-welcome-update",
      correlationId: null,
      causationId: null,
      releaseId: "integration-test",
      authenticationAssertionDigest: null,
    }, () => auditedPool.query(
      "UPDATE portfolio.welcome_messages SET message = 'message-a2' WHERE id = $1",
      [ids[0]],
    ));
    const nextPooledContext = await admin.query<{
      requestId: string;
      actorKind: string;
      actorId: string;
    }>(`
      SELECT
        request_id AS "requestId",
        actor_kind AS "actorKind",
        actor_id AS "actorId"
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
        AND operation = 'UPDATE'
        AND changed_columns @> ARRAY['message']::text[]
      ORDER BY sequence_number DESC
      LIMIT 1
    `, [ids[0]]);
    assert.equal(nextPooledContext.rows.length, 1);
    assert.equal(nextPooledContext.rows[0]?.requestId, serviceRequestId);
    assert.deepEqual(
      {
        actorKind: nextPooledContext.rows[0]?.actorKind,
        actorId: nextPooledContext.rows[0]?.actorId,
      },
      { actorKind: "service", actorId: "portfolio_runtime" },
    );

    const auditOwner = await admin.query<{
      canLogin: boolean;
      inherits: boolean;
      operatorCanLogin: boolean;
      operatorInherits: boolean;
      appendOwner: string;
      compensationOwner: string;
    }>(`
      SELECT
        owner.rolcanlogin AS "canLogin",
        owner.rolinherit AS inherits,
        operator.rolcanlogin AS "operatorCanLogin",
        operator.rolinherit AS "operatorInherits",
        append_owner.rolname AS "appendOwner",
        compensation_owner.rolname AS "compensationOwner"
      FROM pg_catalog.pg_roles AS owner
      JOIN pg_catalog.pg_proc AS append_routine
        ON append_routine.oid = 'portfolio.suppress_redundant_updates_trigger()'::regprocedure
      JOIN pg_catalog.pg_roles AS append_owner
        ON append_owner.oid = append_routine.proowner
      JOIN pg_catalog.pg_proc AS compensation_routine
        ON compensation_routine.oid = 'portfolio.compensate_database_mutation(uuid,text)'::regprocedure
      JOIN pg_catalog.pg_roles AS compensation_owner
        ON compensation_owner.oid = compensation_routine.proowner
      JOIN pg_catalog.pg_roles AS operator
        ON operator.rolname = 'portfolio_compensation_operator'
      WHERE owner.rolname = 'portfolio_audit_owner'
    `);
    assert.deepEqual(auditOwner.rows, [{
      canLogin: false,
      inherits: false,
      operatorCanLogin: false,
      operatorInherits: false,
      appendOwner: "portfolio_audit_owner",
      compensationOwner: "portfolio_compensation_operator",
    }]);

    const beforeRollback = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM portfolio.database_mutation_audit",
    );
    await withDatabaseAuditContext({
      requestId: randomUUID(),
      traceId: randomUUID(),
      actorKind: "service",
      actorId: "portfolio_runtime",
      operation: "rollback-proof",
      correlationId: null,
      causationId: null,
      releaseId: "integration-test",
      authenticationAssertionDigest: null,
    }, async () => {
      const rollbackClient = await auditedPool.connect();
      try {
        await rollbackClient.query("BEGIN");
        await rollbackClient.query(
          `INSERT INTO portfolio.welcome_messages
            (id, slug, label, message)
           VALUES ($1, $2, 'Rolled back', 'rolled back')`,
          [randomUUID(), `rollback-${randomUUID()}`],
        );
        await rollbackClient.query("ROLLBACK");
      } finally {
        rollbackClient.release();
      }
    });
    const afterRollback = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM portfolio.database_mutation_audit",
    );
    assert.equal(afterRollback.rows[0]?.count, beforeRollback.rows[0]?.count);

    const target = await latestUpdateAudit(admin, ids[0]);
    await admin.query(
      "UPDATE portfolio.welcome_messages SET message = 'message-b' WHERE id = $1",
      [ids[0]],
    );
    const compensationId = await compensateDatabaseMutation(migrator, {
      auditId: target.auditId,
      expectedCurrentDigest: target.afterDigest,
    });
    const compensated = await admin.query<{ label: string; message: string }>(
      "SELECT label, message FROM portfolio.welcome_messages WHERE id = $1",
      [ids[0]],
    );
    assert.deepEqual(compensated.rows, [{ label: "Original", message: "message-b" }]);
    const compensationAudit = await admin.query<{ compensationOf: string }>(`
      SELECT compensation_of::text AS "compensationOf"
      FROM portfolio.database_mutation_audit
      WHERE audit_id = $1::uuid
    `, [compensationId]);
    assert.deepEqual(compensationAudit.rows, [{ compensationOf: target.auditId }]);

    await admin.query(
      `INSERT INTO portfolio.welcome_messages
        (id, slug, label, message)
       VALUES ($1, $2, 'Digest A', 'digest')`,
      [ids[1], slugs[1]],
    );
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Digest B' WHERE id = $1",
      [ids[1]],
    );
    const digestTarget = await latestUpdateAudit(admin, ids[1]);
    await admin.query("ALTER TABLE portfolio.welcome_messages DISABLE TRIGGER database_mutation_audit");
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Unjournaled state' WHERE id = $1",
      [ids[1]],
    );
    await admin.query("ALTER TABLE portfolio.welcome_messages ENABLE TRIGGER database_mutation_audit");
    await assert.rejects(
      compensateDatabaseMutation(migrator, {
        auditId: digestTarget.auditId,
        expectedCurrentDigest: digestTarget.afterDigest,
      }),
      (error: unknown) => (error as { code?: string }).code === "PDA02",
    );

    await admin.query(
      `INSERT INTO portfolio.welcome_messages
        (id, slug, label, message)
       VALUES ($1, $2, 'Overlap A', 'overlap')`,
      [ids[2], slugs[2]],
    );
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Overlap B' WHERE id = $1",
      [ids[2]],
    );
    const overlapTarget = await latestUpdateAudit(admin, ids[2]);
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Overlap C' WHERE id = $1",
      [ids[2]],
    );
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Overlap B' WHERE id = $1",
      [ids[2]],
    );
    await assert.rejects(
      compensateDatabaseMutation(migrator, {
        auditId: overlapTarget.auditId,
        expectedCurrentDigest: overlapTarget.afterDigest,
      }),
      (error: unknown) => (error as { code?: string }).code === "PDA03",
    );

    await admin.query(
      `INSERT INTO portfolio.welcome_messages
        (id, slug, label, message)
       VALUES ($1, $2, 'Retention A', 'retention')`,
      [ids[3], slugs[3]],
    );
    await admin.query(
      "UPDATE portfolio.welcome_messages SET label = 'Retention B' WHERE id = $1",
      [ids[3]],
    );
    const expiredTarget = await latestUpdateAudit(admin, ids[3]);
    await admin.query(`
      UPDATE portfolio.database_compensation_payloads
      SET
        created_at = pg_catalog.clock_timestamp() - interval '8 days',
        expires_at = pg_catalog.clock_timestamp() - interval '1 day'
      WHERE audit_id = $1::uuid
    `, [expiredTarget.auditId]);
    await assert.rejects(
      compensateDatabaseMutation(migrator, {
        auditId: expiredTarget.auditId,
        expectedCurrentDigest: expiredTarget.afterDigest,
      }),
      (error: unknown) => (error as { code?: string }).code === "PDA06",
    );

    const silentBefore = await admin.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
    `, [ids[2]]);
    await migrator.query("BEGIN");
    await migrator.query("SET LOCAL portfolio_audit.event_silent = 'on'");
    await migrator.query(
      "UPDATE portfolio.welcome_messages SET message = 'silent backfill' WHERE id = $1",
      [ids[2]],
    );
    await migrator.query("COMMIT");
    const silentAfter = await admin.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
    `, [ids[2]]);
    assert.equal(silentAfter.rows[0]?.count, silentBefore.rows[0]?.count);

    await runtime.query("BEGIN");
    await runtime.query("SET LOCAL portfolio_audit.event_silent = 'on'");
    await runtime.query(`
      SELECT
        pg_catalog.set_config('portfolio_audit.request_id', $1, true),
        pg_catalog.set_config('portfolio_audit.trace_id', $1, true),
        pg_catalog.set_config('portfolio_audit.actor_kind', 'service', true),
        pg_catalog.set_config('portfolio_audit.actor_id', 'portfolio-runtime-test', true),
        pg_catalog.set_config('portfolio_audit.operation', 'runtime-silence-test', true),
        pg_catalog.set_config('portfolio_audit.release_id', 'integration-test', true)
    `, [randomUUID()]);
    await runtime.query(
      "UPDATE portfolio.welcome_messages SET message = 'runtime cannot silence' WHERE id = $1",
      [ids[2]],
    );
    await runtime.query("COMMIT");
    const runtimeAudit = await admin.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM portfolio.database_mutation_audit
      WHERE row_key = pg_catalog.jsonb_build_object('id', $1::text)
        AND database_session_user = 'portfolio_runtime_login'
    `, [ids[2]]);
    assert.equal(runtimeAudit.rows[0]?.count, "1");

    await assert.rejects(
      runtime.query("SELECT * FROM portfolio.database_mutation_audit LIMIT 1"),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      runtime.query("SELECT * FROM portfolio.database_audit_chain_heads LIMIT 1"),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      runtime.query("SELECT * FROM portfolio.database_compensation_payloads LIMIT 1"),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      runtime.query(
        "SELECT portfolio.compensate_database_mutation($1::uuid, $2::text)",
        [overlapTarget.auditId, overlapTarget.afterDigest],
      ),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      admin.query("INSERT INTO portfolio.database_mutation_audit DEFAULT VALUES"),
      (error: unknown) => (error as { code?: string }).code === "PDA10",
    );
    await assert.rejects(
      admin.query(
        "UPDATE portfolio.database_mutation_audit SET table_name = table_name WHERE audit_id = $1::uuid",
        [target.auditId],
      ),
      (error: unknown) => (error as { code?: string }).code === "PDA10",
    );
    await assert.rejects(
      admin.query(`
        UPDATE portfolio.database_audit_chain_heads
        SET head_hash = head_hash
        WHERE chain_name = 'portfolio'
      `),
      (error: unknown) => (error as { code?: string }).code === "PDA10",
    );
    await assert.rejects(
      admin.query("TRUNCATE TABLE portfolio.database_mutation_audit CASCADE"),
      (error: unknown) => (error as { code?: string }).code === "PDA10",
    );

    const chain = await admin.query<{
      sequenceNumber: string;
      previousHash: string;
      entryHash: string;
      hashIsValid: boolean;
    }>(`
      SELECT
        sequence_number::text AS "sequenceNumber",
        previous_hash AS "previousHash",
        entry_hash AS "entryHash",
        entry_hash = pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
            'previousHash', previous_hash,
            'auditId', audit_id::text,
            'sequenceNumber', sequence_number,
            'transactionId', transaction_id,
            'schemaName', schema_name,
            'tableName', table_name,
            'operation', operation,
            'rowKey', row_key,
            'changedColumns', pg_catalog.to_jsonb(changed_columns),
            'beforeDigest', before_digest,
            'afterDigest', after_digest,
            'databaseSessionUser', database_session_user,
            'databaseCurrentUser', database_current_user,
            'requestId', request_id,
            'traceId', trace_id,
            'actorKind', actor_kind,
            'actorId', actor_id,
            'operationContext', operation_context,
            'correlationId', correlation_id,
            'causationId', causation_id,
            'releaseId', release_id,
            'authenticationAssertionDigest', authentication_assertion_digest,
            'compensationOf', compensation_of,
            'occurredAt', pg_catalog.to_char(
              occurred_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            )
          )::text, 'UTF8')),
          'hex'
        ) AS "hashIsValid"
      FROM portfolio.database_mutation_audit
      ORDER BY sequence_number
    `);
    assert.ok(chain.rows.length >= 10);
    for (let index = 0; index < chain.rows.length; index++) {
      const row = chain.rows[index]!;
      assert.match(row.entryHash, /^[0-9a-f]{64}$/);
      assert.equal(row.hashIsValid, true);
      assert.equal(
        row.previousHash,
        index === 0 ? "0".repeat(64) : chain.rows[index - 1]!.entryHash,
      );
    }
    const head = await admin.query<{ headHash: string; entryCount: string }>(`
      SELECT head_hash AS "headHash", entry_count::text AS "entryCount"
      FROM portfolio.database_audit_chain_heads
      WHERE chain_name = 'portfolio'
    `);
    assert.deepEqual(head.rows, [{
      headHash: chain.rows.at(-1)!.entryHash,
      entryCount: String(chain.rows.length),
    }]);
  } finally {
    await admin
      .query("ALTER TABLE portfolio.welcome_messages ENABLE TRIGGER database_mutation_audit")
      .catch(() => undefined);
    await admin
      .query("DELETE FROM portfolio.welcome_messages WHERE id = ANY($1::varchar[])", [[...ids, compatibilityId]])
      .catch(() => undefined);
    await runtime.end().catch(() => undefined);
    await migrator.end().catch(() => undefined);
    await auditedPool.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
