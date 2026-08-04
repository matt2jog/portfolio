import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMigrationPlan } from "../../scripts/migration-ledger";
import {
  portfolioDatabaseBoundary,
  renderPortfolioMigrationSql,
} from "../../shared/database-boundary";

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

test("migration plan normalizes CRLF before checksumming and execution", () => {
  const lfFolder = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-lf-"));
  const crlfFolder = mkdtempSync(path.join(tmpdir(), "portfolio-migrations-crlf-"));
  const lfSql = "BEGIN;\nSELECT 1;\nCOMMIT;\n";
  const crlfSql = lfSql.replace(/\n/g, "\r\n");

  try {
    writeFileSync(path.join(lfFolder, "001_first.sql"), lfSql);
    writeFileSync(path.join(crlfFolder, "001_first.sql"), crlfSql);

    const [lfMigration] = loadMigrationPlan(lfFolder);
    const [crlfMigration] = loadMigrationPlan(crlfFolder);

    assert.equal(crlfMigration?.sql, lfMigration?.sql);
    assert.equal(crlfMigration?.sql, lfSql);
    assert.equal(crlfMigration?.checksum, lfMigration?.checksum);
    assert.equal(
      crlfMigration?.checksum,
      createHash("sha256").update(lfSql).digest("hex"),
    );
  } finally {
    rmSync(lfFolder, { recursive: true, force: true });
    rmSync(crlfFolder, { recursive: true, force: true });
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

test("the full staging plan renders separately while retaining source checksums", () => {
  const plan = loadMigrationPlan(path.resolve("src", "migrations"));
  const boundary = portfolioDatabaseBoundary({ DEPLOYMENT_STAGE: "staging" });
  const rendered = plan.map((migration) => {
    const before = migration.checksum;
    const sql = renderPortfolioMigrationSql(migration.sql, boundary);
    assert.equal(
      createHash("sha256").update(migration.sql).digest("hex"),
      before,
    );
    return sql;
  }).join("\n");

  assert.match(rendered, /portfolio_staging/);
  assert.match(rendered, /resume_staging_app/);
  assert.match(rendered, /resume_staging_owner/);
  assert.doesNotMatch(rendered, /\bportfolio\./);
  assert.doesNotMatch(rendered, /\bresume_app\b/);
  assert.doesNotMatch(rendered, /\bresume_owner\b/);
  assert.doesNotMatch(rendered, /\badmin_runtime\b/);
  assert.doesNotMatch(rendered, /\bportfolio_runtime\b/);
  assert.doesNotMatch(rendered, /\bportfolio_migrator\b/);
  assert.doesNotMatch(rendered, /\bSCHEMA portfolio\b/);
  assert.doesNotMatch(
    rendered,
    /\bSET LOCAL search_path = portfolio, extensions, public\b/,
  );
  assert.doesNotMatch(
    rendered,
    /\bSET LOCAL search_path TO portfolio, pg_catalog\b/,
  );
  assert.match(rendered, /INSERT INTO users/);
  assert.match(rendered, /matching_administrators <> 1/);
  assert.match(rendered, /admin_staging_runtime/);
  assert.match(rendered, /REVOKE INSERT, UPDATE, DELETE ON TABLE/);
});
