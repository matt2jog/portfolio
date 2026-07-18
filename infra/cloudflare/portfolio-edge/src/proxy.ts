import {
  adminIdentityCookie,
  requiresAdminIdentity,
  verifyAdminIdentityAtEdge,
} from "./auth";

const ALLOWED_HOSTS = new Set(["2jog.dev", "www.2jog.dev"]);

type Fetcher = (request: Request) => Promise<Response>;
type IdentityVerifier = (token: string) => Promise<unknown>;

function edgeResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("x-2jog-edge", "portfolio-edge");
  return new Response(body, { ...init, headers });
}

export async function proxyRequest(
  request: Request,
  env: Env,
  fetcher: Fetcher,
  verifyIdentity: IdentityVerifier = verifyAdminIdentityAtEdge,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (!ALLOWED_HOSTS.has(requestUrl.hostname)) {
    return edgeResponse("Misdirected request", { status: 421 });
  }

  if (requestUrl.pathname === "/__edge/health") {
    return edgeResponse(JSON.stringify({ ok: true, worker: "portfolio-edge" }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (requiresAdminIdentity(requestUrl.pathname)) {
    const token = adminIdentityCookie(request.headers.get("cookie"));
    if (!token) return edgeAuthenticationRequired(request, requestUrl);
    try {
      await verifyIdentity(token);
    } catch (error) {
      console.warn(JSON.stringify({
        event: "portfolio_edge_admin_identity_rejected",
        error: error instanceof Error ? error.name : "UnknownError",
      }));
      return edgeAuthenticationRequired(request, requestUrl);
    }
  }

  const originUrl = new URL(env.ORIGIN_URL);
  if (originUrl.protocol !== "https:") {
    console.error(JSON.stringify({ event: "portfolio_edge_invalid_origin", protocol: originUrl.protocol }));
    return edgeResponse("Edge configuration error", { status: 500 });
  }
  originUrl.pathname = requestUrl.pathname;
  originUrl.search = requestUrl.search;

  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  const rawClientCountry = request.cf?.country;
  const clientCountry = typeof rawClientCountry === "string"
    ? rawClientCountry.trim().toUpperCase()
    : undefined;
  headers.delete("forwarded");
  headers.delete("x-client-ip");
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("true-client-ip");
  headers.delete("x-2jog-client-ip");
  headers.delete("x-2jog-client-country");
  headers.delete("x-2jog-origin-token");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.set("x-2jog-origin-token", env.ORIGIN_ACCESS_TOKEN);
  if (clientIp) headers.set("x-2jog-client-ip", clientIp);
  else headers.delete("x-2jog-client-ip");
  if (clientCountry && /^[A-Z]{2}$/.test(clientCountry)) {
    headers.set("x-2jog-client-country", clientCountry);
  } else {
    headers.delete("x-2jog-client-country");
  }
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", "https");

  const requestInit: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  };
  if (requestInit.body) requestInit.duplex = "half";
  const upstreamRequest = new Request(originUrl, requestInit);

  try {
    const upstreamResponse = await fetcher(upstreamRequest);
    return edgeResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "portfolio_edge_origin_failure",
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    return edgeResponse("Portfolio origin unavailable", { status: 502 });
  }
}

function edgeAuthenticationRequired(request: Request, requestUrl: URL): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (
    (request.method === "GET" || request.method === "HEAD")
    && (requestUrl.pathname === "/admin" || requestUrl.pathname.startsWith("/admin/"))
  ) {
    const login = new URL("/auth/google", "https://admin.2jog.dev");
    login.searchParams.set("returnTo", requestUrl.toString());
    headers.set("location", login.toString());
    return edgeResponse(null, { status: 302, headers });
  }
  headers.set("content-type", "application/json; charset=utf-8");
  return edgeResponse(JSON.stringify({ error: "admin_identity_required" }), { status: 401, headers });
}
