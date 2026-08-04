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
  assert.match(routes, /https:\/\/admin\.2jog\.dev\//);
  assert.match(routes, /https:\/\/admin-staging\.2jog\.dev\//);
  assert.match(routes, /process\.env\.DEPLOYMENT_STAGE === "staging"/);
  assert.doesNotMatch(app, /pages\/Admin|path="\/admin"|AdminPersonalizationPanel/);
});

test("Portfolio runtime loses canonical writes while Admin retains canonical authority", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "src", "migrations", "013_enforce_career_write_authority.sql"),
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
