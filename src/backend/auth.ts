import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import connectPgSimple from "connect-pg-simple";
import { db, pool } from "./data/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { parseCookies } from "./tracking-utils";

const PgSession = connectPgSimple(session);

const splitList = (value?: string) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const allowedAdminEmails = splitList(process.env.ALLOWED_ADMIN_EMAIL);
const allowedAdminSubs = splitList(process.env.ALLOWED_ADMIN_SUB);

const isProd = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackUrl = process.env.CALLBACK_URL || process.env.CALLBACK_URL_FALLBACK;
const sessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN || (isProd ? ".2jog.dev" : undefined);
const RESUME_RETURN_COOKIE = "resume_return";
const RESUME_RETURN_ORIGIN = "https://resume.2jog.dev";

if (isProd) {
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required in production");
  }
  if (!googleClientId || !googleClientSecret || !callbackUrl) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and CALLBACK_URL are required in production");
  }
}

const isAllowedAdmin = (email?: string | null, sub?: string | null) => {
  if (sub && allowedAdminSubs.includes(sub)) return true;
  if (email && allowedAdminEmails.includes(email)) return true;
  return false;
};

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  app.use(
    session({
      secret: sessionSecret || "dev-secret",
      resave: false,
      saveUninitialized: false,
      store: new PgSession({
        pool,
        tableName: "session",
        schemaName: "public",
      }),
      cookie: {
        httpOnly: true,
        domain: sessionCookieDomain,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId || "",
        clientSecret: googleClientSecret || "",
        callbackURL: callbackUrl || "",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? null;
          const sub = profile.id ?? null;
          const name = profile.displayName ?? null;

          if (!isAllowedAdmin(email, sub)) {
            return done(null, false);
          }

          const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.googleSub, sub));

          if (existing) {
            const updates: { email?: string; name?: string | null } = {};
            if (email && existing.email !== email) {
              updates.email = email;
            }
            if (existing.name !== name) {
              updates.name = name;
            }

            if (Object.keys(updates).length > 0) {
              await db
                .update(users)
                .set(updates)
                .where(eq(users.id, existing.id));
            }
            return done(null, existing);
          }

          const [created] = await db
            .insert(users)
            .values({
              email: email || "",
              googleSub: sub || "",
              name,
              role: "admin",
            })
            .returning();

          return done(null, created);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Forbidden" });
};

const getResumeReturnFromCookie = (headersCookie: string | undefined): string | undefined => {
  const candidate = parseCookies(headersCookie)[RESUME_RETURN_COOKIE];
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    return parsed.origin === RESUME_RETURN_ORIGIN ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const authRoutes = {
  start: passport.authenticate("google", { scope: ["profile", "email"] }),
  callback: (req: Request, res: Response, next: NextFunction) => {
    return passport.authenticate("google", (error: unknown, user: Express.User | false | null, _info: unknown) => {
      if (error) return next(error);
      if (!user) return res.redirect("/?auth=denied");

      req.login(user, (loginError: unknown) => {
        if (loginError) return next(loginError);

        const resumeReturn = getResumeReturnFromCookie(req.headers.cookie);
        if (resumeReturn) {
          res.clearCookie(RESUME_RETURN_COOKIE, {
            path: "/",
            httpOnly: false,
            sameSite: "lax",
            secure: isProd,
            domain: sessionCookieDomain,
          });
          return res.redirect(resumeReturn);
        }

        return res.status(404).json({ error: "Missing resume return target" });
      });
    })(req, res, next);
  },
};

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      googleSub: string;
      name: string | null;
      role: string;
    }
  }
}
