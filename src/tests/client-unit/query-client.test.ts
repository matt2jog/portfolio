import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { apiRequest, getQueryFn } from "../../client/src/lib/queryClient";

type FetchCall = { input: string; init?: RequestInit };

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let fetchCalls: FetchCall[];
let responses: Response[];
let assignedUrls: string[];

beforeEach(() => {
  fetchCalls = [];
  assignedUrls = [];
  responses = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        assign: (url: string) => assignedUrls.push(url),
      },
    },
  });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch for ${String(input)}`);
    return response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("apiRequest sends JSON without collecting or forwarding a client IP", async () => {
  responses.push(
    Response.json({ saved: true }),
    new Response(null, { status: 204 }),
  );

  await apiRequest("POST", "/api/admin/example", { enabled: true });
  await apiRequest("DELETE", "/api/admin/example");

  assert.equal(fetchCalls[0]?.input, "/api/admin/example");
  assert.deepEqual(fetchCalls[0]?.init?.headers, {
    "Content-Type": "application/json",
  });
  assert.equal(fetchCalls[0]?.init?.body, JSON.stringify({ enabled: true }));
  assert.deepEqual(fetchCalls[1]?.init?.headers, {});
  assert.equal(fetchCalls[1]?.init?.body, undefined);
});

test("getQueryFn returns JSON and permits an explicit null for an unauthenticated optional query", async () => {
  responses.push(
    Response.json({ ok: true }),
    new Response("unauthorized", { status: 401 }),
  );

  const throwQuery = getQueryFn<{ ok: boolean }>({ on401: "throw" });
  const optionalQuery = getQueryFn<null>({ on401: "returnNull" });

  assert.deepEqual(await throwQuery({ queryKey: ["api", "status"] } as never), { ok: true });
  assert.equal(await optionalQuery({ queryKey: ["api", "admin"] } as never), null);
  assert.equal(fetchCalls[0]?.input, "api/status");
  assert.equal(fetchCalls[0]?.init?.credentials, "include");
});

test("401 handling redirects only to the constrained sign-in route", async () => {
  const validUrl = "https://admin.2jog.dev/auth/google?returnTo=%2Fadmin";
  responses.push(
    new Response(JSON.stringify({ login_url: validUrl }), { status: 401 }),
  );

  const query = getQueryFn<never>({ on401: "throw" });
  await assert.rejects(
    query({ queryKey: ["/api/admin"] } as never),
    /Redirecting to sign in/,
  );
  assert.deepEqual(assignedUrls, [validUrl]);
});

test("401 handling permits the constrained localhost sign-in route for local development", async () => {
  const localUrl = "http://localhost/auth/google?returnTo=%2Fadmin";
  responses.push(
    new Response(JSON.stringify({ login_url: localUrl }), { status: 401 }),
  );

  const query = getQueryFn<never>({ on401: "throw" });
  await assert.rejects(
    query({ queryKey: ["/api/admin"] } as never),
    /Redirecting to sign in/,
  );
  assert.deepEqual(assignedUrls, [localUrl]);
});

test("401 handling rejects unsafe, malformed, and incomplete login URLs", async () => {
  const payloads = [
    JSON.stringify({ login_url: "javascript:alert(1)" }),
    JSON.stringify({ login_url: "https://admin.2jog.dev/not-auth?returnTo=%2Fadmin" }),
    JSON.stringify({ login_url: "https://admin.2jog.dev/auth/google" }),
    JSON.stringify({ login_url: 123 }),
    "not-json",
  ];
  responses.push(...payloads.map((body) => new Response(body, { status: 401 })));
  const query = getQueryFn<never>({ on401: "throw" });

  for (const payload of payloads) {
    await assert.rejects(
      query({ queryKey: ["/api/admin"] } as never),
      new RegExp(`401: ${payload.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  }
  assert.deepEqual(assignedUrls, []);
});

test("HTTP errors preserve response text or fall back to status text", async () => {
  responses.push(
    new Response("provider unavailable", { status: 503, statusText: "Unavailable" }),
    new Response(null, { status: 500, statusText: "Server Error" }),
  );
  const query = getQueryFn<never>({ on401: "throw" });

  await assert.rejects(query({ queryKey: ["/api/failure"] } as never), /503: provider unavailable/);
  await assert.rejects(query({ queryKey: ["/api/empty"] } as never), /500: Server Error/);
});
