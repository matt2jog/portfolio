import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCanonicalLedgerPrefix,
  assertLegacyLedgerPrefix,
  loadMigrationPlan,
} from "../../scripts/migration-ledger";

function fixture(entries: Array<{ idx: number; tag: string; when: number; sql: string }>): string {
  const root = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-"));
  mkdirSync(path.join(root, "meta"));
  writeFileSync(path.join(root, "meta", "_journal.json"), JSON.stringify({
    version: "7",
    dialect: "postgresql",
    entries: entries.map(({ idx, tag, when }) => ({
      idx,
      version: "7",
      when,
      tag,
      breakpoints: true,
    })),
  }));
  for (const entry of entries) {
    writeFileSync(path.join(root, `${entry.tag}.sql`), entry.sql);
  }
  return root;
}

test("migration plan uses journal order and line-ending-normalized checksums", () => {
  const root = fixture([
    { idx: 0, tag: "0000_first", when: 200, sql: "SELECT 1;\r\n--> statement-breakpoint\r\nSELECT 2;\r\n" },
    { idx: 1, tag: "0001_second", when: 100, sql: "SELECT 3;\n" },
  ]);
  try {
    const plan = loadMigrationPlan(root);
    assert.deepEqual(plan.map(({ filename, journalTimestamp }) => ({ filename, journalTimestamp })), [
      { filename: "0000_first.sql", journalTimestamp: 200 },
      { filename: "0001_second.sql", journalTimestamp: 100 },
    ]);
    assert.equal(
      plan[0].checksum,
      createHash("sha256").update("SELECT 1;\n--> statement-breakpoint\nSELECT 2;\n").digest("hex"),
    );
    assert.deepEqual(plan[0].statements, ["SELECT 1;", "SELECT 2;"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration plan rejects journal gaps, duplicate timestamps, and unjournaled SQL", () => {
  const gap = fixture([{ idx: 1, tag: "0001_gap", when: 100, sql: "SELECT 1;" }]);
  const duplicate = fixture([
    { idx: 0, tag: "0000_first", when: 100, sql: "SELECT 1;" },
    { idx: 1, tag: "0001_second", when: 100, sql: "SELECT 2;" },
  ]);
  const extra = fixture([{ idx: 0, tag: "0000_first", when: 100, sql: "SELECT 1;" }]);
  writeFileSync(path.join(extra, "9999_unjournaled.sql"), "SELECT 9;");
  try {
    assert.throws(() => loadMigrationPlan(gap), /contiguous|index/i);
    assert.throws(() => loadMigrationPlan(duplicate), /timestamp|duplicate/i);
    assert.throws(() => loadMigrationPlan(extra), /unjournaled|extra/i);
  } finally {
    for (const root of [gap, duplicate, extra]) rmSync(root, { recursive: true, force: true });
  }
});

test("canonical and legacy ledgers accept only an exact migration prefix", () => {
  const root = fixture([
    { idx: 0, tag: "0000_first", when: 200, sql: "SELECT 1;\n" },
    { idx: 1, tag: "0001_second", when: 100, sql: "SELECT 2;\n" },
  ]);
  try {
    const plan = loadMigrationPlan(root);
    assert.equal(assertCanonicalLedgerPrefix(plan, [{
      filename: plan[0].filename,
      journalTimestamp: String(plan[0].journalTimestamp),
      checksum: plan[0].checksum,
    }]), 1);
    assert.equal(assertLegacyLedgerPrefix(plan, [{
      hash: plan[0].checksum,
      createdAt: String(plan[0].journalTimestamp),
    }]), 1);

    assert.throws(() => assertCanonicalLedgerPrefix(plan, [{
      filename: plan[1].filename,
      journalTimestamp: String(plan[1].journalTimestamp),
      checksum: plan[1].checksum,
    }]), /prefix|gap/i);
    assert.throws(() => assertCanonicalLedgerPrefix(plan, [{
      filename: plan[0].filename,
      journalTimestamp: String(plan[0].journalTimestamp),
      checksum: "0".repeat(64),
    }]), /checksum|drift/i);
    assert.throws(() => assertLegacyLedgerPrefix(plan, [
      { hash: plan[0].checksum, createdAt: String(plan[0].journalTimestamp) },
      { hash: "f".repeat(64), createdAt: "999" },
    ]), /extra|unknown|drift/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
