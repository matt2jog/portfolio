// Projection logic for Admin-owned public career events.
//
// Every function here is a pure mapping from a parsed event envelope onto drizzle
// upsert/delete calls against the pre-existing portfolio tables. `db` is always passed
// in (never imported directly) so this module stays hermetic: unit tests supply a small
// recording adapter/double instead of a live Postgres pool.
//
// Ground rules enforced throughout (see DECOUPLING.md section 6):
//  - Only content fields from the event are written; portfolio-local columns (image,
//    hover_image, category, portfolio_skills...) are never touched here.
//  - `position` is applied on INSERT only - never included in the `set` clause of an
//    upsert, so a locally-reordered row keeps its portfolio display order.
//  - Deletes/tombstones remove (or, where the table has soft-delete columns, archive)
//    the projection row. Unknown/newer fields are ignored.
//  - Every operation is idempotent: replaying the same event twice is a no-op the second
//    time round.

import { eq } from "drizzle-orm";
import type { db as RealDb } from "../data/db";
import {
  experiences,
  projects,
  xyzBullets,
  education,
  allSkills,
} from "@shared/schema";
import type {
  CareerEventEnvelope,
  ExperienceEventData,
  ProjectEventData,
  EducationEventData,
  SkillConceptEventData,
  ProfileEventData,
} from "./career-events-types";

export type Db = typeof RealDb;

export interface ProjectionLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export const consoleProjectionLogger: ProjectionLogger = {
  debug: (message, meta) => console.debug(`[career-events] ${message}`, meta ?? ""),
  info: (message, meta) => console.log(`[career-events] ${message}`, meta ?? ""),
  warn: (message, meta) => console.warn(`[career-events] ${message}`, meta ?? ""),
};

// ---- Experience -------------------------------------------------------------

export async function projectExperience(
  db: Db,
  envelope: CareerEventEnvelope<ExperienceEventData>,
  logger: ProjectionLogger = consoleProjectionLogger,
): Promise<void> {
  const isDelete = envelope.event_type === "ExperienceDeleted" || envelope.data === null;
  const experienceId = envelope.data?.id ?? envelope.aggregate_id;

  if (isDelete) {
    await db.delete(experiences).where(eq(experiences.id, experienceId));
    logger.info("deleted experience projection", { id: experienceId });
    return;
  }

  const data = envelope.data as ExperienceEventData;

  // Bullets ride inside the experience aggregate per the wire contract, but the
  // portfolio schema has no bullets-for-experiences concept (only projects do) -
  // deliberately ignored here.
  await db
    .insert(experiences)
    .values({
      id: data.id,
      role: data.role,
      company: data.company,
      location: data.location ?? "Remote",
      duration: data.duration ?? "",
      description: data.description ?? "",
      technologies: data.technologies ?? [],
      isActive: data.is_active ?? false,
      position: data.position ?? 0,
    })
    .onConflictDoUpdate({
      target: experiences.id,
      set: {
        role: data.role,
        company: data.company,
        location: data.location ?? "Remote",
        duration: data.duration ?? "",
        description: data.description ?? "",
        technologies: data.technologies ?? [],
        isActive: data.is_active ?? false,
        // position intentionally omitted: applied on INSERT only.
      },
    });
}

// ---- Project (+ bullets) ----------------------------------------------------

const PROJECT_INSERT_CATEGORY_SENTINEL = "uncategorized";

export async function projectProject(
  db: Db,
  envelope: CareerEventEnvelope<ProjectEventData>,
  logger: ProjectionLogger = consoleProjectionLogger,
): Promise<void> {
  const isDelete = envelope.event_type === "ProjectDeleted" || envelope.data === null;
  const projectId = envelope.data?.id ?? envelope.aggregate_id;

  if (isDelete) {
    // projects has soft-delete columns already used by the admin "archive" flow -
    // respect that semantics instead of a hard delete.
    await db
      .update(projects)
      .set({ deletedAt: new Date(), archivedBy: "system:career-events" })
      .where(eq(projects.id, projectId));
    logger.info("archived project projection", { id: projectId });
    return;
  }

  const data = envelope.data as ProjectEventData;

  await db
    .insert(projects)
    .values({
      id: data.id,
      title: data.title,
      // category is NOT NULL with no DB default and is exclusively portfolio-owned
      // content (DECOUPLING.md section 6: "NEVER touch image/hover_image/category"). This
      // sentinel is used ONLY on first insert of a project the portfolio has never
      // seen before; an admin fills in the real category/images afterward. Existing
      // rows never have this column touched (see `set` below, which omits it).
      category: PROJECT_INSERT_CATEGORY_SENTINEL,
      description: data.description ?? "",
      longDescription: data.long_description ?? null,
      tech: data.tech ?? [],
      deployedUrl: data.deployed_url ?? null,
      githubUrl: data.github_url ?? null,
      position: data.position ?? 0,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        title: data.title,
        description: data.description ?? "",
        longDescription: data.long_description ?? null,
        tech: data.tech ?? [],
        deployedUrl: data.deployed_url ?? null,
        githubUrl: data.github_url ?? null,
        // position/category/image/hoverImage intentionally omitted from `set`.
      },
    });

  await replaceProjectBullets(db, projectId, data.bullets ?? []);
}

