import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyAdminIdentityAtEdge } from "../src/auth";

const ISSUER = "https://admin.2jog.dev";
const AUDIENCE = "2jog-services";

describe("Portfolio edge Admin identity", () => {
  it("accepts only the shared 15-minute RS256 contract", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "edge-auth-test";
    jwk.alg = "RS256";
    jwk.use = "sig";
    const keys = createLocalJWKSet({ keys: [jwk] });
    const now = Math.floor(Date.now() / 1000);
    const valid = await new SignJWT({ email: "admin@example.invalid", role: "admin" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
      .setSubject("admin-subject")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .setJti("123e4567-e89b-42d3-a456-426614174000")
      .sign(privateKey);

    await expect(verifyAdminIdentityAtEdge(valid, keys)).resolves.toMatchObject({
      email: "admin@example.invalid",
      role: "admin",
      sub: "admin-subject",
    });

    const wrongLifetime = await new SignJWT({ email: "admin@example.invalid", role: "admin" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
      .setSubject("admin-subject")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setJti("123e4567-e89b-42d3-a456-426614174000")
      .sign(privateKey);
    await expect(verifyAdminIdentityAtEdge(wrongLifetime, keys)).rejects.toThrow(/lifetime/);
  });
});
