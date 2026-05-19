import { test } from "node:test";
import assert from "node:assert/strict";
import { generateHashedUuid, getRequestTrackerUuid, TRACKER_COOKIE_NAME } from "../../backend/tracking-utils";

// ── generateHashedUuid ────────────────────────────────────────────────────────

test("generateHashedUuid returns a 64-char lowercase hex string", () => {
  const uuid = generateHashedUuid();
  assert.equal(typeof uuid, "string");
  assert.equal(uuid.length, 64);
  assert.match(uuid, /^[0-9a-f]{64}$/);
});

test("generateHashedUuid produces unique values each call", () => {
  const a = generateHashedUuid();
  const b = generateHashedUuid();
  assert.notEqual(a, b);
});

// ── getRequestTrackerUuid ─────────────────────────────────────────────────────

function fakeReq(cookieHeader?: string): { headers: { cookie?: string } } {
  return { headers: { cookie: cookieHeader } };
}

test("getRequestTrackerUuid returns undefined when no cookie header", () => {
  const req = fakeReq(undefined) as any;
  assert.equal(getRequestTrackerUuid(req), undefined);
});

test("getRequestTrackerUuid returns undefined when cookie header has no tr_uuid", () => {
  const req = fakeReq("session=abc123; other=val") as any;
  assert.equal(getRequestTrackerUuid(req), undefined);
});

test("getRequestTrackerUuid parses tr_uuid from cookie header", () => {
  const expected = "aabbccdd" + "0".repeat(56);
  const req = fakeReq(`session=abc; ${TRACKER_COOKIE_NAME}=${expected}; foo=bar`) as any;
  assert.equal(getRequestTrackerUuid(req), expected);
});

test("getRequestTrackerUuid parses tr_uuid when it is the only cookie", () => {
  const expected = "deadbeef" + "1".repeat(56);
  const req = fakeReq(`${TRACKER_COOKIE_NAME}=${expected}`) as any;
  assert.equal(getRequestTrackerUuid(req), expected);
});

test("getRequestTrackerUuid handles URL-encoded cookie values", () => {
  const value = "hello%20world";
  const req = fakeReq(`${TRACKER_COOKIE_NAME}=${value}`) as any;
  assert.equal(getRequestTrackerUuid(req), "hello world");
});

// ── TRACKER_COOKIE_NAME constant ──────────────────────────────────────────────

test("TRACKER_COOKIE_NAME is tr_uuid", () => {
  assert.equal(TRACKER_COOKIE_NAME, "tr_uuid");
});
