import assert from "node:assert/strict";
import test from "node:test";
import {
  portfolioHealth,
  resolveReleaseSha,
} from "../../backend/release-provenance";

const SHA = "a".repeat(40);

test("release SHA is optional for local development", () => {
  assert.equal(resolveReleaseSha(undefined), null);
  assert.deepEqual(portfolioHealth(null), {
    ok: true,
    service: "portfolio",
    release_sha: null,
  });
});

test("health reports an exact full release SHA", () => {
  assert.equal(resolveReleaseSha(` ${SHA} `), SHA);
  assert.equal(portfolioHealth(SHA).release_sha, SHA);
});

test("malformed release provenance fails closed", () => {
  for (const value of ["main", "38003df", SHA.toUpperCase(), `${SHA}0`]) {
    assert.throws(
      () => resolveReleaseSha(value),
      /PORTFOLIO_RELEASE_SHA must be a full lowercase Git SHA/u,
    );
  }
});
