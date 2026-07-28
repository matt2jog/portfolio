import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export interface DatabaseStatementClassification {
  operation: string;
  relation: string | null;
}

export interface DatabaseAccessTelemetry {
  operation: string;
  relation: string | null;
  status: "succeeded" | "failed";
  durationMs: number;
  rowCount: number | null;
  sqlstate: string | null;
  databaseActor: string;
}

export interface DatabaseAuditContext {
  requestId: string;
  traceId: string;
  actorKind: string;
  actorId: string;
  operation: string;
  correlationId: string | null;
  causationId: string | null;
  releaseId: string;
  authenticationAssertionDigest: string | null;
}

export interface AuditedPoolOptions {
  databaseActor: string;
  telemetrySink?: (event: DatabaseAccessTelemetry) => void | Promise<void>;
  auditSummarySink?: (summary: DatabaseAuditChainSummary) => void | Promise<void>;
  initializeConnection?: (client: PoolClient) => Promise<void>;
  capabilityRole?: string;
}

export interface DatabaseAuditChainSummary {
  chainName: string;
  headHash: string;
  entryCount: number;
  lastSequenceNumber: number;
  updatedAt: string;
}

type QueryArguments = unknown[];
type QueryCallback = (error: Error | null, result?: QueryResult) => void;
type RawQuery = (...args: QueryArguments) => Promise<QueryResult>;

const auditContextStorage = new AsyncLocalStorage<DatabaseAuditContext>();
const mutationOperations = new Set(["delete", "insert", "merge", "update", "upsert"]);

const identifierPart = String.raw`(?:"([A-Za-z_][A-Za-z0-9_$]*)"|([A-Za-z_][A-Za-z0-9_$]*))`;
const relationToken = `${identifierPart}(?:\\s*\\.\\s*${identifierPart})?`;
const relationPatterns: ReadonlyArray<[string, RegExp]> = [
  ["select", new RegExp(`^\\s*select\\b[\\s\\S]*?\\bfrom\\s+(${relationToken})`, "i")],
  ["insert", new RegExp(`^\\s*insert\\s+into\\s+(${relationToken})`, "i")],
  ["upsert", new RegExp(`^\\s*upsert\\s+into\\s+(${relationToken})`, "i")],
  ["update", new RegExp(`^\\s*update\\s+(${relationToken})`, "i")],
  ["delete", new RegExp(`^\\s*delete\\s+from\\s+(${relationToken})`, "i")],
  ["merge", new RegExp(`^\\s*merge\\s+into\\s+(${relationToken})`, "i")],
];

function boundedIdentifier(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^[A-Za-z0-9_.:@/-]{1,160}$/.test(normalized)) return normalized;
  return fallback;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function normalizeRelation(value: string): string | null {
  const parts = value
    .split(".")
    .map((part) => part.trim().replace(/^"|"$/g, "").toLowerCase());
  if (
    parts.length < 1
    || parts.length > 2
    || parts.some((part) => !/^[a-z_][a-z0-9_$]{0,62}$/.test(part))
  ) {
    return null;
  }
  return parts.join(".");
}

function queryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value
    && typeof value === "object"
    && "text" in value
    && typeof value.text === "string"
  ) {
    return value.text;
  }
  return "";
}

function sqlstate(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = String(error.code);
  return /^[A-Z0-9]{5}$/.test(code) ? code : null;
}

function defaultTelemetrySink(event: DatabaseAccessTelemetry): void {
  console.info(JSON.stringify({
    event: "portfolio.database.access",
    ...event,
  }));
}

export function releaseIdentity(): string {
  return boundedIdentifier(
    process.env.PORTFOLIO_RELEASE_SHA
      ?? process.env.K_REVISION
      ?? "development",
    "unknown-release",
  );
}

function validateAuditContext(context: DatabaseAuditContext): DatabaseAuditContext {
  const bounded = (name: string, value: string, maximum: number): string => {
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || hasControlCharacter(normalized)) {
      throw new Error(`Database audit context ${name} is missing or invalid`);
    }
    return normalized;
  };
  const nullable = (name: string, value: string | null, maximum: number): string | null =>
    value === null ? null : bounded(name, value, maximum);
  const authenticationAssertionDigest = context.authenticationAssertionDigest;
  if (
    authenticationAssertionDigest !== null
    && !/^[0-9a-f]{64}$/.test(authenticationAssertionDigest)
  ) {
    throw new Error("Database audit context authenticationAssertionDigest is invalid");
  }
  return {
    requestId: bounded("requestId", context.requestId, 160),
    traceId: bounded("traceId", context.traceId, 160),
    actorKind: bounded("actorKind", context.actorKind, 64),
    actorId: bounded("actorId", context.actorId, 160),
    operation: bounded("operation", context.operation, 160),
    correlationId: nullable("correlationId", context.correlationId, 160),
    causationId: nullable("causationId", context.causationId, 160),
    releaseId: bounded("releaseId", context.releaseId, 160),
    authenticationAssertionDigest,
  };
}

