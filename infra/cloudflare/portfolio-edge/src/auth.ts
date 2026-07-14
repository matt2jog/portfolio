import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";

export const ADMIN_IDENTITY_COOKIE = "__Secure-2jog-admin";
const ADMIN_AUTHORITY = "https://admin.2jog.dev";
const ADMIN_AUDIENCE = "2jog-services";
const ADMIN_JWKS_URL = `${ADMIN_AUTHORITY}/.well-known/jwks.json`;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const remoteKeySet = createRemoteJWKSet(new URL(ADMIN_JWKS_URL));

interface AdminClaims extends JWTPayload {
  email: string;
  role: "admin";
}

export function adminIdentityCookie(rawCookie: string | null): string | undefined {
  if (!rawCookie) return undefined;
  for (const part of rawCookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === ADMIN_IDENTITY_COOKIE) {
      return part.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

export function requiresAdminIdentity(pathname: string): boolean {
  return pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname === "/api/admin"
    || pathname.startsWith("/api/admin/")
    || pathname === "/api/auth/me";
}

export async function verifyAdminIdentityAtEdge(
  token: string,
  keySet: JWTVerifyGetKey = remoteKeySet,
): Promise<AdminClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, keySet, {
    algorithms: ["RS256"],
    issuer: ADMIN_AUTHORITY,
    audience: ADMIN_AUDIENCE,
    clockTolerance: 30,
  });
  if (
    protectedHeader.typ !== "JWT"
    || !protectedHeader.kid
    || Object.keys(protectedHeader).sort().join(",") !== "alg,kid,typ"
  ) {
    throw new Error("Invalid Admin identity header");
  }
  if (
    !payload.sub
    || typeof payload.email !== "string"
    || payload.email !== payload.email.toLowerCase()
    || payload.role !== "admin"
  ) {
    throw new Error("Invalid Admin identity claims");
  }
  if (
    typeof payload.iat !== "number"
    || typeof payload.exp !== "number"
    || typeof payload.jti !== "string"
    || !UUID_V4.test(payload.jti)
  ) {
    throw new Error("Invalid Admin identity lifetime");
  }
  if (payload.exp - payload.iat !== 900) {
    throw new Error("Admin identity lifetime must be 15 minutes");
  }
  return payload as AdminClaims;
}
