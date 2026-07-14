import assert from "node:assert/strict";
import test from "node:test";
import { isLinkedinSyncEnabled } from "../../backend/linkedin-sync-policy";

test("paid LinkedIn synchronization is disabled unless explicitly enabled", () => {
  assert.equal(isLinkedinSyncEnabled(undefined), false);
  assert.equal(isLinkedinSyncEnabled(""), false);
  assert.equal(isLinkedinSyncEnabled("true"), false);
  assert.equal(isLinkedinSyncEnabled("0"), false);
  assert.equal(isLinkedinSyncEnabled("1"), true);
});
