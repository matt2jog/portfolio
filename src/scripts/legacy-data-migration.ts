import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

export type PortfolioBridgeOwnership = "owned" | "projection" | "hybrid";
export type PortfolioBridgeCutoverGate =
  | "write-fence-and-final-hash"
  | "admin-snapshot-and-event-checkpoint";

interface PortfolioBridgeManifestEntry {
  table: string;
  ownership: PortfolioBridgeOwnership;
  sourcePolicy: "retain-until-explicit-retirement";
  cutoverGate: PortfolioBridgeCutoverGate;
  ignoredLegacyColumns: readonly string[];
}

function bridgeEntry(
  table: string,
  ownership: PortfolioBridgeOwnership,
  ignoredLegacyColumns: readonly string[] = [],
): PortfolioBridgeManifestEntry {
  return {
    table,
    ownership,
    sourcePolicy: "retain-until-explicit-retirement",
    cutoverGate: ownership === "owned"
      ? "write-fence-and-final-hash"
      : "admin-snapshot-and-event-checkpoint",
    ignoredLegacyColumns,
  };
}

// This is a bridge inventory, not an ownership transfer. Projection and hybrid
// rows remain Admin-owned at the canonical boundary, and every legacy source
// table remains intact until both Portfolio and Resume complete rollback gates.
export const PORTFOLIO_BRIDGE_MANIFEST = [
  bridgeEntry("admin_policy_acceptance", "owned"),
  bridgeEntry("ai_models", "owned"),
  bridgeEntry("all_skills", "hybrid"),
  bridgeEntry("audit_logs", "owned"),
  bridgeEntry("bio", "projection"),
  bridgeEntry("bio_paragraphs", "projection"),
  bridgeEntry("browser_request_logs", "owned"),
  bridgeEntry("browser_tracking", "owned"),
  bridgeEntry("browser_tracking_ips", "owned"),
  bridgeEntry("education", "projection"),
  bridgeEntry("experiences", "projection"),
  bridgeEntry("github_timeline_events", "owned"),
  bridgeEntry("ip_rate_logs", "owned"),
  bridgeEntry("legal_document_versions", "owned"),
  bridgeEntry("linkedin_timeline_events", "owned"),
  bridgeEntry("personal_information", "projection"),
  bridgeEntry("portfolio_skills", "owned"),
  bridgeEntry("projects", "hybrid"),
  bridgeEntry("session", "owned"),
  bridgeEntry("skills_group", "hybrid", ["discipline_id"]),
  bridgeEntry("users", "owned"),
  bridgeEntry("welcome_messages", "owned"),
  bridgeEntry("xyz_bullets", "projection"),
] as const;

export const PORTFOLIO_DATA_TABLES: readonly string[] = Object.freeze(
  PORTFOLIO_BRIDGE_MANIFEST.map((entry) => entry.table),
);

export interface ColumnMetadata {
  tableName: string;
  columnName: string;
  dataType: string;
  udtName: string;
  isNullable: "YES" | "NO";
}

export interface ForeignKeyDependency {
  sourceTable: string;
  targetTable: string;
}

export interface SourceForeignKeyDependency extends ForeignKeyDependency {
  sourceColumn: string;
  targetSchema: string;
  targetColumn: string;
}

export interface ReviewedSourceOnlyColumn {
  table: string;
  column: string;
}

export interface TableMigrationEvidence {
  table: string;
  rowCount: number;
  sha256: string;
  ownership: PortfolioBridgeOwnership;
  cutoverGate: PortfolioBridgeCutoverGate;
  sourceRetained: true;
}

interface TableDigestEvidence {
  table: string;
  rowCount: number;
  sha256: string;
}

const DATA_MIGRATION_LOCK_ID = "7166271023188393202";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
export const LEGACY_COPY_BATCH_SIZE = (() => {
  const configured = Number(process.env.LEGACY_COPY_BATCH_SIZE ?? "250");
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 2_000) {
    throw new Error("LEGACY_COPY_BATCH_SIZE must be an integer between 1 and 2000");
  }
  return configured;
})();

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error("Legacy migration contains an invalid SQL identifier");
  return `"${value}"`;
}

