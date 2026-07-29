import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canonicalCareerMutationRejected,
  isForeignKeyViolation,
  projectPresentationUpdateSchema,
} from "../../backend/career-authority";

test("project presentation updates accept only Portfolio-owned fields", () => {
  assert.equal(projectPresentationUpdateSchema.safeParse({ category: "systems", image: "/hero.png" }).success, true);
  assert.equal(projectPresentationUpdateSchema.safeParse({ aiSystemPrompt: "Use project facts only." }).success, true);
  assert.equal(projectPresentationUpdateSchema.safeParse({ title: "Canonical title" }).success, false);
  assert.equal(projectPresentationUpdateSchema.safeParse({ xyzBullets: ["Canonical bullet"] }).success, false);
  assert.equal(projectPresentationUpdateSchema.safeParse({}).success, false);
});

test("foreign-key violation matching handles direct and wrapped database errors", () => {
  const constraint = "all_skills_grouping_id_skills_group_id_fk";
  const violation = { code: "23503", constraint };

  assert.equal(isForeignKeyViolation(violation, constraint), true);
  assert.equal(isForeignKeyViolation(new Error("query failed", { cause: violation }), constraint), true);
  assert.equal(isForeignKeyViolation({ code: "23505", constraint }, constraint), false);
  assert.equal(isForeignKeyViolation(violation, "another_constraint"), false);
});

test("canonical career mutation rejection points callers to Admin without touching storage", () => {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };

  canonicalCareerMutationRejected({} as never, response as never, (() => undefined) as never);

  assert.equal(statusCode, 409);
  assert.deepEqual(body, {
    code: "CANONICAL_CAREER_READ_ONLY",
    message: "Canonical career data is managed by Admin Dashboard.",
    authority: "https://admin.2jog.dev",
  });
});

test("canonical career editors and mutation routes are absent from Portfolio", () => {
  const routes = readFileSync(path.join(process.cwd(), "src", "backend", "routes.ts"), "utf8");
  const adminPage = readFileSync(path.join(process.cwd(), "src", "client", "src", "pages", "Admin.tsx"), "utf8");

  for (const route of [
    'app.post("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/bio/:id/restore", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/bio/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/all-skills", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/all-skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/all-skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/projects/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/projects/:id/restore", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/experiences/reorder", requireAdmin, canonicalCareerMutationRejected)',
  ]) {
    assert.ok(routes.includes(route), `missing read-only boundary for ${route}`);
  }

  assert.match(routes, /app\.post\("\/api\/admin\/skills-groups", requireAdmin, async/);
  assert.match(routes, /app\.post\("\/api\/admin\/skills-groups\/reorder", requireAdmin, async/);
  assert.doesNotMatch(adminPage, /AdminBioPanel|AdminProjectsPanel/);
  assert.doesNotMatch(adminPage, /admin-tab-(?:bio|projects|skills)/);
  assert.match(adminPage, /AdminProjectPresentationPanel/);
  assert.match(adminPage, /AdminSkillsPanel/);
  assert.match(adminPage, /AdminPersonalizationPanel/);
});
