import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { eq, or } from "drizzle-orm";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { users } from "@shared/schema";
import { db } from "./data/db";
import {
  Auth0WebClient,
  isLegacyAuthEnabled,
  isSameOriginMutation,
  loadAuth0WebConfig,
  type Auth0BrowserIdentity,
} from "./auth0Web";

export const ADMIN_IDENTITY_COOKIE = "__Secure-2jog-admin";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isProd = process.env.NODE_ENV === "production";
const authorityUrl = process.env.ADMIN_AUTHORITY_URL
  || (isProd ? "https://admin.2jog.dev" : "http://localhost:8080");
const identityIssuer = process.env.ADMIN_IDENTITY_ISSUER || authorityUrl;
const identityAudience = process.env.ADMIN_IDENTITY_AUDIENCE || "2jog-services";
const identityJwksUrl = process.env.ADMIN_IDENTITY_JWKS_URL
  || new URL("/.well-known/jwks.json", authorityUrl).toString();
const publicOrigin = process.env.PUBLIC_BASE_URL
  || (isProd ? "https://2jog.dev" : "http://localhost:3000");
const keySet = createRemoteJWKSet(new URL(identityJwksUrl));

export const auth0WebClient = new Auth0WebClient(loadAuth0WebConfig({
  serviceId: "portfolio",
  publicBaseUrl: publicOrigin,
  nodeEnv: process.env.NODE_ENV || "development",
}));

if (isProd) {
  for (const [name, value] of Object.entries({
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  })) {
    if (!value) throw new Error(`${name} is required in production`);
  }
}

interface AdminClaims extends JWTPayload {
  email: string;
  role: "admin";
}

export function selectSingleAdminIdentityMatch<T>(matches: readonly T[]): T | undefined {
  if (matches.length > 1) {
    throw new Error("users contains conflicting rows for this Admin identity");
  }
  return matches[0];
}

