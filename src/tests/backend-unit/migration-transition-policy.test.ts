import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { CanonicalLedgerRow, PortfolioMigration } from "../../scripts/migration-ledger";
import {
  PORTFOLIO_MIGRATION_POLICY,
  assertMigrationTransitionAllowed,
  migrationPolicyDigest,
  type MigrationTransitionPolicy,
} from "../../scripts/migration-transition-policy";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

const plan = loadMigrationPlan(path.resolve(process.cwd(), "src", "migrations"));
const historicalCount = PORTFOLIO_MIGRATION_POLICY.historicalBatch.migrationCount;

function ledgerRows(migrations: readonly PortfolioMigration[]): CanonicalLedgerRow[] {
  return migrations.map((migration) => ({
    filename: migration.filename,
    journalTimestamp: String(migration.journalTimestamp),
    checksum: migration.checksum,
  }));
}

function mutablePolicy(): MigrationTransitionPolicy {
  return structuredClone(PORTFOLIO_MIGRATION_POLICY) as MigrationTransitionPolicy;
}

test("the executable migration runner gates the existing ledger API", () => {
  const runner = readFileSync(
    path.resolve(process.cwd(), "src", "scripts", "migrate.ts"),
    "utf8",
  );
  assert.match(runner, /withMigrationTransitionPolicy\([\s\S]+applyPortfolioMigrations/);
});

test("the historical batch may make its first cutover only on a truly empty target", () => {
  assert.equal(historicalCount, 15);
  assert.deepEqual(
    assertMigrationTransitionAllowed(plan, [], true),
    { completed: 0, pending: plan.length, mode: "empty-first-cutover" },
  );
  assert.throws(
    () => assertMigrationTransitionAllowed(plan, [], false),
    /historical 0000-0014 batch.*truly empty.*target/i,
  );
});

test("every nonempty partial historical prefix fails closed", () => {
  for (let prefixLength = 1; prefixLength < historicalCount; prefixLength++) {
    assert.throws(
      () => assertMigrationTransitionAllowed(
        plan,
        ledgerRows(plan.slice(0, prefixLength)),
        false,
      ),
      new RegExp(`historical 0000-0014 batch.*partial prefix ${prefixLength}/${historicalCount}`, "i"),
    );
  }
});

test("the complete checksum-bound historical ledger is an allowed no-op", () => {
  const rows = ledgerRows(plan);
  assert.deepEqual(
    assertMigrationTransitionAllowed(plan, rows, false),
    { completed: plan.length, pending: 0, mode: "no-op" },
  );

  rows[11] = { ...rows[11], checksum: "0".repeat(64) };
  assert.throws(
    () => assertMigrationTransitionAllowed(plan, rows, false),
    /checksum|drift/i,
  );
});

test("0015 and 0016 are explicit checksum-bound additive migrations after the historical batch", () => {
  assert.equal(plan[historicalCount].filename, "0015_career_pubsub_consumer.sql");
  assert.equal(
    PORTFOLIO_MIGRATION_POLICY.migrations[historicalCount].classification,
    "additive",
  );
  assert.equal(
    plan[historicalCount + 1].filename,
    "0016_database_audit_compensation.sql",
  );
  assert.equal(
    PORTFOLIO_MIGRATION_POLICY.migrations[historicalCount + 1].classification,
    "additive",
  );
  assert.deepEqual(
    assertMigrationTransitionAllowed(
      plan,
      ledgerRows(plan.slice(0, historicalCount)),
      false,
    ),
    {
      completed: historicalCount,
      pending: plan.length - historicalCount,
      mode: "additive",
    },
  );
});

test("an unknown future migration has no implicit classification", () => {
  const futurePlan = [
    ...plan,
    {
      filename: "0017_unreviewed.sql",
      journalTimestamp: plan.at(-1)!.journalTimestamp + 1,
      checksum: "a".repeat(64),
      statements: ["ALTER TABLE projects ADD COLUMN summary text"],
    },
  ];

  assert.throws(
    () => assertMigrationTransitionAllowed(futurePlan, ledgerRows(plan), false),
    /0017_unreviewed\.sql.*explicit reviewed classification/i,
  );
});

test("a checksum-bound future additive migration requires an updated reviewed policy", () => {
  const future: PortfolioMigration = {
    filename: "0017_add_summary.sql",
    journalTimestamp: plan.at(-1)!.journalTimestamp + 1,
    checksum: "c".repeat(64),
    statements: ["ALTER TABLE projects ADD COLUMN summary text"],
  };
  const additivePolicy = mutablePolicy();
  additivePolicy.migrations.push({
    filename: future.filename,
    journalTimestamp: future.journalTimestamp,
    checksum: future.checksum,
    classification: "additive",
  });

  assert.deepEqual(
    assertMigrationTransitionAllowed([...plan, future], ledgerRows(plan), false, {
      policy: additivePolicy,
      reviewedPolicyDigest: migrationPolicyDigest(additivePolicy),
    }),
    { completed: plan.length, pending: 1, mode: "additive" },
  );
});

test("reviewed classification drift is rejected even when filenames and checksums match", () => {
  const policy = mutablePolicy();
  policy.migrations[11].classification = "additive";

  assert.throws(
    () => assertMigrationTransitionAllowed(plan, [], true, { policy }),
    /reviewed migration policy.*digest.*drift/i,
  );
});

test("unknown classifications and data repairs fail closed with actionable diagnostics", () => {
  const unknownPolicy = mutablePolicy();
  unknownPolicy.migrations[11].classification = "online" as "additive";
  assert.throws(
    () => assertMigrationTransitionAllowed(plan, [], true, {
      policy: unknownPolicy,
      reviewedPolicyDigest: migrationPolicyDigest(unknownPolicy),
    }),
    /unknown migration classification.*online/i,
  );

  const future: PortfolioMigration = {
    filename: "0017_repair.sql",
    journalTimestamp: plan.at(-1)!.journalTimestamp + 1,
    checksum: "b".repeat(64),
    statements: ["UPDATE projects SET position = 0 WHERE position < 0"],
  };
  const repairPolicy = mutablePolicy();
  repairPolicy.migrations.push({
    filename: future.filename,
    journalTimestamp: future.journalTimestamp,
    checksum: future.checksum,
    classification: "data-repair",
  });

  assert.throws(
    () => assertMigrationTransitionAllowed([...plan, future], ledgerRows(plan), false, {
      policy: repairPolicy,
      reviewedPolicyDigest: migrationPolicyDigest(repairPolicy),
    }),
    /data-repair.*separate reviewed path.*expected counts.*hashes.*maximum threshold/i,
  );
});
