import type { RequestHandler } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { createHash } from "node:crypto";

const GOOGLE_CERTS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const SERVICE_ACCOUNT = /^[a-z0-9][a-z0-9-]{2,62}@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;

export interface CareerPushIdentityConfig {
  audience: string;
  serviceAccountEmail: string;
}

export interface CareerPushClaims extends JWTPayload {
  email: string;
  email_verified: true;
}

export function validateCareerPushIdentityConfig(
  config: CareerPushIdentityConfig,
): CareerPushIdentityConfig {
  let audience: URL;
  try {
    audience = new URL(config.audience);
  } catch {
    throw new Error("CAREER_PUBSUB_PUSH_AUDIENCE must be an absolute HTTPS URL");
  }
  if (
    audience.protocol !== "https:"
    || audience.username
    || audience.password
    || audience.search
    || audience.hash
    || audience.pathname !== "/internal/pubsub/career"
  ) {
    throw new Error("CAREER_PUBSUB_PUSH_AUDIENCE must be the exact HTTPS career push endpoint");
  }
  if (
    config.serviceAccountEmail !== config.serviceAccountEmail.toLowerCase()
    || !SERVICE_ACCOUNT.test(config.serviceAccountEmail)
  ) {
    throw new Error("CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT must be an exact Google service-account email");
  }
  return config;
}

export async function verifyCareerPushIdentity(
  token: string,
  config: CareerPushIdentityConfig,
  keySet: JWTVerifyGetKey = GOOGLE_CERTS,
): Promise<CareerPushClaims> {
  validateCareerPushIdentityConfig(config);
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ["RS256"],
    issuer: GOOGLE_ISSUERS,
    audience: config.audience,
    clockTolerance: 30,
  });
  if (
    typeof payload.sub !== "string"
    || payload.sub.length === 0
    || payload.email !== config.serviceAccountEmail
    || payload.email_verified !== true
    || typeof payload.iat !== "number"
    || typeof payload.exp !== "number"
    || payload.exp <= payload.iat
    || payload.exp - payload.iat > 3600
  ) {
    throw new Error("Career Pub/Sub push identity principal is not allowed");
  }
  return payload as CareerPushClaims;
}

function bearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  return match?.[1];
}

export function createCareerPushIdentityMiddleware(
  config: CareerPushIdentityConfig,
  keySet: JWTVerifyGetKey = GOOGLE_CERTS,
): RequestHandler {
  validateCareerPushIdentityConfig(config);
  return async (request, response, next) => {
    const token = bearerToken(request.get("authorization"));
    if (!token) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).json({ error: "pubsub_identity_required" });
      return;
    }
    try {
      const claims = await verifyCareerPushIdentity(token, config, keySet);
      response.locals.careerPushPrincipal = claims.email;
      response.locals.careerPushAssertionDigest = createHash("sha256").update(token).digest("hex");
      next();
    } catch {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).json({ error: "pubsub_identity_rejected" });
    }
  };
}