export function classifyDatabaseStatement(text: string): DatabaseStatementClassification {
  const normalized = text
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/, "")
    .trim();
  for (const [operation, pattern] of relationPatterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    return {
      operation,
      relation: normalizeRelation(match[1] ?? ""),
    };
  }
  return {
    operation: /^[a-z]+/i.exec(normalized)?.[0].toLowerCase() ?? "unknown",
    relation: null,
  };
}

export function createDatabaseAccessTelemetry(input: {
  classification: DatabaseStatementClassification;
  status: "succeeded" | "failed";
  durationMs: number;
  rowCount: number | null;
  sqlstate: string | null;
  databaseActor: string;
}): DatabaseAccessTelemetry {
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs * 1000) / 1000)
    : 0;
  const rowCount = Number.isSafeInteger(input.rowCount) && (input.rowCount ?? -1) >= 0
    ? input.rowCount
    : null;
  return {
    operation: boundedIdentifier(input.classification.operation.toLowerCase(), "unknown"),
    relation: input.classification.relation === null
      ? null
      : normalizeRelation(input.classification.relation),
    status: input.status,
    durationMs,
    rowCount,
    sqlstate: input.sqlstate && /^[A-Z0-9]{5}$/.test(input.sqlstate)
      ? input.sqlstate
      : null,
    databaseActor: boundedIdentifier(input.databaseActor, "unknown"),
  };
}

export function withDatabaseAuditContext<T>(
  context: DatabaseAuditContext,
  run: () => T,
): T {
  return auditContextStorage.run(validateAuditContext(context), run);
}

function exactRequestIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:@/-]{1,160}$/.test(normalized) ? normalized : undefined;
}

function requestContext(
  request: Request,
  response: Response,
  actor: { kind: string; id: string },
  operation: string,
): DatabaseAuditContext {
  const requestId = exactRequestIdentifier(request.get("x-request-id")) ?? randomUUID();
  const cloudTrace = exactRequestIdentifier(request.get("x-cloud-trace-context")?.split("/")[0]);
  const traceparent = request.get("traceparent")?.match(/^00-([0-9a-f]{32})-[0-9a-f]{16}-0[01]$/)?.[1];
  const assertionDigest = response.locals.adminAssertionDigest
    ?? response.locals.careerPushAssertionDigest
    ?? null;
  return {
    requestId,
    traceId: cloudTrace ?? traceparent ?? requestId,
    actorKind: actor.kind,
    actorId: actor.id,
    operation,
    correlationId: exactRequestIdentifier(request.get("x-correlation-id")) ?? null,
    causationId: exactRequestIdentifier(request.get("x-causation-id")) ?? null,
    releaseId: releaseIdentity(),
    authenticationAssertionDigest:
      typeof assertionDigest === "string" && /^[0-9a-f]{64}$/.test(assertionDigest)
        ? assertionDigest
        : null,
  };
}

export function createDatabaseAuditContextMiddleware(): RequestHandler {
  return (request, response, next) => {
    const tracker = typeof (request as Request & { trackerUuid?: unknown }).trackerUuid === "string"
      ? (request as Request & { trackerUuid: string }).trackerUuid
      : undefined;
    if (!tracker) {
      response.status(500).json({ error: "database_audit_context_unavailable" });
      return;
    }
    const actor = request.user
      ? { kind: "admin", id: request.user.googleSub }
      : { kind: "public-request", id: tracker };
    return withDatabaseAuditContext(
      requestContext(request, response, actor, `${request.method} ${request.path}`),
      next,
    );
  };
}

export function verifiedAdminDatabaseAuditContext(
  request: Request,
  response: Response,
  adminSubject: string,
  assertionDigest: string,
): DatabaseAuditContext {
  response.locals.adminAssertionDigest = assertionDigest;
  return requestContext(
    request,
    response,
    { kind: "admin", id: adminSubject },
    "synchronize-admin-identity",
  );
}

class PoolAuditController {
  private readonly databaseActor: string;
  private readonly telemetrySink: (event: DatabaseAccessTelemetry) => void | Promise<void>;
  private readonly auditSummarySink: (summary: DatabaseAuditChainSummary) => void | Promise<void>;
  private readonly rawConnect: () => Promise<PoolClient>;

