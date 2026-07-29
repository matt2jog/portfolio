import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiRateLimitMiddleware,
  requestContextMiddleware,
} from "../../backend/request-observability";

function responseFixture() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  return {
    headers,
    get statusCode() { return statusCode; },
    get body() { return body; },
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(value: number) { statusCode = value; return this; },
    json(value: unknown) { body = value; return this; },
  };
}

test("request context generates a response correlation id", () => {
  const req = {} as any;
  const res = responseFixture();
  let continued = false;
  requestContextMiddleware(req, res as any, () => { continued = true; });
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers.get("X-Request-Id"), req.requestId);
  assert.equal(continued, true);
});

test("API rate limiter enforces a bounded in-memory window without persistence", () => {
  let time = 1_000;
  const middleware = createApiRateLimitMiddleware({
    maxRequests: 2,
    windowMs: 1_000,
    now: () => time,
  });
  const request = {
    path: "/api/public/projects",
    edgeOriginAuthenticated: true,
    headers: { "x-2jog-client-ip": "198.51.100.8" },
    requestId: "request-1",
  } as any;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = responseFixture();
    let continued = false;
    middleware(request, response as any, () => { continued = true; });
    assert.equal(continued, true);
  }

  const limited = responseFixture();
  middleware(request, limited as any, () => assert.fail("limited request continued"));
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.body, {
    error: "Too many requests",
    request_id: "request-1",
  });
  assert.equal(limited.headers.get("Retry-After"), "1");

  time = 2_001;
  const reset = responseFixture();
  let continued = false;
  middleware(request, reset as any, () => { continued = true; });
  assert.equal(continued, true);
});
