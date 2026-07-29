import { createHash, randomUUID } from "crypto";
import type { Request } from "express";

export const TRACKER_COOKIE_NAME = "tr_uuid";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const sep = part.indexOf("=");
    if (sep < 1) continue;
    out[part.slice(0, sep).trim()] = decodeURIComponent(part.slice(sep + 1).trim());
  }
  return out;
}

export function generateHashedUuid(): string {
  return createHash("sha256").update(randomUUID()).digest("hex");
}

export function getRequestTrackerUuid(req: Request): string | undefined {
  const value = parseCookies(req.headers.cookie)[TRACKER_COOKIE_NAME];
  return /^[0-9a-f]{64}$/.test(value ?? "") ? value : undefined;
}