  constructor(
    rawConnect: () => Promise<PoolClient>,
    options: AuditedPoolOptions,
  ) {
    this.rawConnect = rawConnect;
    this.databaseActor = boundedIdentifier(options.databaseActor, "portfolio_runtime");
    this.telemetrySink = options.telemetrySink ?? defaultTelemetrySink;
    this.auditSummarySink = options.auditSummarySink ?? ((summary) => {
      console.info(JSON.stringify({ event: "portfolio.database.audit.chain-head", ...summary }));
    });
  }

  private async emit(event: DatabaseAccessTelemetry): Promise<void> {
    try {
      await this.telemetrySink(event);
    } catch {
      // Access telemetry must not turn a successful read into an application outage.
    }
  }

  private async observe(
    rawQuery: RawQuery,
    args: QueryArguments,
    classification: DatabaseStatementClassification,
  ): Promise<QueryResult> {
    const startedAt = performance.now();
    try {
      const result = await rawQuery(...args);
      await this.emit(createDatabaseAccessTelemetry({
        classification,
        status: "succeeded",
        durationMs: performance.now() - startedAt,
        rowCount: result.rowCount,
        sqlstate: null,
        databaseActor: this.databaseActor,
      }));
      return result;
    } catch (error) {
      await this.emit(createDatabaseAccessTelemetry({
        classification,
        status: "failed",
        durationMs: performance.now() - startedAt,
        rowCount: null,
        sqlstate: sqlstate(error),
        databaseActor: this.databaseActor,
      }));
      throw error;
    }
  }

  private async setTransactionContext(
    rawQuery: RawQuery,
    operation: string,
  ): Promise<void> {
    const stored = auditContextStorage.getStore();
    if (!stored) throw new Error("Database audit context is required for every mutation");
    const context = validateAuditContext(stored);
    await this.observe(rawQuery, [
      `SELECT
        pg_catalog.set_config('portfolio_audit.request_id', $1, true),
        pg_catalog.set_config('portfolio_audit.trace_id', $2, true),
        pg_catalog.set_config('portfolio_audit.actor_kind', $3, true),
        pg_catalog.set_config('portfolio_audit.actor_id', $4, true),
        pg_catalog.set_config('portfolio_audit.operation', $5, true),
        pg_catalog.set_config('portfolio_audit.correlation_id', $6, true),
        pg_catalog.set_config('portfolio_audit.causation_id', $7, true),
        pg_catalog.set_config('portfolio_audit.release_id', $8, true),
        pg_catalog.set_config('portfolio_audit.authentication_assertion_digest', $9, true)`,
      [
        context.requestId,
        context.traceId,
        context.actorKind,
        context.actorId,
        context.operation || operation,
        context.correlationId ?? "",
        context.causationId ?? "",
        context.releaseId,
        context.authenticationAssertionDigest ?? "",
      ],
    ], { operation: "context", relation: null });
  }

  private async emitAuditSummary(rawQuery: RawQuery): Promise<void> {
    const result = await rawQuery(`SELECT
      chain_name AS "chainName",
      head_hash AS "headHash",
      entry_count AS "entryCount",
      last_sequence_number AS "lastSequenceNumber",
      updated_at AS "updatedAt"
      FROM portfolio.database_audit_chain_summary()`);
    if (result.rows.length !== 1) throw new Error("Database audit chain summary is missing");
    const row = result.rows[0] as Record<string, unknown>;
    const entryCount = Number(row.entryCount);
    const lastSequenceNumber = Number(row.lastSequenceNumber);
    if (
      row.chainName !== "portfolio" || typeof row.headHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(row.headHash) || !Number.isSafeInteger(entryCount) ||
      !Number.isSafeInteger(lastSequenceNumber)
    ) {
      throw new Error("Database audit chain summary is malformed");
    }
    await this.auditSummarySink({
      chainName: "portfolio",
      headHash: row.headHash,
      entryCount,
      lastSequenceNumber,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    });
  }

  private async autoTransaction(
    rawQuery: RawQuery,
    args: QueryArguments,
    classification: DatabaseStatementClassification,
  ): Promise<QueryResult> {
    await this.observe(rawQuery, ["BEGIN"], { operation: "begin", relation: null });
    let result: QueryResult;
    try {
      await this.setTransactionContext(rawQuery, classification.operation);
      result = await this.observe(rawQuery, args, classification);
      await this.observe(rawQuery, ["COMMIT"], { operation: "commit", relation: null });
    } catch (error) {
      await this.observe(rawQuery, ["ROLLBACK"], { operation: "rollback", relation: null })
        .catch(() => undefined);
      throw error;
    }
    await this.emitAuditSummary(rawQuery);
    return result;
  }