function columnKey(column: ColumnMetadata): string {
  return `${column.tableName}.${column.columnName}`;
}

export function assertBridgeColumnCompatibility(
  source: readonly ColumnMetadata[],
  target: readonly ColumnMetadata[],
  reviewedSourceOnlyColumns: readonly ReviewedSourceOnlyColumn[],
): void {
  const sourceByKey = new Map(source.map((column) => [columnKey(column), column]));
  const targetByKey = new Map(target.map((column) => [columnKey(column), column]));
  const reviewedSourceOnly = new Set(
    reviewedSourceOnlyColumns.map(({ table, column }) => `${table}.${column}`),
  );
  if (sourceByKey.size !== source.length || targetByKey.size !== target.length) {
    throw new Error("Legacy migration column metadata contains duplicates");
  }
  const keys = new Set([...Array.from(sourceByKey.keys()), ...Array.from(targetByKey.keys())]);
  for (const key of Array.from(keys)) {
    const sourceColumn = sourceByKey.get(key);
    const targetColumn = targetByKey.get(key);
    if (sourceColumn && !targetColumn && reviewedSourceOnly.has(key)) continue;
    if (sourceColumn && !targetColumn) {
      throw new Error(`Legacy migration has an unreviewed source-only column: ${key}`);
    }
    if (!sourceColumn || !targetColumn) {
      throw new Error(`Legacy migration column missing from source or target: ${key}`);
    }
    if (
      sourceColumn.dataType !== targetColumn.dataType
      || sourceColumn.udtName !== targetColumn.udtName
      || sourceColumn.isNullable !== targetColumn.isNullable
    ) {
      throw new Error(`Legacy migration column type/nullability mismatch: ${key}`);
    }
  }
}

function reviewedSourceOnlyColumns(): ReviewedSourceOnlyColumn[] {
  return PORTFOLIO_BRIDGE_MANIFEST.flatMap((entry) => entry.ignoredLegacyColumns.map((column) => ({
    table: entry.table,
    column,
  })));
}

export function assertSourceDependenciesIsolated(
  dependencies: readonly SourceForeignKeyDependency[],
): void {
  const allowedTables = new Set(PORTFOLIO_DATA_TABLES);
  const ignoredColumns = new Set(
    reviewedSourceOnlyColumns().map(({ table, column }) => `${table}.${column}`),
  );
  for (const dependency of dependencies) {
    const targetIsCopiedPortfolioTable = dependency.targetSchema === "public"
      && allowedTables.has(dependency.targetTable);
    if (!allowedTables.has(dependency.sourceTable) || targetIsCopiedPortfolioTable) {
      continue;
    }
    if (ignoredColumns.has(`${dependency.sourceTable}.${dependency.sourceColumn}`)) continue;
    throw new Error(
      "Legacy migration has a cross-boundary dependency on a copied column: "
      + `${dependency.sourceTable}.${dependency.sourceColumn} -> `
      + `${dependency.targetTable}.${dependency.targetColumn}`,
    );
  }
}

export function orderTablesByForeignKeys(
  tables: readonly string[],
  dependencies: readonly ForeignKeyDependency[],
): string[] {
  const allowed = new Set(tables);
  const prerequisites = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const dependency of dependencies) {
    if (
      dependency.sourceTable !== dependency.targetTable
      && allowed.has(dependency.sourceTable)
      && allowed.has(dependency.targetTable)
    ) {
      prerequisites.get(dependency.sourceTable)?.add(dependency.targetTable);
    }
  }
  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = tables.filter(
      (table) => remaining.has(table)
        && Array.from(prerequisites.get(table) ?? []).every((required) => !remaining.has(required)),
    );
    if (ready.length === 0) throw new Error("Legacy migration foreign-key dependency cycle detected");
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

