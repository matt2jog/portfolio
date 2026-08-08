import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

test("the career schema is one checksum-pinned canonical migration", () => {
  const plan = loadMigrationPlan(path.resolve("src", "migrations"));
  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.version, "001_initial");
  assert.equal(plan[0]?.checksum, createHash("sha256").update(plan[0]!.sql).digest("hex"));
  assert.match(plan[0]!.sql, /CREATE VIEW resume_projects/);
  assert.match(plan[0]!.sql, /CHECK \(lower\(trim\(name\)\) <> 'gcp pubsub'\)/);
});

test("migration loading normalizes line endings and rejects parallel histories", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-"));
  try {
    writeFileSync(path.join(folder, "001_initial.sql"), "SELECT 1;\r\n");
    assert.equal(loadMigrationPlan(folder)[0]?.sql, "SELECT 1;\n");
    writeFileSync(path.join(folder, "002_extra.sql"), "SELECT 2;\n");
    assert.throws(() => loadMigrationPlan(folder), /exactly one canonical career migration/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
