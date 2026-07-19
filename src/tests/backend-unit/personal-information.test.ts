import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatOwnerContext,
  buildPublicPersonalInformationResponse,
} from "../../backend/personal-information";

test("the public personal-information API exposes an explicit empty response", () => {
  assert.equal(buildPublicPersonalInformationResponse(undefined), null);
  assert.equal(buildPublicPersonalInformationResponse(null), null);
});

test("chat has no owner context when personal information is not configured", () => {
  assert.equal(buildChatOwnerContext(undefined), null);
  assert.equal(buildChatOwnerContext(null), null);
});

test("chat owner context preserves configured contact data without inventing values", () => {
  const owner = buildChatOwnerContext({
    name: "Configured Owner",
    email: "owner@example.invalid",
    phone: "+15555550123",
    phoneFormatted: "+1 (555) 555-0123",
    linkedinUrl: "https://linkedin.example.invalid/owner",
    githubUrl: "https://github.example.invalid/owner",
    portfolioUrl: "https://portfolio.example.invalid",
  });

  assert.deepEqual(owner, {
    name: "Configured Owner",
    email: "owner@example.invalid",
    phone: "+15555550123",
    linkedinUrl: "https://linkedin.example.invalid/owner",
    githubUrl: "https://github.example.invalid/owner",
    portfolioUrl: "https://portfolio.example.invalid",
  });
});
