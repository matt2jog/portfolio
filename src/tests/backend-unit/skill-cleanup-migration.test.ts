import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("the forward skill cleanup removes only the disproven Pub/Sub concept", () => {
  const migration = readFileSync(
    path.resolve(
      process.cwd(),
      "src",
      "migrations",
      "007_remove_false_pubsub_skill.sql",
    ),
    "utf8",
  );

  assert.match(migration, /lower\(btrim\(skill\.name\)\) = 'gcp pubsub'/);
  assert.match(migration, /DELETE FROM all_skills/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /PARTITION BY membership\.group_id/);
});