  private instrumentClient(client: PoolClient): PoolClient {
    const rawQuery = client.query.bind(client) as RawQuery;
    let inTransaction = false;
    let transactionMutated = false;
    const execute = async (args: QueryArguments): Promise<QueryResult> => {
      const classification = classifyDatabaseStatement(queryText(args[0]));
      if (classification.operation === "begin" || classification.operation === "start") {
        const result = await this.observe(rawQuery, args, classification);
        inTransaction = true;
        return result;
      }
      if (classification.operation === "commit" || classification.operation === "rollback") {
        try {
          const result = await this.observe(rawQuery, args, classification);
          if (classification.operation === "commit" && transactionMutated) {
            await this.emitAuditSummary(rawQuery);
          }
          return result;
        } finally {
          inTransaction = false;
          transactionMutated = false;
        }
      }
      if (mutationOperations.has(classification.operation)) {
        if (!inTransaction) return this.autoTransaction(rawQuery, args, classification);
        await this.setTransactionContext(rawQuery, classification.operation);
        transactionMutated = true;
      }
      return this.observe(rawQuery, args, classification);
    };

    return new Proxy(client, {
      get(target, property) {
        if (property === "query") {
          return (...queryArgs: QueryArguments) => {
            const callback = typeof queryArgs.at(-1) === "function"
              ? queryArgs.pop() as QueryCallback
              : null;
            const pending = execute(queryArgs);
            if (!callback) return pending;
            void pending.then(
              (result) => callback(null, result),
              (error: Error) => callback(error),
            );
            return undefined;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PoolClient;
  }

  async connect(): Promise<PoolClient> {
    return this.instrumentClient(await this.rawConnect());
  }

  query<T extends QueryResultRow = QueryResultRow>(queryArgs: QueryArguments): Promise<QueryResult<T>> {
    return this.rawConnect().then(async (client) => {
      const rawQuery = client.query.bind(client) as RawQuery;
      const classification = classifyDatabaseStatement(queryText(queryArgs[0]));
      try {
        if (mutationOperations.has(classification.operation)) {
          return await this.autoTransaction(rawQuery, queryArgs, classification);
        }
        return await this.observe(rawQuery, queryArgs, classification);
      } finally {
        client.release();
      }
    }) as Promise<QueryResult<T>>;
  }
}

export function createAuditedPool(
  config: PoolConfig,
  options: AuditedPoolOptions,
): Pool {
  if (
    options.capabilityRole
    && !/^[a-z_][a-z0-9_]*$/.test(options.capabilityRole)
  ) {
    throw new Error("Audited pool capability role is not a safe identifier");
  }
  if (options.capabilityRole && !options.initializeConnection) {
    throw new Error("Audited pool capability role requires a verified connection initializer");
  }
  const pool = new Pool(config);
  const poolConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  const initializedClients = new WeakSet<PoolClient>();
  const rawConnect = async (): Promise<PoolClient> => {
    const client = await poolConnect();
    try {
      if (!initializedClients.has(client)) {
        if (options.initializeConnection) await options.initializeConnection(client);
        initializedClients.add(client);
      } else if (options.capabilityRole) {
        await client.query(`SET ROLE ${options.capabilityRole}`);
      }
      return client;
    } catch (error) {
      client.release(error instanceof Error ? error : new Error("Database connection initialization failed"));
      throw error;
    }
  };
  const controller = new PoolAuditController(rawConnect, options);

  pool.connect = ((callback?: (
    error: Error | null,
    client?: PoolClient,
    done?: (release?: boolean | Error) => void,
  ) => void) => {
    const pending = controller.connect();
    if (!callback) return pending;
    void pending.then(
      (client) => callback(null, client, (release) => client.release(release)),
      (error: Error) => callback(error),
    );
    return undefined;
  }) as Pool["connect"];

  pool.query = ((...queryArgs: QueryArguments) => {
    const callback = typeof queryArgs.at(-1) === "function"
      ? queryArgs.pop() as QueryCallback
      : null;
    const pending = controller.query(queryArgs);
    if (!callback) return pending;
    void pending.then(
      (result) => callback(null, result),
      (error: Error) => callback(error),
    );
    return undefined;
  }) as Pool["query"];

  return pool;
}