async function replaceProjectBullets(
  db: Db,
  projectId: string,
  bullets: ProjectEventData["bullets"],
): Promise<void> {
  // Not wrapped in a transaction (v1): a crash between the delete and the insert leaves
  // the project bulletless until the next event for this id arrives. Idempotent replay
  // (compacted-topic bootstrap, or a later Upserted) heals it; not closed here to avoid
  // widening this module's dependency on drizzle's transaction API for a rare window.
  await db.delete(xyzBullets).where(eq(xyzBullets.projectId, projectId));

  const rows = (bullets ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((bullet) => ({
      id: bullet.id,
      projectId,
      bulletText: bullet.text,
    }));

  if (rows.length > 0) {
    await db.insert(xyzBullets).values(rows);
  }
}

// ---- Education --------------------------------------------------------------

export async function projectEducation(
  db: Db,
  envelope: CareerEventEnvelope<EducationEventData>,
  logger: ProjectionLogger = consoleProjectionLogger,
): Promise<void> {
  const isDelete = envelope.event_type === "EducationDeleted" || envelope.data === null;
  const educationId = envelope.data?.id ?? envelope.aggregate_id;

  if (isDelete) {
    await db.delete(education).where(eq(education.id, educationId));
    logger.info("deleted education projection", { id: educationId });
    return;
  }

  const data = envelope.data as EducationEventData;

  await db
    .insert(education)
    .values({
      id: data.id,
      school: data.school,
      location: data.location ?? "",
      degree: data.degree,
      dates: data.dates ?? "",
      position: data.position ?? 0,
    })
    .onConflictDoUpdate({
      target: education.id,
      set: {
        school: data.school,
        location: data.location ?? "",
        degree: data.degree,
        dates: data.dates ?? "",
        // position intentionally omitted: applied on INSERT only.
      },
    });
}

// ---- Skill (concept + variants) ---------------------------------------------

export async function projectSkill(
  db: Db,
  envelope: CareerEventEnvelope<SkillConceptEventData>,
  logger: ProjectionLogger = consoleProjectionLogger,
): Promise<void> {
  const isDelete = envelope.event_type === "SkillConceptDeleted" || envelope.data === null;

  if (isDelete) {
    // v1: no destructive all_skills deletes - portfolio_skills may still reference the
    // rows that back this concept's variants. Log only.
    logger.warn("skill concept deleted upstream; not deleting all_skills rows (v1)", {
      aggregateId: envelope.aggregate_id,
    });
    return;
  }

  const data = envelope.data as SkillConceptEventData;

  for (const variant of data.variants ?? []) {
    // Match by legacy_all_skill_id when present (pre-existing all_skills row this
    // variant dual-syncs with); otherwise the variant id becomes the new all_skills.id.
    const targetId = variant.legacy_all_skill_id ?? variant.id;

    await db
      .insert(allSkills)
      .values({ id: targetId, name: variant.wording })
      .onConflictDoUpdate({
        target: allSkills.id,
        set: {
          name: variant.wording,
          // groupingId/embedding intentionally omitted: left untouched on update.
        },
      });
  }
}

// ---- Profile ----------------------------------------------------------------

export function projectProfile(
  envelope: CareerEventEnvelope<ProfileEventData>,
  logger: ProjectionLogger = consoleProjectionLogger,
): void {
  // The legacy profile shape does not safely map to the final Admin projection yet.
  // Keep this compatibility path a no-op until Admin's generated schema lands.
  logger.debug("legacy profile event received (no-op pending Admin projection schema)", {
    aggregateId: envelope.aggregate_id,
    eventType: envelope.event_type,
  });
}
