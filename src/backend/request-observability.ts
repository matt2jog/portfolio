import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { extractClientIp } from "./geoip";

const SAFE_CORRELATION_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
    }
  }
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = normalizedCorrelationValue(req.get("x-request-id")) ?? randomUUID();
  req.correlationId = normalizedCorrelationValue(req.get("x-correlation-id")) ?? req.requestId;
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Correlation-Id", req.correlationId);
  next();
}

export function structuredRequestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.once("finish", () => {
    const failureCode = res.statusCode >= 500
      ? "server_error"
      : res.statusCode >= 400
        ? "client_error"
        : undefined;
    const actorSubject = boundedActorSubject(req.auth0Identity?.subject
      ?? req.user?.auth0Sub
      ?? req.user?.googleSub
      ?? undefined);
    console.log(JSON.stringify({
      event: "portfolio.request.completed",
      request_id: req.requestId,
      correlation_id: req.correlationId,
      method: req.method,
      route: routeTemplate(req),
      status: res.statusCode,
      outcome: failureCode ? "failure" : "success",
      ...(failureCode
        ? { failure_code: res.locals?.failureCode ?? failureCode }
        : {}),
      duration_ms: Date.now() - startedAt,
      actor_type: req.auth0Identity
        ? "auth0-admin"
        : req.user
          ? "legacy-admin"
          : "anonymous",
      ...(actorSubject ? { actor_subject: actorSubject } : {}),
    }));
  });
  next();
}

export function createChatRateLimitMiddleware(options: {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
  keySalt?: Buffer;
} = {}): RequestHandler {
  const maxRequests = options.maxRequests ?? 20;
  const windowMs = options.windowMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const keySalt = options.keySalt ?? randomBytes(32);
  const entries = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    if (req.path !== "/api/public/chat") return next();
    const currentTime = now();
    const key = createHmac("sha256", keySalt)
      .update(extractClientIp(req) || req.socket.remoteAddress || "shared-anonymous")
      .digest("base64url");
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

    if (entries.size >= 10_000) {
      for (const [entryKey, candidate] of Array.from(entries.entries())) {
        if (candidate.resetAt <= currentTime) entries.delete(entryKey);
      }
      if (entries.size >= 10_000) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey) entries.delete(oldestKey);
      }
    }

    if (entry.count > maxRequests) {
      res.locals ??= {};
      res.locals.failureCode = "chat_rate_limited";
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "chat_rate_limited",
        request_id: req.requestId,
      });
    }

    next();
  };
}

function normalizedCorrelationValue(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && SAFE_CORRELATION_VALUE.test(candidate) ? candidate : undefined;
}

function routeTemplate(req: Request): string {
  const path = req.route?.path;
  if (typeof path !== "string") return "unmatched";
  const baseUrl = req.baseUrl && req.baseUrl !== "/" ? req.baseUrl : "";
  const template = `${baseUrl}${path}`.replace(/\/{2,}/g, "/") || "/";
  return template.length <= 256 && !template.includes("?") ? template : "unmatched";
}

function boundedActorSubject(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && /^[A-Za-z0-9|._:-]{1,160}$/.test(candidate)
    ? candidate
    : undefined;
}
