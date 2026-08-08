import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertPortfolioRuntimeStatement,
  createPortfolioClient,
  validateTursoConnection,
} from "../../shared/turso-connection";

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
  assert.doesNotThrow(() => assertPortfolioRuntimeStatement(
    "INSERT INTO github_timeline_events (ext_id) VALUES ('new') ON CONFLICT DO NOTHING",
  ));
  assert.throws(
    () => assertPortfolioRuntimeStatement(
      "INSERT INTO github_timeline_events (ext_id) VALUES ('existing') ON CONFLICT(ext_id) DO UPDATE SET title = 'changed'",
    ),
    /may only read career data or append GitHub activity/,
  );
  assert.throws(
    () => assertPortfolioRuntimeStatement("SELECT 1; DELETE FROM projects"),
    /exactly one SQL statement/,
  );
  assert.throws(
    () => validateTursoConnection({ url: "not-a-database-url", authToken: "unused" }),
    /local file or Turso URL/,
  );
  assert.equal(
    validateTursoConnection({ url: "C:\\data\\career.db" }).url,
    "file:///C:/data/career.db",
  );
  assert.doesNotThrow(() => assertPortfolioRuntimeStatement(
    "WITH career AS (SELECT * FROM projects) SELECT * FROM career",
  ));
  assert.throws(
    () => assertPortfolioRuntimeStatement(
      "WITH stale AS (SELECT id FROM projects) DELETE FROM projects WHERE id IN (SELECT id FROM stale)",
    ),
    /may only read career data or append GitHub activity/,
  );

  const guarded = createPortfolioClient({ url: ":memory:", runtimeGuard: true });
  try {
    assert.throws(
      () => guarded.executeMultiple("SELECT 1"),
      /does not expose bulk or transaction write primitives/,
    );
  } finally {
    guarded.close();
  }
});

test("Portfolio releases never run or substitute for Admin's career transfer", () => {
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
  assert.doesNotMatch(workflows, /verify-career-read-model|db:migrate|db:transfer/);
  for (const { filename, source } of workflowSources) {
    assert.ok(
      [...source.matchAll(/--clear-tags/g)].length >= 2,
      `${filename} must clear candidate tags on success and rollback`,
    );
  }
});
