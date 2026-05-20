import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidWelcomeSlug, WELCOME_SLUG_MAX_LENGTH } from "../../backend/welcome-message-utils";

// ── isValidWelcomeSlug ────────────────────────────────────────────────────────

test("accepts simple lowercase slug", () => {
  assert.equal(isValidWelcomeSlug("acme"), true);
});

test("accepts slug with hyphens", () => {
  assert.equal(isValidWelcomeSlug("acme-corp"), true);
});

test("accepts slug with digits", () => {
  assert.equal(isValidWelcomeSlug("acme2024"), true);
});

test("accepts single character slug", () => {
  assert.equal(isValidWelcomeSlug("a"), true);
});

test("accepts slug with internal hyphens and digits", () => {
  assert.equal(isValidWelcomeSlug("my-company-123"), true);
});

test("accepts max-length slug", () => {
  const slug = "a".repeat(WELCOME_SLUG_MAX_LENGTH);
  assert.equal(isValidWelcomeSlug(slug), true);
});

test("rejects empty string", () => {
  assert.equal(isValidWelcomeSlug(""), false);
});

test("rejects slug that is too long", () => {
  const slug = "a".repeat(WELCOME_SLUG_MAX_LENGTH + 1);
  assert.equal(isValidWelcomeSlug(slug), false);
});

test("rejects slug with uppercase letters", () => {
  assert.equal(isValidWelcomeSlug("Acme"), false);
});

test("rejects slug with leading hyphen", () => {
  assert.equal(isValidWelcomeSlug("-acme"), false);
});

test("rejects slug with trailing hyphen", () => {
  assert.equal(isValidWelcomeSlug("acme-"), false);
});

test("rejects slug with spaces", () => {
  assert.equal(isValidWelcomeSlug("acme corp"), false);
});

test("rejects slug with special characters", () => {
  assert.equal(isValidWelcomeSlug("acme@corp"), false);
  assert.equal(isValidWelcomeSlug("acme.corp"), false);
  assert.equal(isValidWelcomeSlug("acme/corp"), false);
});

test("rejects null", () => {
  assert.equal(isValidWelcomeSlug(null), false);
});

test("rejects undefined", () => {
  assert.equal(isValidWelcomeSlug(undefined), false);
});

test("rejects number", () => {
  assert.equal(isValidWelcomeSlug(42), false);
});

test("rejects object", () => {
  assert.equal(isValidWelcomeSlug({ slug: "acme" }), false);
});

test("rejects slug with consecutive hyphens", () => {
  assert.equal(isValidWelcomeSlug("acme--corp"), false);
});
