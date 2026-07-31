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

test("Portfolio skill membership accepts valid groups and rejects dangling references", async () => {
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
  const createMembership = (allSkillId: string, groupId: string | null) => fetch(
    `http://127.0.0.1:${port}/api/admin/skills`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allSkillId, groupId }),
    },
  );

  try {
    const valid = await createMembership(skillId, groupId);
    assert.equal(valid.status, 200);
    const created = await valid.json() as { id: string; groupId: string };
    assert.equal(created.groupId, groupId);

    const dangling = await createMembership(randomUUID(), missingGroupId);
    assert.equal(dangling.status, 400);
    assert.deepEqual(await dangling.json(), { message: "Invalid all_skill reference" });

    const duplicate = await createMembership(skillId, groupId);
    assert.equal(duplicate.status, 409);

    const invalidMove = await fetch(
      `http://127.0.0.1:${port}/api/admin/skills/${created.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: missingGroupId }),
      },
    );
    assert.equal(invalidMove.status, 400);
    assert.deepEqual(await invalidMove.json(), { message: "Invalid skills_group reference" });

    const [preserved] = await db
      .select({ groupId: portfolioSkills.groupId })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.id, created.id));
    assert.equal(preserved.groupId, groupId);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.delete(auditLogs).where(eq(auditLogs.userId, adminId));
    await db.delete(portfolioSkills).where(eq(portfolioSkills.allSkillId, skillId));
    await db.delete(allSkills).where(eq(allSkills.id, skillId));
    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
  }
});

test("skill relationships are enforced by the database and remain safe across deletes", async () => {
  const constraints = await pool.query<{ conname: string; confdeltype: string }>(`
    SELECT conname, confdeltype
    FROM pg_constraint
    WHERE conname IN (
      'portfolio_skills_group_id_skills_group_id_fk',
      'portfolio_skills_all_skill_id_all_skills_id_fk'
    )
    ORDER BY conname
  `);
  assert.deepEqual(constraints.rows, [
    {
      conname: "portfolio_skills_all_skill_id_all_skills_id_fk",
      confdeltype: "r",
    },
    {
      conname: "portfolio_skills_group_id_skills_group_id_fk",
      confdeltype: "n",
    },
  ]);

  const groupId = randomUUID();
  const skillId = randomUUID();
  const danglingSkillId = randomUUID();
  const portfolioSkillId = randomUUID();
  const missingGroupId = randomUUID();

  await db.insert(skillsGroup).values({ id: groupId, name: "Integrity group" });
  await db.insert(allSkills).values([
    { id: skillId, name: "Integrity skill" },
    { id: danglingSkillId, name: "Dangling integrity skill" },
  ]);
  await db.insert(portfolioSkills).values({ id: portfolioSkillId, allSkillId: skillId, groupId });

  try {
    await assert.rejects(
      db.insert(portfolioSkills).values({
        id: randomUUID(),
        allSkillId: skillId,
        groupId,
      }),
      (error: unknown) => {
        const cause = error instanceof Error && error.cause && typeof error.cause === "object"
          ? error.cause as { code?: unknown; constraint?: unknown }
          : undefined;
        return cause?.code === "23505"
          && cause.constraint === "portfolio_skills_active_skill_uidx";
      },
    );

    await assert.rejects(
      db.insert(portfolioSkills).values({
        id: randomUUID(),
        allSkillId: danglingSkillId,
        groupId: missingGroupId,
      }),
      (error: unknown) => {
        const cause = error instanceof Error && error.cause && typeof error.cause === "object"
          ? error.cause as { code?: unknown; constraint?: unknown }
          : undefined;
        return cause?.code === "23503"
          && cause.constraint === "portfolio_skills_group_id_skills_group_id_fk";
      },
    );

    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
    const [unlinked] = await db
      .select({ groupId: portfolioSkills.groupId })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.id, portfolioSkillId));
    assert.equal(unlinked.groupId, null);

    await assert.rejects(
      db.delete(allSkills).where(eq(allSkills.id, skillId)),
      (error: unknown) => {
        const cause = error instanceof Error && error.cause && typeof error.cause === "object"
          ? error.cause as { code?: unknown; constraint?: unknown }
          : undefined;
        return cause?.code === "23503"
          && cause.constraint === "portfolio_skills_all_skill_id_all_skills_id_fk";
      },
    );
    const [preservedPortfolioSkill] = await db
      .select({ id: portfolioSkills.id })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.id, portfolioSkillId));
    assert.equal(preservedPortfolioSkill?.id, portfolioSkillId);
  } finally {
    await db.delete(portfolioSkills).where(eq(portfolioSkills.id, portfolioSkillId));
    await db.delete(allSkills).where(sql`${allSkills.id} IN (${skillId}, ${danglingSkillId})`);
    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
  }
});