export function digestCanonicalRows(rows: readonly string[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(String(Buffer.byteLength(row, "utf8")));
    hash.update(":");
    hash.update(row, "utf8");
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function columnMetadata(
  client: PoolClient,
  schema: "public" | "portfolio",
): Promise<ColumnMetadata[]> {
  const result = await client.query<{
    tableName: string;
    columnName: string;
    dataType: string;
    udtName: string;
    isNullable: "YES" | "NO";
  }>(`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName",
      data_type AS "dataType",
      udt_name AS "udtName",
      is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = ANY($2::text[])
    ORDER BY table_name, ordinal_position
  `, [schema, [...PORTFOLIO_DATA_TABLES]]);
  return result.rows;
}

async function primaryKeyColumns(
  client: PoolClient,
  schema: "public" | "portfolio",
  table: string,
): Promise<string[]> {
  const result = await client.query<{ columnName: string }>(`
    SELECT attribute.attname AS "columnName"
    FROM pg_index index
    JOIN pg_class relation ON relation.oid = index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN unnest(index.indkey) WITH ORDINALITY AS key(attnum, position) ON true
    JOIN pg_attribute attribute
      ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
    WHERE index.indisprimary AND namespace.nspname = $1 AND relation.relname = $2
    ORDER BY key.position
  `, [schema, table]);
  if (result.rows.length === 0) throw new Error(`Legacy migration table has no primary key: ${table}`);
  return result.rows.map((row) => row.columnName);
}

async function targetForeignKeys(client: PoolClient): Promise<ForeignKeyDependency[]> {
  const result = await client.query<ForeignKeyDependency>(`
    SELECT source.relname AS "sourceTable", target.relname AS "targetTable"
    FROM pg_constraint dependency
    JOIN pg_class source ON source.oid = dependency.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
    JOIN pg_class target ON target.oid = dependency.confrelid
    JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace
    WHERE dependency.contype = 'f'
      AND source_namespace.nspname = 'portfolio'
      AND target_namespace.nspname = 'portfolio'
  `);
  return result.rows;
}

async function sourceForeignKeys(client: PoolClient): Promise<SourceForeignKeyDependency[]> {
  const result = await client.query<SourceForeignKeyDependency>(`
    SELECT
      source.relname AS "sourceTable",
      source_attribute.attname AS "sourceColumn",
      target_namespace.nspname AS "targetSchema",
      target.relname AS "targetTable",
      target_attribute.attname AS "targetColumn"
    FROM pg_constraint dependency
    JOIN pg_class source ON source.oid = dependency.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
    JOIN pg_class target ON target.oid = dependency.confrelid
    JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace
    JOIN LATERAL unnest(dependency.conkey) WITH ORDINALITY
      AS source_key(attribute_number, position) ON true
    JOIN LATERAL unnest(dependency.confkey) WITH ORDINALITY
      AS target_key(attribute_number, position) ON target_key.position = source_key.position
    JOIN pg_attribute source_attribute
      ON source_attribute.attrelid = source.oid
      AND source_attribute.attnum = source_key.attribute_number
    JOIN pg_attribute target_attribute
      ON target_attribute.attrelid = target.oid
      AND target_attribute.attnum = target_key.attribute_number
    WHERE dependency.contype = 'f'
      AND source_namespace.nspname = 'public'
      AND source.relname = ANY($1::text[])
  `, [PORTFOLIO_DATA_TABLES]);
  return result.rows;
}

async function tableDigest(
  client: PoolClient,
  schema: "public" | "portfolio",
  table: string,
  columns: readonly string[],
  primaryKey: readonly string[],
): Promise<TableDigestEvidence> {
  const canonicalFields = columns
    .flatMap((column) => [`'${column}'`, `${quoteIdentifier(column)}::text`])
    .join(", ");
  const hash = createHash("sha256");
  let rowCount = 0;
  for await (const batch of keysetBatches<{ canonical: string }>(
    client,
    schema,
    table,
    primaryKey,
    `jsonb_build_object(${canonicalFields})::text AS canonical`,
  )) {
    for (const row of batch) {
      hash.update(String(Buffer.byteLength(row.canonical, "utf8")));
      hash.update(":");
      hash.update(row.canonical, "utf8");
      hash.update("\n");
      rowCount += 1;
    }
  }
  return {
    table,
    rowCount,
    sha256: hash.digest("hex"),
  };
}

type KeysetRow = Record<string, unknown> & { __portfolio_key: unknown[] };

async function* keysetBatches<T extends Record<string, unknown>>(
  client: PoolClient,
  schema: "public" | "portfolio",
  table: string,
  primaryKey: readonly string[],
  projection: string,
): AsyncGenerator<T[]> {
  const schemaName = quoteIdentifier(schema);
  const tableName = quoteIdentifier(table);
  const order = primaryKey.map(quoteIdentifier).join(", ");
  const keyProjection = primaryKey.map(quoteIdentifier).join(", ");
  let lastKey: unknown[] | undefined;
  for (;;) {
    const values = lastKey ?? [];
    const where = lastKey
      ? `WHERE (${order}) > (${lastKey.map((_, index) => `$${index + 1}`).join(", ")})`
      : "";
    const limitParameter = values.length + 1;
    const result = await client.query<T & KeysetRow>(`
      SELECT ${projection}, jsonb_build_array(${keyProjection}) AS __portfolio_key
      FROM ${schemaName}.${tableName}
      ${where}
      ORDER BY ${order}
      LIMIT $${limitParameter}
    `, [...values, LEGACY_COPY_BATCH_SIZE]);
    if (result.rows.length === 0) return;
    const batch = result.rows.map((row) => {
      const { __portfolio_key: _key, ...payload } = row;
      return payload as T;
    });
    yield batch;
    const terminal = result.rows.at(-1)?.__portfolio_key;
    if (!Array.isArray(terminal) || terminal.length !== primaryKey.length) {
      throw new Error(`Legacy migration keyset cursor is invalid: ${table}`);
    }
    lastKey = terminal;
    if (result.rows.length < LEGACY_COPY_BATCH_SIZE) return;
  }
}

async function* sourceRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  primaryKey: readonly string[],
): AsyncGenerator<string[]> {
  const canonicalFields = columns
    .flatMap((column) => [`'${column}'`, quoteIdentifier(column)])
    .join(", ");
  for await (const batch of keysetBatches<{ serializedRow: string }>(
    client,
    "public",
    table,
    primaryKey,
    `jsonb_build_object(${canonicalFields})::text AS "serializedRow"`,
  )) {
    if (batch.some((row) => typeof row.serializedRow !== "string")) {
      throw new Error(`Legacy migration row serialization failed: ${table}`);
    }
    yield batch.map((row) => row.serializedRow);
  }
}

async function insertRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly string[],
): Promise<void> {
  const target = `portfolio.${quoteIdentifier(table)}`;
  const columnSql = columns.map(quoteIdentifier).join(", ");
  for (let start = 0; start < rows.length; start += LEGACY_COPY_BATCH_SIZE) {
    const batch = rows.slice(start, start + LEGACY_COPY_BATCH_SIZE);
    const serializedBatch = `[${batch.join(",")}]`;
    await client.query(
      `INSERT INTO ${target} (${columnSql})
       SELECT ${columnSql}
       FROM pg_catalog.jsonb_populate_recordset(NULL::${target}, $1::jsonb)`,
      [serializedBatch],
    );
  }
}

