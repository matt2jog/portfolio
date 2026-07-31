import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { eq, or } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./data/db";
import {
  Auth0WebClient,
  isSameOriginMutation,
  loadAuth0WebConfig,
  type Auth0BrowserIdentity,
} from "./auth0Web";

const isProd = process.env.NODE_ENV === "production";
const publicOrigin = process.env.PUBLIC_BASE_URL
  || (isProd ? "https://2jog.dev" : "http://localhost:3000");

export const auth0WebClient = new Auth0WebClient(loadAuth0WebConfig({
  serviceId: "portfolio",
  publicBaseUrl: publicOrigin,
  nodeEnv: process.env.NODE_ENV || "development",
}));

if (isProd) {
  if (!process.env.PUBLIC_BASE_URL) {
    throw new Error("PUBLIC_BASE_URL is required in production");
  }
  if (!auth0WebClient.config.enabled) {
    throw new Error("Auth0 browser configuration is required in production");
  }
}

export function selectSingleAdminIdentityMatch<T>(matches: readonly T[]): T | undefined {
  if (matches.length > 1) {
    throw new Error("users contains conflicting rows for this Admin identity");
  }
  return matches[0];
}

async function localAuth0Admin(identity: Auth0BrowserIdentity): Promise<Express.User> {
  const email = identity.email?.trim().toLowerCase();
  const existing = selectSingleAdminIdentityMatch(
    await db.select().from(users).where(
      email
        ? or(eq(users.auth0Sub, identity.subject), eq(users.email, email))
        : eq(users.auth0Sub, identity.subject),
    ),
  );
  const update = auth0AdminIdentityUpdate(existing, identity);
  if (!update) return existing!;
  const [updated] = await db.update(users)
    .set(update)
    .where(eq(users.id, existing!.id))
    .returning();
  if (!updated) throw new Error("auth0_admin_bind_failed");
  return updated;
}

export function auth0AdminIdentityUpdate(
  existing: Express.User | undefined,
  identity: Auth0BrowserIdentity,
): {
  auth0Sub: string;
  email: string;
  name: string | null;
  role: "admin";
} | undefined {
  if (!existing || existing.role !== "admin") {
    throw new Error("auth0_admin_not_preapproved");
  }
  if (existing.auth0Sub && existing.auth0Sub !== identity.subject) {
    throw new Error("auth0_admin_subject_mismatch");
  }

  const email = identity.email?.trim().toLowerCase();
  if (!email) {
    if (existing.auth0Sub !== identity.subject) {
      throw new Error("auth0_admin_subject_not_bound");
    }
    return undefined;
  }

  return {
    auth0Sub: identity.subject,
    email,
    name: identity.name ?? existing.name,
    role: "admin",
  };
}

export function setupAuth(app: Express): void {
  app.use(async (req, _res, next) => {
    try {
      const auth0Identity = await auth0WebClient.session(req);
      if (!auth0Identity) return next();
      req.auth0Identity = auth0Identity;
      req.user = await localAuth0Admin(auth0Identity);
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
      return res.status(503).json({ error: "auth_unavailable" });
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
  callback: async (req: Request, res: Response) => {
    try {
      const { identity, returnTo } = await auth0WebClient.callback(req, res);
      req.auth0Identity = identity;
      req.user = await localAuth0Admin(identity);
      return res.redirect(302, normalizePortfolioReturn(returnTo));
    } catch {
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
};

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
