import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const ORIGIN_TOKEN_HEADER = "x-2jog-origin-token";
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 256;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function validTokenShape(value: string | undefined): value is string {
  return Boolean(
    value
    && value.length >= MIN_TOKEN_LENGTH
    && value.length <= MAX_TOKEN_LENGTH
    && TOKEN_PATTERN.test(value),
  );
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authorizeOriginToken(
  expected: string | undefined,
  provided: string | undefined,
  previous?: string,
): boolean {
  if (!validTokenShape(provided)) return false;
  const providedDigest = digest(provided);
  return [expected, previous].some((candidate) => (
    validTokenShape(candidate) && timingSafeEqual(digest(candidate), providedDigest)
  ));
}

export function createOriginAccessMiddleware(
  expectedToken: string | undefined,
  previousToken?: string,
  publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://2jog.dev",
): RequestHandler {
  if (expectedToken !== undefined && !validTokenShape(expectedToken)) {
    throw new Error("EDGE_ORIGIN_TOKEN must be a 32-256 character URL-safe token");
  }
  if (previousToken !== undefined && !validTokenShape(previousToken)) {
    throw new Error("EDGE_ORIGIN_PREVIOUS_TOKEN must be a 32-256 character URL-safe token when provided");
  }

  const canonicalHost = new URL(publicBaseUrl).host.toLowerCase();
  return (request, response, next) => {
    if (
      request.method === "GET"
      && (request.path === "/health" || request.path === "/healthz")
    ) {
      next();
      return;
    }
    if ((request.headers.host ?? "").toLowerCase() === canonicalHost) {
      next();
      return;
    }
    if (authorizeOriginToken(expectedToken, request.header(ORIGIN_TOKEN_HEADER), previousToken)) {
      next();
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "origin_identity_required" });
  };
}