export async function bootstrapLegacyPortfolioData(
  source: PoolClient,
  target: PoolClient,
  options: { requireEmptyTarget?: boolean; eventSilent?: boolean } = {},
): Promise<TableMigrationEvidence[]> {
  const requireEmptyTarget = options.requireEmptyTarget ?? true;
  if (!requireEmptyTarget && options.eventSilent !== true) {
    throw new Error("Legacy final reconciliation must be explicitly event-silent");
  }
  let sourceOpen = false;
  let targetOpen = false;
  try {
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    sourceOpen = true;
    await target.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    targetOpen = true;
    await source.query("SET LOCAL TIME ZONE 'UTC'");
    await target.query("SET LOCAL TIME ZONE 'UTC'");
    if (options.eventSilent) {
      await target.query("SET LOCAL portfolio_audit.event_silent = 'on'");
    }
    await target.query(`SELECT pg_advisory_xact_lock(${DATA_MIGRATION_LOCK_ID}::bigint)`);

    const [sourceColumns, targetColumns] = await Promise.all([
      columnMetadata(source, "public"),
      columnMetadata(target, "portfolio"),
    ]);
    assertBridgeColumnCompatibility(
      sourceColumns,
      targetColumns,
      reviewedSourceOnlyColumns(),
    );
    assertSourceDependenciesIsolated(await sourceForeignKeys(source));
    const columnsByTable = new Map<string, string[]>();
    for (const column of targetColumns) {
      const columns = columnsByTable.get(column.tableName) ?? [];
      columns.push(column.columnName);
      columnsByTable.set(column.tableName, columns);
    }

    if (requireEmptyTarget) {
      for (const table of PORTFOLIO_DATA_TABLES) {
        const result = await target.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM portfolio.${quoteIdentifier(table)}`,
        );
        if (result.rows[0]?.count !== 0) {
          throw new Error(`Legacy migration target is not empty: ${table}`);
        }
      }
    }

    const order = orderTablesByForeignKeys(PORTFOLIO_DATA_TABLES, await targetForeignKeys(target));
    if (!requireEmptyTarget) {
      for (const table of [...order].reverse()) {
        await target.query(`DELETE FROM portfolio.${quoteIdentifier(table)}`);
      }
    }
    const sourceEvidence = new Map<string, TableDigestEvidence>();
    for (const table of order) {
      const columns = columnsByTable.get(table);
      if (!columns) throw new Error(`Legacy migration table is missing columns: ${table}`);
      const [sourcePrimaryKey, targetPrimaryKey] = await Promise.all([
        primaryKeyColumns(source, "public", table),
        primaryKeyColumns(target, "portfolio", table),
      ]);
      if (sourcePrimaryKey.join("\0") !== targetPrimaryKey.join("\0")) {
        throw new Error(`Legacy migration primary-key mismatch: ${table}`);
      }
      const evidence = await tableDigest(source, "public", table, columns, sourcePrimaryKey);
      sourceEvidence.set(table, evidence);
      for await (const batch of sourceRows(source, table, columns, sourcePrimaryKey)) {
        await insertRows(target, table, columns, batch);
      }
    }

    const verified: TableMigrationEvidence[] = [];
    for (const table of PORTFOLIO_DATA_TABLES) {
      const primaryKey = await primaryKeyColumns(target, "portfolio", table);
      const columns = columnsByTable.get(table);
      if (!columns) throw new Error(`Legacy migration table is missing columns: ${table}`);
      const targetEvidence = await tableDigest(target, "portfolio", table, columns, primaryKey);
      const expected = sourceEvidence.get(table);
      if (
        !expected
        || expected.rowCount !== targetEvidence.rowCount
        || expected.sha256 !== targetEvidence.sha256
      ) {
        throw new Error(
          `Legacy migration count/hash reconciliation failed: ${table} `
          + `(source=${expected?.rowCount ?? "missing"}/${expected?.sha256 ?? "missing"}, `
          + `target=${targetEvidence.rowCount}/${targetEvidence.sha256})`,
        );
      }
      const manifest = PORTFOLIO_BRIDGE_MANIFEST.find((entry) => entry.table === table);
      if (!manifest) throw new Error(`Legacy migration manifest entry is missing: ${table}`);
      verified.push({
        ...targetEvidence,
        ownership: manifest.ownership,
        cutoverGate: manifest.cutoverGate,
        sourceRetained: true,
      });
    }

    await source.query("ROLLBACK");
    sourceOpen = false;
    await target.query("COMMIT");
    targetOpen = false;
    return verified;
  } catch (error) {
    if (sourceOpen) await source.query("ROLLBACK").catch(() => undefined);
    if (targetOpen) await target.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
