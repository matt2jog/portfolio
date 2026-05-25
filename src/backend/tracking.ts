import type { Request, Response, NextFunction } from "express";
import { db } from "./data/db";
import { browserTracking, browserTrackingIps, ipRateLogs } from "@shared/schema";
import { extractClientIp } from "./geoip";
import {
  TRACKER_COOKIE_NAME,
  parseCookies,
  generateHashedUuid,
  getRequestTrackerUuid,
} from "./tracking-utils";

export { TRACKER_COOKIE_NAME, generateHashedUuid, getRequestTrackerUuid } from "./tracking-utils";

const COOKIE_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === "production";

export function uuidCookieMiddleware(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  let uuid = cookies[TRACKER_COOKIE_NAME];

  if (!uuid) {
    uuid = generateHashedUuid();
    res.cookie(TRACKER_COOKIE_NAME, uuid, {
      maxAge: COOKIE_MAX_AGE_MS,
      httpOnly: false,
      sameSite: "lax",
      secure: isProd,
      path: "/",
    });
  }

  (req as any).trackerUuid = uuid;
  next();
}

// Unified request tracking middleware — replaces the old requestLogMiddleware +
// ipRateLogMiddleware pair. Every /api request is logged to ip_rate_logs with:
//   • ip (from headers/socket, nullable)
//   • hashed_uuid (always available from cookie — no consent gate, no warm cache needed)
//   • method, path, status_code, duration_ms
//   • meta (optional per-route extra data set via augmentRequestTracking)
export function requestTrackingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();

  const ip =
    (req.headers["x-client-ip"] as string | undefined) ||
    extractClientIp(req) ||
    undefined;
  const uuid = (req as any).trackerUuid as string | undefined;
  const start = Date.now();

  res.on("finish", () => {
    const meta: Record<string, unknown> = (req as any)._trackingMeta ?? {};
    db.insert(ipRateLogs)
      .values({
        ip: ip ?? null,
        hashedUuid: uuid ?? null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        meta,
      })
      .catch(() => {});
  });

  next();
}

// Routes call this to attach extra context that lands in ip_rate_logs.meta.
// Safe to call multiple times — values are merged.
export function augmentRequestTracking(req: Request, meta: Record<string, unknown>): void {
  if (!(req as any)._trackingMeta) (req as any)._trackingMeta = {};
  Object.assign((req as any)._trackingMeta, meta);
}

export async function registerTrackedUuid(uuid: string, ip: string | undefined): Promise<void> {
  const now = new Date();

  await db
    .insert(browserTracking)
    .values({ hashedUuid: uuid, consentedAt: now })
    .onConflictDoUpdate({
      target: [browserTracking.hashedUuid],
      set: { consentedAt: now, updatedAt: now },
    });

  if (ip) {
    await db
      .insert(browserTrackingIps)
      .values({ hashedUuid: uuid, ip, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [browserTrackingIps.hashedUuid, browserTrackingIps.ip],
        set: { lastSeenAt: now },
      });
  }
}

export async function upsertTrEn(uuid: string, trEn: string): Promise<void> {
  const now = new Date();
  await db
    .insert(browserTracking)
    .values({ hashedUuid: uuid, trEn })
    .onConflictDoUpdate({
      target: [browserTracking.hashedUuid],
      set: { trEn, updatedAt: now },
    });
}
