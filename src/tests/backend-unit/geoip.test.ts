import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { extractClientCountry, extractClientIp } from "../../backend/geoip";

function request(
  headers: Record<string, string>,
  ip = "127.0.0.1",
  edgeOriginAuthenticated = false,
): Request {
  return { headers, ip, edgeOriginAuthenticated } as unknown as Request;
}

test("client IP extraction trusts edge metadata only after origin authentication", () => {
  assert.equal(
    extractClientIp(request({
      "x-2jog-client-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.20, 10.0.0.1",
    }, "127.0.0.1", true)),
    "203.0.113.9",
  );
  assert.equal(
    extractClientIp(request({ "x-2jog-client-ip": "203.0.113.9" })),
    "",
  );
});

test("client IP extraction fails closed for malformed edge values and fallback socket addresses", () => {
  assert.equal(
    extractClientIp(request({ "x-2jog-client-ip": "not-an-ip", "x-forwarded-for": "198.51.100.20" }, "::ffff:10.2.3.4", true)),
    "",
  );
});

test("client country extraction accepts only authenticated edge-owned ISO metadata", () => {
  assert.equal(extractClientCountry(request({ "x-2jog-client-country": "us" }, "127.0.0.1", true)), "US");
  assert.equal(extractClientCountry(request({ "x-2jog-client-country": "us" })), undefined);
  assert.equal(extractClientCountry(request({ "x-2jog-client-country": "USA" }, "127.0.0.1", true)), undefined);
  assert.equal(extractClientCountry(request({ "x-2jog-client-country": "<script>" }, "127.0.0.1", true)), undefined);
});
