import assert from "node:assert/strict";
import test from "node:test";
import { authorizeOriginToken, createOriginAccessMiddleware } from "../../backend/origin-access";

const expected = `edge-${"x".repeat(35)}`;
const previous = `edge-${"p".repeat(35)}`;

test("origin access accepts only the exact edge credential", () => {
  assert.equal(authorizeOriginToken(expected, expected), true);
  assert.equal(authorizeOriginToken(expected, undefined), false);
  assert.equal(authorizeOriginToken(expected, `wrong-${"y".repeat(35)}`), false);
  assert.equal(authorizeOriginToken(expected, `${expected}extra`), false);
});

test("origin access accepts the immediately previous credential during rotation", () => {
  assert.equal(authorizeOriginToken(expected, previous, previous), true);
  assert.equal(authorizeOriginToken(expected, expected, previous), true);
  assert.equal(authorizeOriginToken(expected, `wrong-${"y".repeat(35)}`, previous), false);
});

test("origin access fails closed when the configured credential is invalid", () => {
  assert.equal(authorizeOriginToken("", expected), false);
  assert.equal(authorizeOriginToken("too-short", "too-short"), false);
  assert.equal(authorizeOriginToken(expected, "x".repeat(16_385)), false);
  assert.throws(() => createOriginAccessMiddleware(expected, "too-short"), /EDGE_ORIGIN_PREVIOUS_TOKEN/);
});
