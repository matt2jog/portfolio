import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("migration entrypoint emits one bounded completion event on failure", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/scripts/migrate.ts"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUD_RUN_EXECUTION: "portfolio-migration-test",
        DATABASE_URL: "",
        NODE_ENV: "production",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 1);
  const completion = JSON.parse(lines[0]!);
  assert.deepEqual({ ...completion, duration_ms: 0 }, {
    duration_ms: 0,
    event: "job_completed",
    failure_code: "migration_failed",
    job: "portfolio_migration",
    run_id: "portfolio-migration-test",
    status: "failed",
  });
  assert.equal(typeof completion.duration_ms, "number");
});
