import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMigrationPlan } from "../../scripts/migration-ledger";

test("migration plan is filename-ordered and checksums exact SQL", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-"));
  try {
    writeFileSync(path.join(folder, "002_second.sql"), "SELECT 2;\n");
    writeFileSync(path.join(folder, "001_first.sql"), "SELECT 1;\n");
    const plan = loadMigrationPlan(folder);
    assert.deepEqual(plan.map((migration) => migration.version), [
      "001_first",
      "002_second",
    ]);
    assert.equal(
      plan[0]?.checksum,
      createHash("sha256").update("SELECT 1;\n").digest("hex"),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("migration plan rejects missing and malformed migration files", () => {
  const empty = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-empty-"));
  const malformed = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-bad-"));
  try {
    writeFileSync(path.join(malformed, "notes.sql"), "SELECT 1;");
    assert.throws(() => loadMigrationPlan(empty), /No Portfolio migrations/);
    assert.throws(() => loadMigrationPlan(malformed), /Invalid Portfolio migration filename/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(malformed, { recursive: true, force: true });
  }
});
