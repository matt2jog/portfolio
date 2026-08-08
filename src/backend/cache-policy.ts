import type { RequestHandler } from "express";

export function requiresNoStore(pathname: string): boolean {
  return pathname === "/api"
    || pathname.startsWith("/api/");
}

export const dynamicResponseCachePolicy: RequestHandler = (request, response, next) => {
  if (requiresNoStore(request.path)) {
    response.setHeader("Cache-Control", "no-store");
  }
  next();
};
