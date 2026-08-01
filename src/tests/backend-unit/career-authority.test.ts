import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalCareerMutationRejected } from "../../backend/career-authority";

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

test("every Portfolio canonical career mutation route is read-only", () => {
  const routes = readFileSync(path.join(process.cwd(), "src", "backend", "routes.ts"), "utf8");
  const rejectedRoutes = [
    'app.post("/api/admin/projects", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/projects/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/projects/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/projects/reorder", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/projects/:id/restore", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/personal-information", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/bio/:id/restore", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/bio/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/skills-groups", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/skills-groups/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/skills-groups/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/skills-groups/reorder", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/all-skills", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/all-skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/all-skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/skills", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/skills/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/skills/reorder", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/experiences", requireAdmin, canonicalCareerMutationRejected)',
    'app.put("/api/admin/experiences/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.delete("/api/admin/experiences/:id", requireAdmin, canonicalCareerMutationRejected)',
    'app.post("/api/admin/experiences/reorder", requireAdmin, canonicalCareerMutationRejected)',
  ];

  for (const route of rejectedRoutes) {
    assert.ok(routes.includes(route), `missing read-only boundary for ${route}`);
  }

  assert.doesNotMatch(routes, /app\.(?:post|put|patch|delete)\("\/api\/admin\/(?:education|educations)/);
});

test("Portfolio settings exposes no career editing surface", () => {
  const adminPage = readFileSync(
    path.join(process.cwd(), "src", "client", "src", "pages", "Admin.tsx"),
    "utf8",
  );

  assert.match(adminPage, /Career data is read-only in Portfolio/);
  assert.match(adminPage, /AdminPersonalizationPanel/);
  assert.doesNotMatch(adminPage, /AdminProjectPresentationPanel|AdminSkillsPanel/);
  assert.doesNotMatch(adminPage, /admin-tab-(?:bio|projects|skills|project-presentation|skill-presentation)/);
});

test("Portfolio runtime loses canonical writes while Admin gains the missing career grants", () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "migrations",
      "013_enforce_career_write_authority.sql",
    ),
    "utf8",
  );

  assert.match(migration, /to_regrole\('portfolio_runtime'\) IS NOT NULL/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE[\s\S]+FROM portfolio_runtime/);
  assert.match(migration, /to_regrole\('admin_runtime'\) IS NOT NULL/);
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE\s+education,\s+experience_bullets\s+TO admin_runtime/,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE xyz_bullets TO admin_runtime/,
  );
});
