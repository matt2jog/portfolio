import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { authRoutes, requireAdmin, requireAuth } from "./auth";
import { db } from "./db";
import {
  bio,
  insertBioSchema,
  insertProjectSchema,
  insertSkillSchema,
  projects,
  skills,
  updateProjectSchema,
  updateSkillSchema,
  auditLogs,
  xyzBullets,
} from "@shared/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/auth/google", authRoutes.start);
  app.get("/auth/google/callback", authRoutes.callback);

  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({
      id: req.user?.id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.role,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/public/projects", async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NULL`)
      .orderBy(asc(projects.position));
    res.json(await hydrateProjectsWithBullets(rows));
  });

  app.get("/api/public/bio", async (_req, res) => {
    const [row] = await db.select().from(bio)
      .orderBy(desc(bio.createdAt))
      .limit(1);
    res.json(row || { headline: "", description: "", paragraph: "" });
  });

  app.get("/api/public/skills", async (_req, res) => {
    const rows = await db.select().from(skills)
      .where(sql`${skills.deletedAt} IS NULL`)
      .orderBy(asc(skills.position));
    res.json(rows);
  });

  app.get("/api/public/ip", (req, res) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]?.trim() || req.ip;
    res.json({ ip });
  });

  app.get("/api/admin/projects", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NULL`)
      .orderBy(asc(projects.position));
    res.json(await hydrateProjectsWithBullets(rows));
  });

  app.post("/api/admin/projects", requireAdmin, async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const projectBullets = normalizeBullets(req.body?.xyzBullets);

    const [maxRow] = await db
      .select({ max: sql<number>`max(${projects.position})` })
      .from(projects);
    const nextPos = (maxRow?.max ?? 0) + 1;

    const [created] = await db
      .insert(projects)
      .values({ ...parsed.data, position: nextPos })
      .returning();

    if (projectBullets.length > 0) {
      await db.insert(xyzBullets).values(
        projectBullets.map((bulletText) => ({
          projectId: created.id,
          bulletText,
        })),
      );
    }

    await logAudit(req, "project.create", { ...created, xyzBullets: projectBullets });
    res.json({ ...created, xyzBullets: projectBullets });
  });

  app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
    const projectId = routeId(req.params.id);
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const projectBullets = normalizeBullets(req.body?.xyzBullets);

    const [updated] = await db
      .update(projects)
      .set(parsed.data)
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Project not found" });
    }

    await db.delete(xyzBullets).where(eq(xyzBullets.projectId, projectId));
    if (projectBullets.length > 0) {
      await db.insert(xyzBullets).values(
        projectBullets.map((bulletText) => ({
          projectId,
          bulletText,
        })),
      );
    }

    await logAudit(req, "project.update", { id: projectId, ...parsed.data, xyzBullets: projectBullets });
    res.json({ ...updated, xyzBullets: projectBullets });
  });

  app.delete("/api/admin/projects/:id", requireAdmin, async (req, res) => {
    const projectId = routeId(req.params.id);
    await db.update(projects)
      .set({ 
        deletedAt: new Date(),
        archivedBy: req.user?.id 
      })
      .where(eq(projects.id, projectId));
    await logAudit(req, "project.archive", { id: projectId });
    res.json({ ok: true });
  });

  app.post("/api/admin/projects/reorder", requireAdmin, async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id: string, index: number) =>
          tx.update(projects).set({ position: index }).where(eq(projects.id, id))
        )
      );
    });
    await logAudit(req, "project.reorder", { order });
    res.json({ ok: true });
  });

  app.get("/api/admin/bio", requireAdmin, async (_req, res) => {
    const [row] = await db.select().from(bio)
      .orderBy(desc(bio.createdAt))
      .limit(1);
    res.json(row || { headline: "", description: "", paragraph: "" });
  });

  app.post("/api/admin/bio", requireAdmin, async (req, res) => {
    const parsed = insertBioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [result] = await db.insert(bio).values(parsed.data).returning();

    await logAudit(req, "bio.create", parsed.data);
    res.json(result);
  });

  app.put("/api/admin/bio", requireAdmin, async (req, res) => {
    const parsed = insertBioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [result] = await db.insert(bio).values(parsed.data).returning();

    await logAudit(req, "bio.update", parsed.data);
    res.json(result);
  });

  app.get("/api/admin/bio/versions", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(bio)
      .orderBy(desc(bio.createdAt));
    res.json(rows);
  });

  app.post("/api/admin/bio/:id/restore", requireAdmin, async (req, res) => {
    const bioVersionId = routeId(req.params.id);
    const [version] = await db.select().from(bio)
      .where(eq(bio.id, bioVersionId))
      .limit(1);

    if (!version) {
      return res.status(404).json({ message: "Bio version not found" });
    }

    const [restored] = await db.insert(bio).values({
      headline: version.headline,
      description: version.description,
      paragraph: version.paragraph,
    }).returning();

    await logAudit(req, "bio.restore", { sourceId: bioVersionId, restoredId: restored.id });
    res.json(restored);
  });

  app.get("/api/admin/skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(skills)
      .where(sql`${skills.deletedAt} IS NULL`)
      .orderBy(asc(skills.position));
    res.json(rows);
  });

  app.post("/api/admin/skills", requireAdmin, async (req, res) => {
    const parsed = insertSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [maxRow] = await db
      .select({ max: sql<number>`max(${skills.position})` })
      .from(skills);
    const nextPos = (maxRow?.max ?? 0) + 1;

    const [created] = await db
      .insert(skills)
      .values({ ...parsed.data, position: nextPos })
      .returning();

    await logAudit(req, "skill.create", created);
    res.json(created);
  });

  app.put("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(skills)
      .set(parsed.data)
      .where(eq(skills.id, skillId))
      .returning();

    await logAudit(req, "skill.update", { id: skillId, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    await db.update(skills)
      .set({ 
        deletedAt: new Date(),
        archivedBy: req.user?.id 
      })
      .where(eq(skills.id, skillId));
    await logAudit(req, "skill.archive", { id: skillId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills/reorder", requireAdmin, async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id: string, index: number) =>
          tx.update(skills).set({ position: index }).where(eq(skills.id, id))
        )
      );
    });
    await logAudit(req, "skill.reorder", { order });
    res.json({ ok: true });
  });

  // Archived items endpoints
  app.get("/api/admin/archived/projects", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NOT NULL`)
      .orderBy(asc(projects.deletedAt));
    res.json(rows);
  });

  app.get("/api/admin/archived/skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(skills)
      .where(sql`${skills.deletedAt} IS NOT NULL`)
      .orderBy(asc(skills.deletedAt));
    res.json(rows);
  });

  app.post("/api/admin/projects/:id/restore", requireAdmin, async (req, res) => {
    const projectId = routeId(req.params.id);
    const [restored] = await db.update(projects)
      .set({ deletedAt: null, archivedBy: null })
      .where(eq(projects.id, projectId))
      .returning();
    await logAudit(req, "project.restore", { id: projectId });
    res.json(restored);
  });

  app.post("/api/admin/skills/:id/restore", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const [restored] = await db.update(skills)
      .set({ deletedAt: null, archivedBy: null })
      .where(eq(skills.id, skillId))
      .returning();
    await logAudit(req, "skill.restore", { id: skillId });
    res.json(restored);
  });

  return httpServer;
}

async function logAudit(req: Request, action: string, payload: unknown) {
  if (!req.user?.id) return;
  await db.insert(auditLogs).values({
    userId: req.user.id,
    action,
    payload,
  });
}

function normalizeBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function hydrateProjectsWithBullets(projectRows: any[]) {
  if (!Array.isArray(projectRows) || projectRows.length === 0) return [];

  const projectIds = projectRows.map((row) => row.id);
  const bulletRows = await db
    .select()
    .from(xyzBullets)
    .where(inArray(xyzBullets.projectId, projectIds));

  const bulletsByProjectId = new Map<string, string[]>();
  for (const bulletRow of bulletRows) {
    const prev = bulletsByProjectId.get(bulletRow.projectId) ?? [];
    prev.push(bulletRow.bulletText);
    bulletsByProjectId.set(bulletRow.projectId, prev);
  }

  return projectRows.map((projectRow) => ({
    ...projectRow,
    xyzBullets: bulletsByProjectId.get(projectRow.id) ?? [],
  }));
}
