import type { Request } from "express";
import geoip from "geoip-lite";

function normalizeIp(ip: string): string {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0]?.trim() || req.ip || "";
  return normalizeIp(raw);
}

export function isLocalIp(ip: string): boolean {
  if (!ip) return false;

  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;

  const octets = ip.split(".");
  if (octets.length === 4) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (first === 172 && second >= 16 && second <= 31) return true;
  }

  return false;
}

export function detectCountryFromIP(ip: string): string | undefined {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return undefined;
  if (isLocalIp(cleanIp)) return "US";

  const result = geoip.lookup(cleanIp);
  return result?.country || undefined;
}
