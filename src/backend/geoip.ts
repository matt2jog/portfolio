import type { Request, RequestHandler } from "express";
import { isIP } from "node:net";

declare global {
  namespace Express {
    interface Request {
      edgeOriginAuthenticated?: boolean;
    }
  }
}

function normalizeIp(ip: string): string {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export const markEdgeOriginAuthenticated: RequestHandler = (req, _res, next) => {
  req.edgeOriginAuthenticated = true;
  next();
};

export function extractClientIp(req: Request): string {
  if (!req.edgeOriginAuthenticated) return "";

  const edgeHeader = req.headers["x-2jog-client-ip"];
  const edgeIp = normalizeIp(typeof edgeHeader === "string" ? edgeHeader.trim() : "");
  if (isIP(edgeIp)) return edgeIp;

  return "";
}

export function extractClientCountry(req: Request): string | undefined {
  if (!req.edgeOriginAuthenticated) return undefined;

  const legacyEdgeHeader = req.headers["x-2jog-client-country"];
  const cloudflareHeader = req.headers["cf-ipcountry"];
  const edgeHeader = typeof cloudflareHeader === "string"
    ? cloudflareHeader
    : legacyEdgeHeader;
  const edgeCountry = typeof edgeHeader === "string"
    ? edgeHeader.trim().toUpperCase()
    : "";
  return /^[A-Z]{2}$/.test(edgeCountry) ? edgeCountry : undefined;
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
