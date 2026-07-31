import type { RequestHandler } from "express";

const VISITOR_NETWORK_HEADERS = [
  "cf-connecting-ip",
  "cf-ipcountry",
  "forwarded",
  "true-client-ip",
  "x-client-ip",
  "x-forwarded-for",
  "x-real-ip",
  "x-2jog-client-country",
  "x-2jog-client-ip",
] as const;

export const discardVisitorNetworkHeaders: RequestHandler = (request, _response, next) => {
  for (const name of VISITOR_NETWORK_HEADERS) {
    delete request.headers[name];
  }
  next();
};

export function createCanonicalHostMiddleware(publicBaseUrl: string): RequestHandler {
  const canonical = new URL(publicBaseUrl);
  if (
    canonical.protocol !== "https:"
    || canonical.username
    || canonical.password
    || canonical.search
    || canonical.hash
  ) {
    throw new Error("PUBLIC_BASE_URL must be a canonical HTTPS origin");
  }

  const canonicalHost = canonical.host.toLowerCase();
  const redirectHosts = canonical.hostname === "2jog.dev"
    ? new Set(["www.2jog.dev", "www.2jog.dev:443"])
    : new Set<string>();

  return (request, response, next) => {
    const requestHost = (request.headers.host ?? "").trim().toLowerCase();
    if (requestHost === canonicalHost) {
      next();
      return;
    }

    if (redirectHosts.has(requestHost)) {
      const target = new URL(canonical.origin);
      const requestTarget = request.originalUrl.startsWith("/") ? request.originalUrl : "/";
      const incoming = new URL(requestTarget, canonical.origin);
      target.pathname = incoming.pathname;
      target.search = incoming.search;
      response.redirect(308, target.toString());
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.status(421).json({ error: "canonical_host_required" });
  };
}
