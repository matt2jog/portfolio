import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import { eq, or } from "drizzle-orm";
import { db } from "./data/db";
import { users } from "@shared/schema";

export const ADMIN_IDENTITY_COOKIE = "__Secure-2jog-admin";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isProd = process.env.NODE_ENV === "production";
const authorityUrl = process.env.ADMIN_AUTHORITY_URL || (isProd ? "https://admin.2jog.dev" : "http://localhost:8080");
const identityIssuer = process.env.ADMIN_IDENTITY_ISSUER || authorityUrl;
const identityAudience = process.env.ADMIN_IDENTITY_AUDIENCE || "2jog-services";
const identityJwksUrl = process.env.ADMIN_IDENTITY_JWKS_URL || new URL("/.well-known/jwks.json", authorityUrl).toString();
const publicOrigin = process.env.PUBLIC_BASE_URL || (isProd ? "https://2jog.dev" : "http://localhost:3000");
const keySet = createRemoteJWKSet(new URL(identityJwksUrl));

if (isProd) {
  for (const [name, value] of Object.entries({
    ADMIN_AUTHORITY_URL: process.env.ADMIN_AUTHORITY_URL,
    ADMIN_IDENTITY_ISSUER: process.env.ADMIN_IDENTITY_ISSUER,
    ADMIN_IDENTITY_AUDIENCE: process.env.ADMIN_IDENTITY_AUDIENCE,
    ADMIN_IDENTITY_JWKS_URL: process.env.ADMIN_IDENTITY_JWKS_URL,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  })) {
    if (!value) throw new Error(`${name} is required in production`);
  }
}

interface AdminClaims extends JWTPayload {
  email: string;
  role: "admin";
}

function parseCookies(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(raw.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name ? [[name, value]] : [];
  }));
}

export async function verifyAdminIdentity(token: string, verificationKeySet: JWTVerifyGetKey = keySet): Promise<AdminClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, verificationKeySet, {
    algorithms: ["RS256"],
    issuer: identityIssuer,
    audience: identityAudience,
    clockTolerance: 30,
  });
  if (protectedHeader.typ !== "JWT" || !protectedHeader.kid || Object.keys(protectedHeader).sort().join(",") !== "alg,kid,typ") {
    throw new Error("Invalid Admin identity header");
  }
  if (!payload.sub || typeof payload.email !== "string" || payload.email !== payload.email.toLowerCase() || payload.role !== "admin") {
    throw new Error("Invalid Admin identity claims");
  }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number" || typeof payload.jti !== "string" || !UUID_V4.test(payload.jti)) {
    throw new Error("Invalid Admin identity lifetime");
  }
  if (payload.exp - payload.iat !== 900) throw new Error("Admin identity lifetime must be 15 minutes");
  return payload as AdminClaims;
}

async function localAdmin(claims: AdminClaims): Promise<Express.User> {
  const email = claims.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(or(eq(users.googleSub, claims.sub!), eq(users.email, email))).limit(1);
  if (existing) {
    const [updated] = await db.update(users).set({ googleSub: claims.sub!, email, role: "admin" }).where(eq(users.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db.insert(users).values({ email, googleSub: claims.sub!, role: "admin", name: null }).returning();
  return created!;
}

export function setupAuth(app: Express): void {
  app.set("trust proxy", 1);
  app.use(async (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[ADMIN_IDENTITY_COOKIE];
    if (!token) return next();
    try {
      req.user = await localAdmin(await verifyAdminIdentity(token));
    } catch {
      req.user = undefined;
    }
    return next();
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.user) return next();
  return res.status(401).json({
    message: "Unauthorized",
    login_url: buildAdminLoginUrl(requestReturn(req)),
  });
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  return res.status(401).json({
    message: "Unauthorized",
    login_url: buildAdminLoginUrl(requestReturn(req)),
  });
};

export function normalizePortfolioReturn(requested?: string): string {
  if (requested) {
    try {
      const parsed = new URL(requested);
      if (parsed.origin === new URL(publicOrigin).origin && (parsed.pathname === "/admin" || parsed.pathname.startsWith("/admin/"))) {
        return parsed.toString();
      }
    } catch {
      // Fall back to the canonical legacy Admin page.
    }
  }
  return new URL("/admin", publicOrigin).toString();
}

export function buildAdminLoginUrl(returnTo: string): string {
  const login = new URL("/auth/google", authorityUrl);
  login.searchParams.set("returnTo", returnTo);
  return login.toString();
}

function requestReturn(req: Request): string {
  const referer = req.get("referer");
  return normalizePortfolioReturn(referer);
}

export const authRoutes = {
  start: (req: Request, res: Response) => res.redirect(302, buildAdminLoginUrl(normalizePortfolioReturn(typeof req.query.returnTo === "string" ? req.query.returnTo : undefined))),
  callback: (req: Request, res: Response) => res.redirect(302, buildAdminLoginUrl(normalizePortfolioReturn(typeof req.query.returnTo === "string" ? req.query.returnTo : undefined))),
  logout: (_req: Request, res: Response) => {
    const logout = new URL("/auth/logout", authorityUrl);
    logout.searchParams.set("returnTo", new URL("/", publicOrigin).toString());
    return res.json({ ok: true, logout_url: logout.toString() });
  },
};

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
    interface User {
      id: string;
      email: string;
      googleSub: string;
      name: string | null;
      role: string;
    }
  }
}
