import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { apiRequest, getQueryFn } from "../../client/src/lib/queryClient";

type FetchCall = { input: string; init?: RequestInit };

const originalFetch = globalThis.fetch;
let fetchCalls: FetchCall[];
let responses: Response[];

beforeEach(() => {
  fetchCalls = [];
  responses = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch for ${String(input)}`);
    return response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("apiRequest sends JSON without collecting or forwarding a client IP", async () => {
  responses.push(Response.json({ saved: true }), new Response(null, { status: 204 }));

  await apiRequest("POST", "/api/public/example", { enabled: true });
  await apiRequest("DELETE", "/api/public/example");

  assert.equal(fetchCalls[0]?.input, "/api/public/example");
  assert.deepEqual(fetchCalls[0]?.init?.headers, { "Content-Type": "application/json" });
  assert.equal(fetchCalls[0]?.init?.body, JSON.stringify({ enabled: true }));
  assert.deepEqual(fetchCalls[1]?.init?.headers, {});
  assert.equal(fetchCalls[1]?.init?.body, undefined);
});

test("getQueryFn returns JSON and treats every HTTP error normally", async () => {
  responses.push(Response.json({ ok: true }), new Response("unauthorized", { status: 401 }));
  const query = getQueryFn<{ ok: boolean }>();

  assert.deepEqual(await query({ queryKey: ["api", "status"] } as never), { ok: true });
  await assert.rejects(query({ queryKey: ["api", "private"] } as never), /401: unauthorized/);
  assert.equal(fetchCalls[0]?.input, "api/status");
  assert.equal(fetchCalls[0]?.init?.credentials, "include");
});

test("HTTP errors preserve response text or fall back to status text", async () => {
  responses.push(
    new Response("provider unavailable", { status: 503, statusText: "Unavailable" }),
    new Response(null, { status: 500, statusText: "Server Error" }),
  );
  const query = getQueryFn<never>();

  await assert.rejects(query({ queryKey: ["/api/failure"] } as never), /503: provider unavailable/);
  await assert.rejects(query({ queryKey: ["/api/empty"] } as never), /500: Server Error/);
});
