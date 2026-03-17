import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { authRoutes, requireAdmin, requireAuth } from "./auth";
import { db } from "./db";
import { loadMarkdownAsHtml } from "./markdown";
import {
  allSkills,
  bio,
  insertBioSchema,
  insertAllSkillSchema,
  insertPortfolioSkillSchema,
  insertProjectSchema,
  insertSkillsGroupSchema,
  portfolioSkills,
  projects,
  skillsGroup,
  updateProjectSchema,
  updateAllSkillSchema,
  updatePortfolioSkillSchema,
  updateSkillsGroupSchema,
  auditLogs,
  xyzBullets,
} from "@shared/schema";
import { adminPolicyAcceptance } from "@shared/schema_policy";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/auth/google", authRoutes.start);
  app.get("/auth/google/callback", authRoutes.callback);

  // ========== AUTH ==========
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

  // ========== LEGAL DOCUMENTS ==========
  // These endpoints return the rendered HTML for the legal docs.
  // The SPA routes (/privacy, /terms, /tracking) are served by the client-side app.
  app.get("/api/legal/privacy", (_req, res) => {
    const html = loadMarkdownAsHtml("PRIVACY_POLICY.md");
    if (!html) return res.status(404).send("Privacy Policy not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/api/legal/terms", (_req, res) => {
    const html = loadMarkdownAsHtml("TERMS_OF_USE.md");
    if (!html) return res.status(404).send("Terms of Use not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/api/legal/tracking", (_req, res) => {
    const html = loadMarkdownAsHtml("TRACKING_NOTICE_AND_CONSENT.md");
    if (!html) return res.status(404).send("Tracking Notice not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // ========== GEOLOCATION ==========
  app.get("/api/public/geoip", async (req, res) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]?.trim() || req.ip;

    const countryCode = detectCountryFromIP(ip || "");
    res.json({ ip, country_code: countryCode });
  });

  // ========== POLICY ACCEPTANCE ==========
  app.get("/api/admin/policy/check-acceptance", requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const POLICY_VERSION = "1.0";
    const TERMS_VERSION = "1.0";
    const PRIVACY_VERSION = "1.0";

    const [acceptance] = await db
      .select()
      .from(adminPolicyAcceptance)
      .where(
        sql`${adminPolicyAcceptance.adminId} = ${userId}
        AND ${adminPolicyAcceptance.policyVersion} = ${POLICY_VERSION}
        AND ${adminPolicyAcceptance.termsVersion} = ${TERMS_VERSION}
        AND ${adminPolicyAcceptance.privacyVersion} = ${PRIVACY_VERSION}
        AND ${adminPolicyAcceptance.accepted} = true`
      )
      .limit(1);

    if (acceptance) {
      return res.json({ accepted: true, acceptance });
    }

    res.status(403).json({ accepted: false });
  });

  app.post("/api/admin/policy/accept", requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const POLICY_VERSION = "1.0";
    const TERMS_VERSION = "1.0";
    const PRIVACY_VERSION = "1.0";

    const [result] = await db
      .insert(adminPolicyAcceptance)
      .values({
        adminId: userId,
        policyVersion: POLICY_VERSION,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        accepted: true,
      })
      .onConflictDoUpdate({
        target: [
          adminPolicyAcceptance.adminId,
          adminPolicyAcceptance.policyVersion,
          adminPolicyAcceptance.termsVersion,
          adminPolicyAcceptance.privacyVersion,
        ],
        set: { accepted: true, timestamp: new Date() },
      })
      .returning();

    await logAudit(req, "policy.admin_accepted", {
      admin_id: userId,
      policy_version: POLICY_VERSION,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    });

    res.json({ ok: true, result });
  });

  // ========== PUBLIC DATA ==========

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
    const rows = await db.select().from(portfolioSkills)
      .where(sql`${portfolioSkills.deletedAt} IS NULL`)
      .orderBy(asc(portfolioSkills.position));
    const hydrated = await hydratePortfolioSkills(rows);
    res.json(hydrated.map((row) => ({ id: row.id, label: row.label })));
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

  app.delete("/api/admin/bio/:id", requireAdmin, async (req, res) => {
    const bioVersionId = routeId(req.params.id);

    const [existing] = await db.select().from(bio)
      .where(eq(bio.id, bioVersionId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: "Bio version not found" });
    }

    await db.delete(bio).where(eq(bio.id, bioVersionId));
    await logAudit(req, "bio.delete", { id: bioVersionId });
    res.json({ ok: true });
  });

  app.get("/api/admin/skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(portfolioSkills)
      .where(sql`${portfolioSkills.deletedAt} IS NULL`)
      .orderBy(asc(portfolioSkills.position));
    res.json(await hydratePortfolioSkills(rows));
  });

  app.get("/api/admin/skills-groups", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(skillsGroup).orderBy(asc(skillsGroup.name));
    res.json(rows);
  });

  app.post("/api/admin/skills-groups", requireAdmin, async (req, res) => {
    const parsed = insertSkillsGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [created] = await db.insert(skillsGroup).values(parsed.data).returning();
    await logAudit(req, "skillsGroup.create", created);
    res.json(created);
  });

  app.put("/api/admin/skills-groups/:id", requireAdmin, async (req, res) => {
    const groupId = routeId(req.params.id);
    const parsed = updateSkillsGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(skillsGroup)
      .set(parsed.data)
      .where(eq(skillsGroup.id, groupId))
      .returning();

    await logAudit(req, "skillsGroup.update", { id: groupId, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/skills-groups/:id", requireAdmin, async (req, res) => {
    const groupId = routeId(req.params.id);
    await db.delete(skillsGroup).where(eq(skillsGroup.id, groupId));
    await logAudit(req, "skillsGroup.delete", { id: groupId });
    res.json({ ok: true });
  });

  app.get("/api/admin/all-skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(allSkills).orderBy(asc(allSkills.name));
    const groups = await db.select().from(skillsGroup);
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    res.json(
      rows.map((row) => ({
        ...row,
        groupingName: row.groupingId ? groupsById.get(row.groupingId)?.name ?? null : null,
      })),
    );
  });

  app.post("/api/admin/all-skills", requireAdmin, async (req, res) => {
    const parsed = insertAllSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [created] = await db.insert(allSkills).values(parsed.data).returning();
    await logAudit(req, "allSkill.create", created);
    res.json(created);
  });

  app.put("/api/admin/all-skills/:id", requireAdmin, async (req, res) => {
    const allSkillId = routeId(req.params.id);
    const parsed = updateAllSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(allSkills)
      .set(parsed.data)
      .where(eq(allSkills.id, allSkillId))
      .returning();

    await logAudit(req, "allSkill.update", { id: allSkillId, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/all-skills/:id", requireAdmin, async (req, res) => {
    const allSkillId = routeId(req.params.id);
    const [inUse] = await db
      .select({ count: sql<number>`count(*)` })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.allSkillId, allSkillId));

    if ((inUse?.count ?? 0) > 0) {
      return res.status(400).json({ message: "Cannot delete all_skill that is assigned to portfolio_skills" });
    }

    await db.delete(allSkills).where(eq(allSkills.id, allSkillId));
    await logAudit(req, "allSkill.delete", { id: allSkillId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills", requireAdmin, async (req, res) => {
    const parsed = insertPortfolioSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [allSkill] = await db.select().from(allSkills)
      .where(eq(allSkills.id, parsed.data.allSkillId))
      .limit(1);
    if (!allSkill) return res.status(400).json({ message: "Invalid all_skill reference" });

    const [maxRow] = await db
      .select({ max: sql<number>`max(${portfolioSkills.position})` })
      .from(portfolioSkills);
    const nextPos = (maxRow?.max ?? 0) + 1;

    const [created] = await db
      .insert(portfolioSkills)
      .values({ ...parsed.data, position: nextPos })
      .returning();

    await logAudit(req, "portfolioSkill.create", created);
    const [hydrated] = await hydratePortfolioSkills([created]);
    res.json(hydrated);
  });

  app.put("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const parsed = updatePortfolioSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    if (parsed.data.allSkillId) {
      const [allSkill] = await db.select().from(allSkills)
        .where(eq(allSkills.id, parsed.data.allSkillId))
        .limit(1);
      if (!allSkill) return res.status(400).json({ message: "Invalid all_skill reference" });
    }

    const [updated] = await db
      .update(portfolioSkills)
      .set(parsed.data)
      .where(eq(portfolioSkills.id, skillId))
      .returning();

    await logAudit(req, "portfolioSkill.update", { id: skillId, ...parsed.data });
    const [hydrated] = await hydratePortfolioSkills([updated]);
    res.json(hydrated);
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    await db.delete(portfolioSkills)
      .where(eq(portfolioSkills.id, skillId));
    await logAudit(req, "portfolioSkill.delete", { id: skillId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills/reorder", requireAdmin, async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id: string, index: number) =>
          tx.update(portfolioSkills).set({ position: index }).where(eq(portfolioSkills.id, id))
        )
      );
    });
    await logAudit(req, "portfolioSkill.reorder", { order });
    res.json({ ok: true });
  });

  // Archived items endpoints
  app.get("/api/admin/archived/projects", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NOT NULL`)
      .orderBy(asc(projects.deletedAt));
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

async function hydratePortfolioSkills(skillRows: any[]) {
  if (!Array.isArray(skillRows) || skillRows.length === 0) return [];

  const allSkillIds = skillRows
    .map((row) => row.allSkillId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (allSkillIds.length === 0) {
    return skillRows.map((row) => ({ ...row, label: "" }));
  }

  const allSkillRows = await db.select().from(allSkills).where(inArray(allSkills.id, allSkillIds));
  const groupIds = allSkillRows
    .map((row) => row.groupingId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const groupRows = groupIds.length
    ? await db.select().from(skillsGroup).where(inArray(skillsGroup.id, groupIds))
    : [];

  const allSkillById = new Map(allSkillRows.map((row) => [row.id, row]));
  const groupById = new Map(groupRows.map((row) => [row.id, row]));

  return skillRows.map((row) => {
    const allSkill = row.allSkillId ? allSkillById.get(row.allSkillId) : undefined;
    const group = allSkill?.groupingId ? groupById.get(allSkill.groupingId) : undefined;

    return {
      ...row,
      label: allSkill?.name ?? "",
      allSkillName: allSkill?.name ?? null,
      groupingId: allSkill?.groupingId ?? null,
      groupingName: group?.name ?? null,
    };
  });
}

/**
 * Detect country code from IP address (placeholder for production MaxMind/IP Stack)
 */
function detectCountryFromIP(ip: string): string | undefined {
  // This is a placeholder. In production, integrate with MaxMind GeoIP2 or IP Stack.
  // For now, return undefined (means consent banner won't show).
  // To test EU behavior with consent banner, you can mock this or use a VPN with EU IP.
  return undefined;
}
