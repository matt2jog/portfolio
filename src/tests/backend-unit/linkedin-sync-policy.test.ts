import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("production code has no paid LinkedIn synchronization or loose provider credential", () => {
  const implementation = readFileSync(path.join(root, "src", "backend", "linkedin.ts"), "utf8");

  assert.doesNotMatch(
    implementation,
    /APIFY_|apify|LINKEDIN_(?:PROVIDER|SYNC_)/i,
  );
  assert.equal(
    existsSync(path.join(root, "src", "backend", "linkedin-sync-policy.ts")),
    false,
  );
});
