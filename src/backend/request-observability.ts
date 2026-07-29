import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { extractClientIp } from "./geoip";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

export function structuredRequestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(JSON.stringify({
      event: "portfolio.request.completed",
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
    }));
  });
  next();
}

export function createApiRateLimitMiddleware(options: {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
} = {}): RequestHandler {
  const maxRequests = options.maxRequests ?? 240;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    if (!req.path.startsWith("/api") || req.path === "/api/healthz") return next();
    const currentTime = now();
    const key = extractClientIp(req) || "local";
    const existing = entries.get(key);
    const entry = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;

    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(0, maxRequests - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

    if (entries.size > 10_000) {
      for (const [entryKey, candidate] of Array.from(entries.entries())) {
        if (candidate.resetAt <= currentTime) entries.delete(entryKey);
      }
    }

    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests",
        request_id: req.requestId,
      });
    }

    next();
  };
}
