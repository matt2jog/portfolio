import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, sql } from "drizzle-orm";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for backend integration tests");
}
process.env.DATABASE_URL = databaseUrl;

const { db, pool } = await import("../../backend/data/db");
const { allSkills, auditLogs, portfolioSkills, skillsGroup, users } = await import("../../shared/schema");
const { registerRoutes } = await import("../../backend/routes");

after(async () => {
  await pool.end();
});

test("pool connects and returns scalar from SELECT 1", async () => {
  const { rows } = await pool.query<{ value: number }>("SELECT 1::int AS value");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 1);
});

test("drizzle can read the users table (count >= 0)", async () => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  assert.equal(typeof row.count, "number");
  assert.ok(row.count >= 0);
});

test("skill presentation updates reject missing skills and dangling groups", async () => {
  const adminId = `integration-admin-${randomUUID()}`;
  const skillId = randomUUID();
  const groupId = randomUUID();
  const missingGroupId = randomUUID();

  await db.insert(skillsGroup).values({ id: groupId, name: "Integration group" });
  await db.insert(allSkills).values({ id: skillId, name: "Integration skill" });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: adminId,
      email: "portfolio-integration@example.invalid",
      googleSub: "integration-test",
      name: "Portfolio integration test",
      role: "admin",
    };
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const update = (id: string, groupingId: string | null) => fetch(
    `http://127.0.0.1:${port}/api/admin/all-skills/${id}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupingId }),
    },
  );

  try {
    const valid = await update(skillId, groupId);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).groupingId, groupId);

    const dangling = await update(skillId, missingGroupId);
    assert.equal(dangling.status, 400);
    assert.deepEqual(await dangling.json(), { message: "Invalid skills_group reference" });

    const [preserved] = await db
      .select({ groupingId: allSkills.groupingId })
      .from(allSkills)
      .where(eq(allSkills.id, skillId));
    assert.equal(preserved.groupingId, groupId);

    const missing = await update(randomUUID(), null);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { message: "Skill not found" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.delete(auditLogs).where(eq(auditLogs.userId, adminId));
    await db.delete(allSkills).where(eq(allSkills.id, skillId));
    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
  }
});

test("skill relationships are enforced by the database and remain safe across deletes", async () => {
  const constraints = await pool.query<{ conname: string }>(`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'all_skills_grouping_id_skills_group_id_fk',
      'portfolio_skills_all_skill_id_all_skills_id_fk'
    )
    ORDER BY conname
  `);
  assert.deepEqual(constraints.rows.map((row) => row.conname), [
    "all_skills_grouping_id_skills_group_id_fk",
    "portfolio_skills_all_skill_id_all_skills_id_fk",
  ]);

  const groupId = randomUUID();
  const skillId = randomUUID();
  const portfolioSkillId = randomUUID();
  const missingGroupId = randomUUID();

  await db.insert(skillsGroup).values({ id: groupId, name: "Integrity group" });
  await db.insert(allSkills).values({ id: skillId, name: "Integrity skill", groupingId: groupId });
  await db.insert(portfolioSkills).values({ id: portfolioSkillId, allSkillId: skillId });

  try {
    await assert.rejects(
      db.insert(allSkills).values({ id: randomUUID(), name: "Dangling skill", groupingId: missingGroupId }),
      (error: unknown) => {
        const cause = error instanceof Error && error.cause && typeof error.cause === "object"
          ? error.cause as { code?: unknown; constraint?: unknown }
          : undefined;
        return cause?.code === "23503"
          && cause.constraint === "all_skills_grouping_id_skills_group_id_fk";
      },
    );

    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
    const [unlinked] = await db
      .select({ groupingId: allSkills.groupingId })
      .from(allSkills)
      .where(eq(allSkills.id, skillId));
    assert.equal(unlinked.groupingId, null);

    await db.delete(allSkills).where(eq(allSkills.id, skillId));
    const [orphanedPortfolioSkill] = await db
      .select({ id: portfolioSkills.id })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.id, portfolioSkillId));
    assert.equal(orphanedPortfolioSkill, undefined);
  } finally {
    await db.delete(portfolioSkills).where(eq(portfolioSkills.id, portfolioSkillId));
    await db.delete(allSkills).where(eq(allSkills.id, skillId));
    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
  }
});
