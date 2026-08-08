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
