import { after, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, pool } from "../../backend/data/db";
import { users } from "../../shared/schema";

after(async () => {
  await pool.end();
});

test("pool connects and returns scalar from SELECT 1", async () => {
  const { rows } = await pool.query<{ value: number }>("SELECT 1::int AS value");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 1);
});

test("drizzle can read the users table (count >= 0)", async () => {
  // Read action: confirms the users table exists, that drizzle's connection
  // is wired correctly, and that the schema in src/shared matches the DB.
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  assert.equal(typeof row.count, "number");
  assert.ok(row.count >= 0);
});
