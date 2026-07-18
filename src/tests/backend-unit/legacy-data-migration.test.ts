import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTFOLIO_BRIDGE_MANIFEST,
  PORTFOLIO_DATA_TABLES,
  assertBridgeColumnCompatibility,
  assertSourceDependenciesIsolated,
  digestCanonicalRows,
  orderTablesByForeignKeys,
  type ColumnMetadata,
} from "../../scripts/legacy-data-migration";

function column(overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    tableName: "projects",
    columnName: "id",
    dataType: "character varying",
    udtName: "varchar",
    isNullable: "NO",
    ...overrides,
  };
}

test("legacy bridge classifies ownership and excludes Resume/control-plane storage", () => {
  assert.equal(PORTFOLIO_DATA_TABLES.length, 23);
  for (const table of [
    "education",
    "experiences",
    "projects",
    "all_skills",
    "portfolio_skills",
    "browser_request_logs",
  ]) {
    assert.ok(PORTFOLIO_DATA_TABLES.includes(table as never), table);
  }
  for (const table of [
    "change_events",
    "resumes",
    "resume_selections",
    "constellation_skills",
    "skill_concepts",
    "portfolio_schema_migrations",
  ]) {
    assert.equal(PORTFOLIO_DATA_TABLES.includes(table as never), false, table);
  }

  const byTable = new Map(PORTFOLIO_BRIDGE_MANIFEST.map((entry) => [entry.table, entry]));
  assert.equal(byTable.get("audit_logs")?.ownership, "owned");
  assert.equal(byTable.get("education")?.ownership, "projection");
  assert.equal(byTable.get("projects")?.ownership, "hybrid");
  assert.equal(byTable.get("portfolio_skills")?.ownership, "owned");
  assert.deepEqual(byTable.get("skills_group")?.ignoredLegacyColumns, ["discipline_id"]);

  for (const entry of PORTFOLIO_BRIDGE_MANIFEST) {
    assert.equal(entry.sourcePolicy, "retain-until-explicit-retirement", entry.table);
    assert.equal(
      entry.cutoverGate,
      entry.ownership === "owned"
        ? "write-fence-and-final-hash"
        : "admin-snapshot-and-event-checkpoint",
      entry.table,
    );
  }
});

test("legacy bridge requires exact copied columns and only reviewed source-only columns", () => {
  const source = [
    column(),
    column({ columnName: "title", dataType: "text", udtName: "text" }),
  ];
  assert.doesNotThrow(() => assertBridgeColumnCompatibility(source, [...source].reverse(), []));
  assert.throws(() => assertBridgeColumnCompatibility(source, source.slice(0, 1), []), /column|missing/i);
  assert.throws(
    () => assertBridgeColumnCompatibility(
      source,
      [source[0], { ...source[1], dataType: "integer" }],
      [],
    ),
    /column|type|mismatch/i,
  );

  const sourceWithReviewedLegacyColumn = [
    ...source,
    column({ tableName: "skills_group", columnName: "discipline_id" }),
  ];
  assert.doesNotThrow(() => assertBridgeColumnCompatibility(
    sourceWithReviewedLegacyColumn,
    source,
    [{ table: "skills_group", column: "discipline_id" }],
  ));
  assert.throws(
    () => assertBridgeColumnCompatibility(sourceWithReviewedLegacyColumn, source, []),
    /unreviewed source-only column/i,
  );
});

test("legacy bridge rejects copied dependencies on another service's table", () => {
  assert.doesNotThrow(() => assertSourceDependenciesIsolated([
    {
      sourceTable: "skills_group",
      sourceColumn: "discipline_id",
      targetSchema: "public",
      targetTable: "skills_group_discipline",
      targetColumn: "id",
    },
  ]));
  assert.throws(
    () => assertSourceDependenciesIsolated([
      {
        sourceTable: "projects",
        sourceColumn: "id",
        targetSchema: "public",
        targetTable: "resumes",
        targetColumn: "project_id",
      },
    ]),
    /cross-boundary dependency/i,
  );
  assert.throws(
    () => assertSourceDependenciesIsolated([
      {
        sourceTable: "projects",
        sourceColumn: "id",
        targetSchema: "resume",
        targetTable: "projects",
        targetColumn: "id",
      },
    ]),
    /cross-boundary dependency/i,
  );
});

test("legacy import orders referenced tables first and rejects cycles", () => {
  assert.deepEqual(
    orderTablesByForeignKeys(
      ["portfolio_skills", "all_skills", "skills_group"],
      [
        { sourceTable: "portfolio_skills", targetTable: "all_skills" },
        { sourceTable: "all_skills", targetTable: "skills_group" },
      ],
    ),
    ["skills_group", "all_skills", "portfolio_skills"],
  );
  assert.throws(
    () => orderTablesByForeignKeys(
      ["projects", "xyz_bullets"],
      [
        { sourceTable: "projects", targetTable: "xyz_bullets" },
        { sourceTable: "xyz_bullets", targetTable: "projects" },
      ],
    ),
    /cycle/i,
  );
});

test("legacy import row digest is ordered and boundary-safe", () => {
  assert.equal(digestCanonicalRows(["{\"id\":1}", "{\"id\":2}"]), digestCanonicalRows(["{\"id\":1}", "{\"id\":2}"]));
  assert.notEqual(digestCanonicalRows(["ab", "c"]), digestCanonicalRows(["a", "bc"]));
  assert.notEqual(digestCanonicalRows(["a", "b"]), digestCanonicalRows(["b", "a"]));
});
