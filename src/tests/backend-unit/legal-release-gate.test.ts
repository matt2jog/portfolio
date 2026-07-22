import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.resolve(root, relativePath), "utf8");
}

function jobBlock(workflow: string, jobId: string): string {
  const match = workflow.match(
    new RegExp(
      `\\n  ${jobId}:\\r?\\n[\\s\\S]*?(?=\\n  [A-Za-z0-9_-]+:\\r?\\n|$)`,
    ),
  );
  assert.ok(match, `missing ${jobId} job`);
  return match[0];
}

test("production mutation depends on the reusable legal audit gate", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const gate = jobBlock(deploy, "legal_audit");
  const prepare = jobBlock(deploy, "prepare_release");
  const release = jobBlock(deploy, "release");

  assert.match(gate, /uses:\s*\.\/\.github\/workflows\/legal-audit\.yml/);
  assert.match(gate, /source_sha:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(prepare, /needs:\s*legal_audit/);
  assert.match(release, /needs:\s*prepare_release/);
});

test("legal audit cannot drift to a moving or stale checkout", () => {
  const workflow = read(".github/workflows/legal-audit.yml");

  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request(?:_target)?:/);
  assert.match(
    workflow,
    /uses:\s*actions\/checkout@[0-9a-f]{40}[\s\S]*?ref:\s*\$\{\{\s*inputs\.source_sha\s*\}\}/,
  );
  assert.match(workflow, /test "\$SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.doesNotMatch(workflow, /ref:\s*(?:main|refs\/heads\/main)\s*$/m);
});

test("the caller SHA is validated, timestamped, and recorded exactly", () => {
  const workflow = read(".github/workflows/legal-audit.yml");

  assert.match(
    workflow,
    /source_sha:[\s\S]*?required:\s*true[\s\S]*?type:\s*string/,
  );
  assert.match(workflow, /SOURCE_SHA:\s*\$\{\{\s*inputs\.source_sha\s*\}\}/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /git show -s --format=%cI "\$SOURCE_SHA"/);
  assert.match(
    workflow,
    /GITHUB_SHA="\$SOURCE_SHA"[\s\S]*?npm run legal:record:bundle/,
  );
});

test("audit failures cannot be converted into a successful production release", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const legal = read(".github/workflows/legal-audit.yml");
  const gate = jobBlock(deploy, "legal_audit");
  const release = jobBlock(deploy, "release");
  const record = jobBlock(legal, "record");
  const releaseHeader = release.slice(0, release.indexOf("\n    steps:"));

  assert.doesNotMatch(
    record.slice(0, record.indexOf("\n    steps:")),
    /\n\s+if:/,
  );
  assert.doesNotMatch(gate, /continue-on-error|if:\s*always\(\)|\|\|\s*true/);
  assert.doesNotMatch(releaseHeader, /if:\s*always\(\)|if:\s*failure\(\)/);
  assert.doesNotMatch(record, /continue-on-error|\|\|\s*true/);
  assert.match(record, /set -euo pipefail/);
  assert.match(record, /gcloud secrets versions access/);
  assert.match(record, /npm run legal:record:bundle/);
});

test("every direct and reusable legal caller uses its distinct exact-workflow provider", () => {
  const workflow = read(".github/workflows/legal-audit.yml");
  const deploy = jobBlock(read(".github/workflows/deploy.yml"), "legal_audit");
  const dataMigration = jobBlock(read(".github/workflows/data-migration.yml"), "legal_audit");
  const cleanup = jobBlock(read(".github/workflows/release-cleanup.yml"), "legal_audit");
  const reusableMode = workflow.match(/reusable\)([\s\S]*?)\s+;;/);

  assert.ok(reusableMode, "missing reusable identity mode");

  assert.match(workflow, /providers\/portfolio-legal-audit-main/);
  assert.match(workflow, /providers\/portfolio-legal-reusable-main/);
  assert.match(workflow, /providers\/portfolio-legal-migrate-main/);
  assert.match(workflow, /providers\/portfolio-legal-cleanup-main/);
  assert.match(deploy, /identity_mode:\s*reusable/);
  assert.match(dataMigration, /identity_mode:\s*data_migration/);
  assert.match(cleanup, /identity_mode:\s*release_cleanup/);
  assert.match(
    workflow,
    /reusable\)\s+test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"\s+;;/,
  );
  assert.match(
    workflow,
    /data_migration\|release_cleanup\|dispatch\)\s+test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"\s+;;/,
  );
  assert.doesNotMatch(
    reusableMode[1],
    /(?:push|workflow_run)/,
  );
  assert.match(workflow, /test "\$GITHUB_REPOSITORY" = "matt2jog\/portfolio"/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
});
