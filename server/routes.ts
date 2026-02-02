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
} from "@shared/schema";
import { asc, eq, sql } from "drizzle-orm";

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
    const rows = await db.select().from(projects).orderBy(asc(projects.position));
    res.json(rows);
  });

  app.get("/api/public/bio", async (_req, res) => {
    const [row] = await db.select().from(bio).limit(1);
    res.json(row || { headline: "", description: "", paragraph: "" });
  });

  app.get("/api/public/skills", async (_req, res) => {
    const rows = await db.select().from(skills).orderBy(asc(skills.position));
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
    const rows = await db.select().from(projects).orderBy(asc(projects.position));
    res.json(rows);
  });

  app.post("/api/admin/projects", requireAdmin, async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [maxRow] = await db
      .select({ max: sql<number>`max(${projects.position})` })
      .from(projects);
    const nextPos = (maxRow?.max ?? 0) + 1;

    const [created] = await db
      .insert(projects)
      .values({ ...parsed.data, position: nextPos })
      .returning();

    await logAudit(req, "project.create", created);
    res.json(created);
  });

  app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(projects)
      .set(parsed.data)
      .where(eq(projects.id, req.params.id))
      .returning();

    await logAudit(req, "project.update", { id: req.params.id, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/projects/:id", requireAdmin, async (req, res) => {
    await db.delete(projects).where(eq(projects.id, req.params.id));
    await logAudit(req, "project.delete", { id: req.params.id });
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
    const [row] = await db.select().from(bio).limit(1);
    res.json(row || { headline: "", description: "", paragraph: "" });
  });

  app.put("/api/admin/bio", requireAdmin, async (req, res) => {
    const parsed = insertBioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [existing] = await db.select().from(bio).limit(1);
    let result;
    if (existing) {
      [result] = await db
        .update(bio)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(bio.id, existing.id))
        .returning();
    } else {
      [result] = await db.insert(bio).values(parsed.data).returning();
    }

    await logAudit(req, "bio.update", parsed.data);
    res.json(result);
  });

  app.get("/api/admin/skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(skills).orderBy(asc(skills.position));
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
    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(skills)
      .set(parsed.data)
      .where(eq(skills.id, req.params.id))
      .returning();

    await logAudit(req, "skill.update", { id: req.params.id, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    await db.delete(skills).where(eq(skills.id, req.params.id));
    await logAudit(req, "skill.delete", { id: req.params.id });
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
