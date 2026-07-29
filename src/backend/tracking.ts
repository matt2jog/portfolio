import type { NextFunction, Request, Response } from "express";
import { db } from "./data/db";
import { browserTracking } from "@shared/schema";
import {
  TRACKER_COOKIE_NAME,
  generateHashedUuid,
  parseCookies,
} from "./tracking-utils";

export { TRACKER_COOKIE_NAME, generateHashedUuid, getRequestTrackerUuid } from "./tracking-utils";

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === "production";

export function uuidCookieMiddleware(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  let uuid = cookies[TRACKER_COOKIE_NAME];

  if (!uuid) {
    uuid = generateHashedUuid();
    res.cookie(TRACKER_COOKIE_NAME, uuid, {
      maxAge: COOKIE_MAX_AGE_MS,
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
    });
  }

  (req as Request & { trackerUuid?: string }).trackerUuid = uuid;
  next();
}

export async function registerTrackedUuid(uuid: string): Promise<void> {
  const now = new Date();
  await db
    .insert(browserTracking)
    .values({ hashedUuid: uuid, consentedAt: now })
    .onConflictDoUpdate({
      target: [browserTracking.hashedUuid],
      set: { consentedAt: now, updatedAt: now },
    });
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
