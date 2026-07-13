import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

process.env.NODE_ENV = "test";
process.env.ADMIN_AUTHORITY_URL = "https://admin.2jog.dev";
process.env.ADMIN_IDENTITY_ISSUER = "https://admin.2jog.dev";
process.env.ADMIN_IDENTITY_AUDIENCE = "2jog-services";
process.env.ADMIN_IDENTITY_JWKS_URL = "https://admin.2jog.dev/.well-known/jwks.json";
process.env.PUBLIC_BASE_URL = "https://2jog.dev";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

const { buildAdminLoginUrl, normalizePortfolioReturn, verifyAdminIdentity } = await import("../../backend/auth");

test("legacy Admin return targets preserve an exact local path and query", () => {
  assert.equal(
    normalizePortfolioReturn("https://2jog.dev/admin/projects?view=archived&sort=recent"),
    "https://2jog.dev/admin/projects?view=archived&sort=recent",
  );
  assert.equal(normalizePortfolioReturn("https://attacker.example/admin"), "https://2jog.dev/admin");
  assert.equal(normalizePortfolioReturn("https://2jog.dev/not-admin"), "https://2jog.dev/admin");
  assert.equal(
    buildAdminLoginUrl("https://2jog.dev/admin?tab=projects"),
    "https://admin.2jog.dev/auth/google?returnTo=https%3A%2F%2F2jog.dev%2Fadmin%3Ftab%3Dprojects",
  );
});

test("shared Admin identity pins RS256 issuer audience and required claims", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "portfolio-test";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ email: "matthewtujague@gmail.com", role: "admin" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
    .setIssuer("https://admin.2jog.dev")
    .setAudience("2jog-services")
    .setSubject("google-sub")
    .setJti("f47ac10b-58cc-4372-a567-0e02b2c3d479")
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(privateKey);
  const keys = createLocalJWKSet({ keys: [jwk] });

  await assert.doesNotReject(() => verifyAdminIdentity(token, keys));
  const wrongAudience = await new SignJWT({ email: "matthewtujague@gmail.com", role: "admin" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
    .setIssuer("https://admin.2jog.dev")
    .setAudience("wrong")
    .setSubject("google-sub")
    .setJti("550e8400-e29b-41d4-a716-446655440000")
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(privateKey);
  await assert.rejects(() => verifyAdminIdentity(wrongAudience, keys));
});
