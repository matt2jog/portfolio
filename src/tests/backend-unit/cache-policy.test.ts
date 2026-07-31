import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  dynamicResponseCachePolicy,
  requiresNoStore,
} from "../../backend/cache-policy";

function responseFixture() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(value: number) {
      statusCode = value;
      return this;
    },
    json() {
      return this;
    },
    redirect(value: number) {
      statusCode = value;
      return this;
    },
  };
}

function responseFor(path: string, status: number) {
  const response = responseFixture();
  let continued = false;
  dynamicResponseCachePolicy(
    { path } as Request,
    response as unknown as Response,
    () => {
      continued = true;
      response.status(status).json();
    },
  );
  assert.equal(continued, true);
  return response;
}

test("API successes and unauthenticated failures are explicitly no-store", () => {
  for (const [path, status] of [
    ["/api/public/geoip", 200],
    ["/api/admin/projects", 401],
    ["/api/missing", 404],
  ] as const) {
    const response = responseFor(path, status);
    assert.equal(response.statusCode, status);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("auth redirects and callback failures are explicitly no-store", () => {
  for (const [path, status] of [
    ["/auth/login", 302],
    ["/auth/callback", 403],
    ["/auth/logout", 401],
  ] as const) {
    const response = responseFor(path, status);
    assert.equal(response.statusCode, status);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("cache middleware leaves static and similarly prefixed paths to their owners", () => {
  for (const path of [
    "/",
    "/assets/index-CVW0fQGk.js",
    "/assets/logo-flat.png",
    "/apiary",
    "/authorize",
  ]) {
    assert.equal(requiresNoStore(path), false, path);
    const response = responseFor(path, 200);
    assert.equal(response.headers.has("cache-control"), false, path);
  }
});
