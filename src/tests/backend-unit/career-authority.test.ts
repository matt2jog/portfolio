import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("Portfolio exposes public career reads but no embedded Admin API or UI", () => {
  const routes = readFileSync(path.join(process.cwd(), "src", "backend", "routes.ts"), "utf8");
  const app = readFileSync(path.join(process.cwd(), "src", "client", "src", "App.tsx"), "utf8");

  assert.match(routes, /app\.get\("\/api\/public\/(?:projects|bio|experiences|personal-information|welcome-message)/);
  assert.doesNotMatch(routes, /["']\/api\/admin(?:\/|["'])/);
  assert.match(routes, /app\.get\("\/admin"/);
  assert.match(routes, /app\.use\("\/auth", rejectRetiredBrowserAuth\)/);
  assert.match(routes, /https:\/\/admin\.2jog\.dev\//);
  assert.match(routes, /https:\/\/admin-staging\.2jog\.dev\//);
  assert.match(routes, /process\.env\.DEPLOYMENT_STAGE === "staging"/);
  assert.doesNotMatch(app, /pages\/Admin|path="\/admin"|AdminPersonalizationPanel/);
});

test("Portfolio runtime loses canonical writes while Admin retains canonical authority", () => {
  const adapter = readFileSync(
    path.join(process.cwd(), "src", "shared", "turso-connection.ts"),
    "utf8",
  );
  assert.match(adapter, /Portfolio runtime may only read career data or append GitHub activity/);
  assert.match(adapter, /INSERT\\s\+\(\?:OR\\s\+IGNORE/);
  assert.match(adapter, /github_timeline_events/);
  assert.match(adapter, /UPDATE\|DELETE\|REPLACE/);
});

test("Portfolio releases never run the Admin-owned career migration job", () => {
  const workflowSources = ["ci.yml", "promote.yml"]
    .map((filename) => ({
      filename,
      source: readFileSync(
        path.join(process.cwd(), ".github", "workflows", filename),
        "utf8",
      ),
    }));
  const workflows = workflowSources
    .map(({ source }) => source)
    .join("\n");

  assert.doesNotMatch(workflows, /(?:STAGING|PROD)_MIGRATION_JOB/);
  assert.doesNotMatch(workflows, /gcloud run jobs (?:describe|execute|update)/);
  assert.match(
    workflowSources.find(({ filename }) => filename === "ci.yml")!.source,
    /bash \.github\/scripts\/verify-career-read-model\.sh "\$\{STAGING_E2E_BASE_URL\}"/,
  );
  assert.match(
    workflowSources.find(({ filename }) => filename === "promote.yml")!.source,
    /bash \.github\/scripts\/verify-career-read-model\.sh "\$\{PROD_E2E_BASE_URL\}"/,
  );
  for (const { filename, source } of workflowSources) {
    assert.ok(
      [...source.matchAll(/--clear-tags/g)].length >= 2,
      `${filename} must clear candidate tags on success and rollback`,
    );
  }
});

test("the release verifier requires real Admin-owned career rows", () => {
  const verifier = readFileSync(
    path.join(process.cwd(), ".github", "scripts", "verify-career-read-model.sh"),
    "utf8",
  );

  for (const endpoint of [
    "/api/public/projects",
    "/api/public/experiences",
    "/api/skills-constellation",
    "/api/public/bio",
    "/api/public/personal-information",
  ]) {
    assert.ok(verifier.includes(endpoint), `missing row-level verification for ${endpoint}`);
  }
  assert.match(verifier, /type == \\"array\\" and length > 0/);
  assert.match(verifier, /Portfolio will not migrate or write canonical career data/);
});
