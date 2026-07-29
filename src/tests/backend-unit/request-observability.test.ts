import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createChatRateLimitMiddleware,
  requestContextMiddleware,
  structuredRequestLogMiddleware,
} from "../../backend/request-observability";

function responseFixture() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  return {
    headers,
    locals: {} as Record<string, unknown>,
    get statusCode() { return statusCode; },
    get body() { return body; },
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(value: number) { statusCode = value; return this; },
    json(value: unknown) { body = value; return this; },
  };
}

test("request context preserves bounded incoming correlation values", () => {
  const req = {
    get: (name: string) => name === "x-request-id" ? "request-7" : "correlation-7",
  } as any;
  const res = responseFixture();
  let continued = false;
  requestContextMiddleware(req, res as any, () => { continued = true; });
  assert.equal(req.requestId, "request-7");
  assert.equal(req.correlationId, "correlation-7");
  assert.equal(res.headers.get("X-Request-Id"), req.requestId);
  assert.equal(res.headers.get("X-Correlation-Id"), req.correlationId);
  assert.equal(continued, true);
});

test("chat rate limiter enforces a bounded in-memory window without persistence", () => {
  let time = 1_000;
  const middleware = createChatRateLimitMiddleware({
    maxRequests: 2,
    windowMs: 1_000,
    now: () => time,
    keySalt: Buffer.alloc(32, 7),
  });
  const request = {
    path: "/api/public/chat",
    edgeOriginAuthenticated: true,
    headers: { "x-2jog-client-ip": "198.51.100.8" },
    requestId: "request-1",
    socket: {},
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
    error: "chat_rate_limited",
    request_id: "request-1",
  });
  assert.equal(limited.locals.failureCode, "chat_rate_limited");
  assert.equal(limited.headers.get("Retry-After"), "1");

  time = 2_001;
  const reset = responseFixture();
  let continued = false;
  middleware(request, reset as any, () => { continued = true; });
  assert.equal(continued, true);
});

test("chat limiter does not throttle ordinary APIs", () => {
  const middleware = createChatRateLimitMiddleware({
    maxRequests: 0,
    keySalt: Buffer.alloc(32, 9),
  });
  const response = responseFixture();
  let continued = false;
  middleware({
    path: "/api/public/projects",
    headers: {},
    socket: {},
  } as any, response as any, () => { continued = true; });
  assert.equal(continued, true);
});

test("completion log uses route templates, Auth0 subject, and no PII", () => {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => messages.push(String(message));
  try {
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      locals: {},
    });
    const request = {
      method: "GET",
      route: { path: "/api/admin/projects/:projectId" },
      baseUrl: "",
      path: "/api/admin/projects/private-record",
      originalUrl: "/api/admin/projects/private-record?email=person@example.test",
      requestId: "request-7",
      correlationId: "correlation-7",
      auth0Identity: { subject: "auth0|admin-7" },
      user: {
        email: "person@example.test",
        auth0Sub: "auth0|admin-7",
        googleSub: null,
      },
    } as any;
    structuredRequestLogMiddleware(request, response as any, () => undefined);
    response.emit("finish");
  } finally {
    console.log = originalLog;
  }

  assert.equal(messages.length, 1);
  const event = JSON.parse(messages[0]!);
  assert.equal(typeof event.duration_ms, "number");
  assert.deepEqual({ ...event, duration_ms: 0 }, {
    event: "portfolio.request.completed",
    request_id: "request-7",
    correlation_id: "correlation-7",
    method: "GET",
    route: "/api/admin/projects/:projectId",
    status: 200,
    outcome: "success",
    duration_ms: 0,
    actor_type: "auth0-admin",
    actor_subject: "auth0|admin-7",
  });
  assert.doesNotMatch(messages[0]!, /private-record|person@example\.test/u);
});
