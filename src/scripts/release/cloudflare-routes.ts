import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertProductionMutationAllowed } from "../production-execution-guard";

export interface CloudflareWorkerRoute {
  id: string;
  pattern: string;
  script: string;
}

export interface RouteOwner {
  pattern: string;
  script: string;
}

export interface RouteSnapshot {
  schema_version: 1;
  routes: RouteOwner[];
}

export interface CloudflareRouteClient {
  list(): Promise<CloudflareWorkerRoute[]>;
  update(id: string, route: RouteOwner): Promise<void>;
  create(route: RouteOwner): Promise<void>;
}

const TARGET_PATTERNS = ["2jog.dev/*", "www.2jog.dev/*"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoute(value: unknown): CloudflareWorkerRoute {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.pattern !== "string"
    || typeof value.script !== "string"
    || !value.id
    || !value.pattern
    || !value.script
  ) throw new Error("Cloudflare returned an invalid Worker route");
  return { id: value.id, pattern: value.pattern, script: value.script };
}

export function selectRouteSnapshot(
  routes: CloudflareWorkerRoute[],
  patterns: readonly string[] = TARGET_PATTERNS,
): RouteSnapshot {
  const selected = patterns.map((pattern) => {
    const route = routes.find((item) => item.pattern === pattern);
    if (!route?.script) throw new Error(`Missing route owner for ${pattern}`);
    return { pattern, script: route.script };
  });
  return { schema_version: 1, routes: selected };
}

export function assertRouteOwnership(
  routes: CloudflareWorkerRoute[],
  patterns: readonly string[],
  expectedScript: string,
): void {
  for (const pattern of patterns) {
    const route = routes.find((item) => item.pattern === pattern);
    if (route?.script !== expectedScript) {
      throw new Error(`Unexpected route owner for ${pattern}`);
    }
  }
}

export async function restoreRouteSnapshot(
  client: CloudflareRouteClient,
  snapshot: RouteSnapshot,
  expectedCurrentOwner?: string,
): Promise<void> {
  const current = await client.list();
  for (const desired of snapshot.routes) {
    const route = current.find((item) => item.pattern === desired.pattern);
    if (route?.script === desired.script) continue;
    if (route && expectedCurrentOwner && route.script !== expectedCurrentOwner) {
      throw new Error(`Refusing to replace concurrent route owner for ${desired.pattern}`);
    }
    if (route) await client.update(route.id, desired);
    else await client.create(desired);
  }

  const restored = await client.list();
  for (const desired of snapshot.routes) {
    const route = restored.find((item) => item.pattern === desired.pattern);
    if (route?.script !== desired.script) throw new Error(`Route restoration failed for ${desired.pattern}`);
  }
}

function parseSnapshot(raw: string): RouteSnapshot {
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { throw new Error("Route snapshot is not valid JSON"); }
  if (!isRecord(value) || value.schema_version !== 1 || !Array.isArray(value.routes)) {
    throw new Error("Route snapshot metadata is invalid");
  }
  const routes = value.routes.map((route) => {
    if (!isRecord(route) || typeof route.pattern !== "string" || typeof route.script !== "string") {
      throw new Error("Route snapshot contains an invalid route");
    }
    return { pattern: route.pattern, script: route.script };
  });
  if (routes.length !== TARGET_PATTERNS.length) throw new Error("Route snapshot is incomplete");
  for (const pattern of TARGET_PATTERNS) {
    if (!routes.some((route) => route.pattern === pattern && route.script)) {
      throw new Error(`Route snapshot is missing ${pattern}`);
    }
  }
  return { schema_version: 1, routes };
}

class HttpCloudflareRouteClient implements CloudflareRouteClient {
  public constructor(
    private readonly zoneId: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path = "", init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Content-Type", "application/json");
    const response = await this.fetcher(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/workers/routes${path}`,
      {
        ...init,
        headers,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) throw new Error(`Cloudflare route request failed with status ${response.status}`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || body.success !== true || !("result" in body)) {
      throw new Error("Cloudflare route request returned an invalid response");
    }
    return body.result;
  }

  public async list(): Promise<CloudflareWorkerRoute[]> {
    const result = await this.request();
    if (!Array.isArray(result)) throw new Error("Cloudflare route list is invalid");
    return result.map(parseRoute);
  }

  public async update(id: string, route: RouteOwner): Promise<void> {
    await this.request(`/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(route) });
  }

  public async create(route: RouteOwner): Promise<void> {
    await this.request("", { method: "POST", body: JSON.stringify(route) });
  }
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Cloudflare route mutation");
  const [command, argument, expectedCurrentOwner] = process.argv.slice(2);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!command || !token || !zoneId) throw new Error("Cloudflare route command and scoped credentials are required");
  const client = new HttpCloudflareRouteClient(zoneId, token);

  if (command === "snapshot") {
    if (!argument) throw new Error("Route snapshot path is required");
    const snapshot = selectRouteSnapshot(await client.list());
    await writeFile(argument, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return;
  }
  if (command === "restore") {
    if (!argument) throw new Error("Route snapshot path is required");
    await restoreRouteSnapshot(
      client,
      parseSnapshot(await readFile(argument, "utf8")),
      expectedCurrentOwner,
    );
    return;
  }
  if (command === "verify") {
    if (!argument) throw new Error("Expected route owner is required");
    assertRouteOwnership(await client.list(), TARGET_PATTERNS, argument);
    return;
  }
  throw new Error(`Unknown Cloudflare route command: ${command}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Cloudflare route command failed");
    process.exitCode = 1;
  });
}
