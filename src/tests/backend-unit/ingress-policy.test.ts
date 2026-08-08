import assert from "node:assert/strict";
import test from "node:test";
import {
  createCanonicalHostMiddleware,
  discardVisitorNetworkHeaders,
  rejectRetiredBrowserAuth,
} from "../../backend/ingress-policy";

function responseFixture() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  let redirect: { status: number; location: string } | undefined;
  return {
    headers,
    get statusCode() { return statusCode; },
    get body() { return body; },
    get redirectResult() { return redirect; },
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); },
    status(value: number) { statusCode = value; return this; },
    json(value: unknown) { body = value; return this; },
    redirect(status: number, location: string) {
      statusCode = status;
      redirect = { status, location };
      return this;
    },
  };
}

test("canonical host policy accepts the configured host and rejects raw origins", () => {
  const middleware = createCanonicalHostMiddleware("https://2jog.dev");
  const accepted = responseFixture();
  let continued = false;
  middleware({ headers: { host: "2jog.dev" }, originalUrl: "/" } as any, accepted as any, () => {
    continued = true;
  });
  assert.equal(continued, true);

  const rejected = responseFixture();
  middleware({
    headers: { host: "portfolio--prod-example.a.run.app" },
    originalUrl: "/admin",
  } as any, rejected as any, () => assert.fail("raw origin continued"));
  assert.equal(rejected.statusCode, 421);
  assert.deepEqual(rejected.body, { error: "canonical_host_required" });
  assert.equal(rejected.headers.get("cache-control"), "no-store");
});

test("www redirects to the canonical origin while preserving path and query", () => {
  const middleware = createCanonicalHostMiddleware("https://2jog.dev");
  const response = responseFixture();
  middleware({
    headers: { host: "www.2jog.dev" },
    originalUrl: "/portfolio?view=recent",
  } as any, response as any, () => assert.fail("www request continued"));
  assert.deepEqual(response.redirectResult, {
    status: 308,
    location: "https://2jog.dev/portfolio?view=recent",
  });
});

test("visitor network identity headers are discarded before application code", () => {
  const request = {
    headers: {
      "cf-connecting-ip": "198.51.100.1",
      "cf-ipcountry": "US",
      "x-forwarded-for": "198.51.100.2",
      "x-real-ip": "198.51.100.3",
      "x-request-id": "request-7",
    },
  } as any;
  let continued = false;
  discardVisitorNetworkHeaders(request, {} as any, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(request.headers, { "x-request-id": "request-7" });
});

test("retired browser-auth paths fail closed before the SPA fallback", () => {
  const response = responseFixture();
  rejectRetiredBrowserAuth({} as any, response as any, () => {
    assert.fail("retired browser auth continued");
  });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "route_not_found" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
