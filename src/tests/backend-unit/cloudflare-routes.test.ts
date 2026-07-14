import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRouteOwnership,
  restoreRouteSnapshot,
  selectRouteSnapshot,
  type CloudflareRouteClient,
  type CloudflareWorkerRoute,
} from "../../scripts/release/cloudflare-routes";

const targetPatterns = ["2jog.dev/*", "www.2jog.dev/*"];

test("route snapshots retain only the exact pre-cutover owners", () => {
  const snapshot = selectRouteSnapshot([
    { id: "root", pattern: "2jog.dev/*", script: "resume-vcs-cloud-proxy" },
    { id: "www", pattern: "www.2jog.dev/*", script: "resume-vcs-cloud-proxy" },
    { id: "resume", pattern: "resume.2jog.dev/*", script: "resume-vcs-cloud-proxy" },
  ], targetPatterns);

  assert.deepEqual(snapshot, {
    schema_version: 1,
    routes: [
      { pattern: "2jog.dev/*", script: "resume-vcs-cloud-proxy" },
      { pattern: "www.2jog.dev/*", script: "resume-vcs-cloud-proxy" },
    ],
  });
  assert.throws(() => selectRouteSnapshot([], targetPatterns), /missing route/i);
});

test("route restoration updates present routes and recreates missing routes", async () => {
  const routes: CloudflareWorkerRoute[] = [
    { id: "root-new", pattern: "2jog.dev/*", script: "portfolio-edge" },
  ];
  const calls: string[] = [];
  const client: CloudflareRouteClient = {
    async list() { return routes.map((route) => ({ ...route })); },
    async update(id, route) {
      calls.push(`update:${id}:${route.pattern}:${route.script}`);
      const current = routes.find((item) => item.id === id);
      if (!current) throw new Error("missing test route");
      Object.assign(current, route);
    },
    async create(route) {
      calls.push(`create:${route.pattern}:${route.script}`);
      routes.push({ id: `new-${routes.length}`, ...route });
    },
  };

  await restoreRouteSnapshot(client, {
    schema_version: 1,
    routes: targetPatterns.map((pattern) => ({ pattern, script: "resume-vcs-cloud-proxy" })),
  });

  assert.deepEqual(calls, [
    "update:root-new:2jog.dev/*:resume-vcs-cloud-proxy",
    "create:www.2jog.dev/*:resume-vcs-cloud-proxy",
  ]);
  assert.doesNotThrow(() => assertRouteOwnership(routes, targetPatterns, "resume-vcs-cloud-proxy"));
  assert.throws(() => assertRouteOwnership(routes, targetPatterns, "portfolio-edge"), /route owner/i);
});