export async function verifyAdminIdentity(
  token: string,
  verificationKeySet: JWTVerifyGetKey = keySet,
): Promise<AdminClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, verificationKeySet, {
    algorithms: ["RS256"],
    issuer: identityIssuer,
    audience: identityAudience,
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

async function localLegacyAdmin(claims: AdminClaims): Promise<Express.User> {
  const email = claims.email.trim().toLowerCase();
  const existing = selectSingleAdminIdentityMatch(
    await db.select().from(users).where(
      or(eq(users.googleSub, claims.sub!), eq(users.email, email)),
    ),
  );
  if (existing) {
    const [updated] = await db.update(users)
      .set({ googleSub: claims.sub!, email, role: "admin" })
      .where(eq(users.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db.insert(users)
    .values({
      email,
      googleSub: claims.sub!,
      auth0Sub: null,
      role: "admin",
      name: null,
    })
    .returning();
  return created!;
}

async function localAuth0Admin(identity: Auth0BrowserIdentity): Promise<Express.User> {
  const email = identity.email?.trim().toLowerCase();
  if (!email) throw new Error("auth0_email_required");
  const existing = selectSingleAdminIdentityMatch(
    await db.select().from(users).where(
      or(eq(users.auth0Sub, identity.subject), eq(users.email, email)),
    ),
  );
  if (!existing) throw new Error("auth0_admin_not_preapproved");
  if (existing.auth0Sub && existing.auth0Sub !== identity.subject) {
    throw new Error("auth0_admin_subject_mismatch");
  }
  const [updated] = await db.update(users)
    .set({
      auth0Sub: identity.subject,
      email,
      name: identity.name ?? existing.name,
      role: "admin",
    })
    .where(eq(users.id, existing.id))
    .returning();
  if (!updated) throw new Error("auth0_admin_bind_failed");
  return updated;
}

export function setupAuth(app: Express): void {
  app.use(async (req, _res, next) => {
    try {
      const auth0Identity = await auth0WebClient.session(req);
      if (auth0Identity) {
        req.auth0Identity = auth0Identity;
        req.user = await localAuth0Admin(auth0Identity);
        return next();
      }

      if (!isLegacyAuthEnabled()) return next();
      const token = parseCookies(req.headers.cookie)[ADMIN_IDENTITY_COOKIE];
      if (!token) return next();
      try {
        const claims = await verifyAdminIdentity(token);
        req.user = await localLegacyAdmin(claims);
      } catch {
        req.user = undefined;
      }
      return next();
    } catch (error) {
      return next(error);
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.user) return next();
  return res.status(401).json({
    message: "Unauthorized",
    login_url: buildLoginUrl(requestReturn(req)),
  });
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  return res.status(401).json({
    message: "Unauthorized",
    login_url: buildLoginUrl(requestReturn(req)),
  });
};

export function normalizePortfolioReturn(requested?: string): string {
  if (requested) {
    try {
      const parsed = new URL(requested, publicOrigin);
      if (
        parsed.origin === new URL(publicOrigin).origin
        && (parsed.pathname === "/admin" || parsed.pathname.startsWith("/admin/"))
      ) {
        parsed.hash = "";
        return parsed.toString();
      }
    } catch {
      // Fall back to the canonical Admin page.
    }
  }
  return new URL("/admin", publicOrigin).toString();
}

export function buildAdminLoginUrl(returnTo: string): string {
  const login = new URL("/auth/google", authorityUrl);
  login.searchParams.set("returnTo", returnTo);
  return login.toString();
}

export function buildLoginUrl(returnTo: string): string {
  const login = new URL("/auth/login", publicOrigin);
  login.searchParams.set("returnTo", normalizePortfolioReturn(returnTo));
  return login.toString();
}

function requestReturn(req: Request): string {
  const referer = req.get("referer");
  return normalizePortfolioReturn(referer);
}

export const authRoutes = {
  start: async (req: Request, res: Response, next: NextFunction) => {
    if (!auth0WebClient.config.enabled) {
      if (!isLegacyAuthEnabled()) {
        return res.status(503).json({ error: "auth_unavailable" });
      }
      return authRoutes.legacyStart(req, res);
    }
    try {
      req.query.returnTo = normalizePortfolioReturn(
        typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
      );
      await auth0WebClient.start(req, res);
    } catch (error) {
      next(error);
    }
  },
  callback: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identity, returnTo } = await auth0WebClient.callback(req, res);
      req.auth0Identity = identity;
      req.user = await localAuth0Admin(identity);
      return res.redirect(302, normalizePortfolioReturn(returnTo));
    } catch (error) {
      auth0WebClient.clearSession(res);
      return res.status(403).json({ error: "auth0_callback_rejected" });
    }
  },
  logout: (req: Request, res: Response) => {
    if (!isSameOriginMutation(req, publicOrigin)) {
      return res.status(403).json({ error: "cross_site_request_rejected" });
    }
    auth0WebClient.clearSession(res);
    return res.json({
      ok: true,
      logout_url: auth0WebClient.logoutUrl(),
    });
  },
  legacyStart: (req: Request, res: Response) => {
    if (!isLegacyAuthEnabled()) {
      return res.status(410).json({ error: "legacy_auth_expired" });
    }
    return res.redirect(302, buildAdminLoginUrl(normalizePortfolioReturn(
      typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
    )));
  },
  legacyCallback: (req: Request, res: Response) => {
    if (!isLegacyAuthEnabled()) {
      return res.status(410).json({ error: "legacy_auth_expired" });
    }
    return res.redirect(302, buildAdminLoginUrl(normalizePortfolioReturn(
      typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
    )));
  },
};

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

declare global {
  namespace Express {
    interface Request {
      user?: User;
      auth0Identity?: Auth0BrowserIdentity;
    }
    interface User {
      id: string;
      email: string;
      googleSub: string | null;
      auth0Sub: string | null;
      name: string | null;
      role: string;
    }
  }
}
