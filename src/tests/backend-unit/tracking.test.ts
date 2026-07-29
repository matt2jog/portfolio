import assert from "node:assert/strict";
import test from "node:test";
import {
  generateHashedUuid,
  getRequestTrackerUuid,
  parseCookies,
  TRACKER_COOKIE_NAME,
} from "../../backend/tracking-utils";

test("tracking identifiers are random opaque hashes", () => {
  const first = generateHashedUuid();
  const second = generateHashedUuid();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.match(second, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test("cookie parsing and request lookup tolerate absent and encoded values", () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies("session=abc; encoded=hello%20world"), {
    session: "abc",
    encoded: "hello world",
  });

  const noCookie = { headers: {} } as any;
  assert.equal(getRequestTrackerUuid(noCookie), undefined);

  const expected = "deadbeef" + "1".repeat(56);
  const request = {
    headers: { cookie: `session=abc; ${TRACKER_COOKIE_NAME}=${expected}` },
  } as any;
  assert.equal(getRequestTrackerUuid(request), expected);
});

test("the durable tracker uses the server-only cookie name", () => {
  assert.equal(TRACKER_COOKIE_NAME, "tr_uuid");
});
