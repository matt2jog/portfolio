import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

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
    const localFailureWasSet = res.locals?.failureCode !== undefined;
    const localFailureCode = boundedFailureCode(res.locals?.failureCode);
    const failureCode = localFailureWasSet
      ? localFailureCode ?? "request_failed"
      : res.statusCode >= 500
        ? "server_error"
        : res.statusCode >= 400
          ? "client_error"
          : undefined;
    console.log(JSON.stringify({
      event: "portfolio.request.completed",
      request_id: req.requestId,
      correlation_id: req.correlationId,
      method: req.method,
      route: routeTemplate(req),
      status: res.statusCode,
      outcome: failureCode ? "failure" : "success",
      ...(failureCode ? { failure_code: failureCode } : {}),
      duration_ms: Date.now() - startedAt,
      actor_type: "anonymous",
    }));
  });
  next();
}

export function createChatRateLimitMiddleware(options: {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
} = {}): RequestHandler {
  const maxRequests = options.maxRequests ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  let entry: RateLimitEntry = { count: 0, resetAt: 0 };

  return (req, res, next) => {
    if (req.path !== "/api/public/chat") return next();
    const currentTime = now();
    entry = entry.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : entry;

    entry.count += 1;

    const remaining = Math.max(0, maxRequests - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

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

function boundedFailureCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CORRELATION_VALUE.test(value)
    ? value
    : undefined;
}
