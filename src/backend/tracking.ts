import type { Request, Response, NextFunction } from "express";
import { db } from "./data/db";
import { browserTracking, browserTrackingIps, browserRequestLogs, ipRateLogs } from "@shared/schema";
import { extractClientIp } from "./geoip";
import { eq } from "drizzle-orm";
import {
  TRACKER_COOKIE_NAME,
  parseCookies,
  generateHashedUuid,
  getRequestTrackerUuid,
  makeTrackingIpCacheKey,
} from "./tracking-utils";

export { TRACKER_COOKIE_NAME, generateHashedUuid, getRequestTrackerUuid } from "./tracking-utils";

// Keyed by makeTrackingIpCacheKey(uuid, ip) → browser_tracking_ips.id
// Populated by registerTrackedUuid; no expiry (the mapping is permanent once consented).
const trackingIpIdCache = new Map<string, string>();

const COOKIE_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years

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

// Minimal TTL cache so we avoid a DB hit on every request after consent.
const trackedUuidsCache = new Map<string, { tracked: boolean; expires: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function isUuidTracked(uuid: string): Promise<boolean> {
  const cached = trackedUuidsCache.get(uuid);
  if (cached && cached.expires > Date.now()) return cached.tracked;

  try {
    const [row] = await db
      .select({ id: browserTracking.id })
      .from(browserTracking)
      .where(eq(browserTracking.hashedUuid, uuid))
      .limit(1);

    const tracked = !!row;
    trackedUuidsCache.set(uuid, { tracked, expires: Date.now() + CACHE_TTL_MS });
    return tracked;
  } catch {
    return false;
  }
}

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();

  const uuid = (req as any).trackerUuid as string | undefined;
  if (!uuid) return next();

  const start = Date.now();
  const ip =
    (req.headers["x-client-ip"] as string | undefined) ||
    extractClientIp(req) ||
    undefined;

  res.on("finish", () => {
    isUuidTracked(uuid).then((tracked) => {
      if (!tracked) return;
      db.insert(browserRequestLogs)
        .values({
          hashedUuid: uuid,
          ip,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          meta: {},
        })
        .catch(() => {});
    }).catch(() => {});
  });

  next();
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

  trackedUuidsCache.set(uuid, { tracked: true, expires: Date.now() + CACHE_TTL_MS });

  if (ip) {
    const [tipRow] = await db
      .insert(browserTrackingIps)
      .values({ hashedUuid: uuid, ip, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [browserTrackingIps.hashedUuid, browserTrackingIps.ip],
        set: { lastSeenAt: now },
      })
      .returning({ id: browserTrackingIps.id });

    if (tipRow?.id) {
      trackingIpIdCache.set(makeTrackingIpCacheKey(uuid, ip), tipRow.id);
    }
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

// Logs every API request by IP regardless of consent, with an optional FK to
// browser_tracking_ips when the UUID is known and consented (for rate-limit queries
// that can optionally join into the full UUID graph for consented users).
export function ipRateLogMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();

  const ip =
    (req.headers["x-client-ip"] as string | undefined) ||
    extractClientIp(req) ||
    undefined;

  if (!ip) return next();

  const uuid = (req as any).trackerUuid as string | undefined;
  const method = req.method;
  const path = req.path;

  res.on("finish", () => {
    const trackingIpId =
      uuid && ip ? (trackingIpIdCache.get(makeTrackingIpCacheKey(uuid, ip)) ?? null) : null;

    db.insert(ipRateLogs)
      .values({ ip, method, path, statusCode: res.statusCode, trackingIpId })
      .catch(() => {});
  });

  next();
}
