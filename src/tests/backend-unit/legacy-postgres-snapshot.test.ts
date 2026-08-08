import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readRepeatableReadSnapshot } from "../../scripts/legacy-postgres-snapshot";

test("every legacy table export uses the connected snapshot client", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "scripts", "transfer-career-data.ts"),
    "utf8",
  );
  assert.match(source, /readRepeatableReadSnapshot\(connected/);
  assert.match(source, /await connected\.query<TransferRow>/);
  assert.doesNotMatch(source, /pool\.query/);
});

test("legacy career export reads and commits one read-only repeatable snapshot", async () => {
  const events: string[] = [];
  const client = {
    async query(sql: string) {
      events.push(sql);
      return {};
    },
  };

  const result = await readRepeatableReadSnapshot(client, async () => {
    events.push("SELECT projects");
    events.push("SELECT experiences");
    return "snapshot";
  });

  assert.equal(result, "snapshot");
  assert.deepEqual(events, [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SELECT projects",
    "SELECT experiences",
    "COMMIT",
  ]);
});

test("legacy career export rolls its snapshot back on a read failure", async () => {
  const events: string[] = [];
  const client = {
    async query(sql: string) {
      events.push(sql);
      return {};
    },
  };

  await assert.rejects(
    readRepeatableReadSnapshot(client, async () => {
      events.push("SELECT projects");
      throw new Error("read failed");
    }),
    /read failed/,
  );
  assert.deepEqual(events, [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SELECT projects",
    "ROLLBACK",
  ]);
});

test("legacy career export reports both read and rollback failures", async () => {
  const client = {
    async query(sql: string) {
      if (sql === "ROLLBACK") throw new Error("rollback failed");
      return {};
    },
  };

  await assert.rejects(
    readRepeatableReadSnapshot(client, async () => {
      throw new Error("read failed");
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /could not be rolled back/);
      assert.equal(error.errors.length, 2);
      return true;
    },
  );
});
