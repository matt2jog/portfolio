import assert from "node:assert/strict";
import { after, test } from "node:test";
import type {
  CookieOptions,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import {
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose";
import {
  Auth0WebClient,
  isLegacyAuthEnabled,
  isSameOriginMutation,
  loadAuth0WebConfig,
} from "../../backend/auth0Web";

const originalFetch = globalThis.fetch;
const publicBaseUrl = "https://2jog.dev";
const sessionSecretValue = "portfolio-auth0-session-secret-for-tests";

after(() => {
  globalThis.fetch = originalFetch;
});

function auth0Environment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    AUTH0_ISSUER_BASE_URL: "https://portfolio-test.us.auth0.com/",
    AUTH0_CLIENT_ID: "portfolio-test-client",
    AUTH0_CLIENT_SECRET: "portfolio-test-client-secret",
    AUTH0_SESSION_SECRET: sessionSecretValue,
    AUTH0_CALLBACK_URL: `${publicBaseUrl}/auth/callback`,
    AUTH0_BROWSER_AUDIENCE: "https://api.2jog.dev/platform",
    AUTH0_BROWSER_REQUIRED_SCOPE: "platform:admin",
    AUTH0_SESSION_TTL_SECONDS: "3600",
    ...overrides,
  };
}

function auth0Config(environment = auth0Environment()) {
  return loadAuth0WebConfig({
    serviceId: "portfolio",
    publicBaseUrl,
    nodeEnv: "test",
    environment,
  });
}

interface RecordedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

function responseRecorder(): {
  response: ExpressResponse;
  cookies: RecordedCookie[];
  cleared: Array<{ name: string; options: CookieOptions }>;
  headers: Map<string, string>;
  redirect?: { status: number; url: string };
} {
  const cookies: RecordedCookie[] = [];
  const cleared: Array<{ name: string; options: CookieOptions }> = [];
  const headers = new Map<string, string>();
  const recorder: {
    response: ExpressResponse;
    cookies: RecordedCookie[];
    cleared: Array<{ name: string; options: CookieOptions }>;
    headers: Map<string, string>;
    redirect?: { status: number; url: string };
  } = {
    response: undefined as unknown as ExpressResponse,
    cookies,
    cleared,
    headers,
  };
  const response = {
    cookie(name: string, value: string, options: CookieOptions) {
      cookies.push({ name, value, options });
      return response;
    },
    clearCookie(name: string, options: CookieOptions) {
      cleared.push({ name, options });
      return response;
    },
    set(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    redirect(status: number, url: string) {
      recorder.redirect = { status, url };
      return response;
    },
  } as unknown as ExpressResponse;
  recorder.response = response;
  return recorder;
}

function requestStub(options: {
  query?: Record<string, unknown>;
  cookie?: string;
  method?: string;
  origin?: string;
  fetchSite?: string;
} = {}): ExpressRequest {
  const requestHeaders = new Map<string, string>();
  if (options.origin) requestHeaders.set("origin", options.origin);
  if (options.fetchSite) requestHeaders.set("sec-fetch-site", options.fetchSite);
  return {
    query: options.query ?? {},
    headers: options.cookie ? { cookie: options.cookie } : {},
    method: options.method ?? "GET",
    get(name: string) {
      return requestHeaders.get(name.toLowerCase());
    },
  } as unknown as ExpressRequest;
}

test("Auth0 configuration requires one complete exact browser client", () => {
  const disabled = auth0Config({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.sessionCookieName, "2jog-portfolio-session");

  assert.throws(
    () => auth0Config({ AUTH0_CLIENT_ID: "partial" }),
    /must be configured together/,
  );
  assert.throws(
    () => auth0Config(auth0Environment({ AUTH0_ISSUER_BASE_URL: "http://tenant.example" })),
    /HTTPS origin/,
  );
  assert.throws(
    () => auth0Config(auth0Environment({ AUTH0_SESSION_SECRET: "too-short" })),
    /at least 32 bytes/,
  );
  assert.throws(
    () => auth0Config(auth0Environment({
      AUTH0_CALLBACK_URL: "https://attacker.example/auth/callback",
    })),
    /exact service callback/,
  );
  assert.throws(
    () => auth0Config(auth0Environment({ AUTH0_SESSION_TTL_SECONDS: "60" })),
    /between 300 and 86400/,
  );

  const production = loadAuth0WebConfig({
    serviceId: "portfolio",
    publicBaseUrl,
    nodeEnv: "production",
    environment: auth0Environment(),
  });
  assert.equal(production.enabled, true);
  assert.equal(production.issuer, "https://portfolio-test.us.auth0.com/");
  assert.equal(production.sessionCookieName, "__Host-2jog-portfolio-session");
  assert.equal(production.transactionCookieName, "__Secure-2jog-portfolio-auth");
});

test("Auth0 login starts an exact PKCE transaction and rejects unsafe return targets", async () => {
  const client = new Auth0WebClient(auth0Config());
  const recorder = responseRecorder();

  await client.start(
    requestStub({ query: { returnTo: "https://attacker.example/admin" } }),
    recorder.response,
  );

  assert.equal(recorder.cookies.length, 1);
  const transactionCookie = recorder.cookies[0]!;
  assert.equal(transactionCookie.name, "2jog-portfolio-auth");
  assert.equal(transactionCookie.options.httpOnly, true);
  assert.equal(transactionCookie.options.sameSite, "lax");
  assert.equal(transactionCookie.options.path, "/auth/callback");
  assert.equal(recorder.headers.get("cache-control"), "no-store");
  assert.equal(recorder.redirect?.status, 302);

  const authorization = new URL(recorder.redirect!.url);
  assert.equal(authorization.origin, "https://portfolio-test.us.auth0.com");
  assert.equal(authorization.pathname, "/authorize");
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("client_id"), "portfolio-test-client");
  assert.equal(authorization.searchParams.get("redirect_uri"), `${publicBaseUrl}/auth/callback`);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.match(authorization.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.match(authorization.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]+$/);

  const transaction = await jwtVerify(
    transactionCookie.value,
    new TextEncoder().encode(sessionSecretValue),
    {
      algorithms: ["HS256"],
      issuer: `${publicBaseUrl}/auth`,
      audience: "portfolio:browser-session",
    },
  );
  assert.equal(transaction.protectedHeader.typ, "auth0-transaction+jwt");
  assert.equal(transaction.payload.returnTo, `${publicBaseUrl}/`);
  assert.equal(transaction.payload.state, authorization.searchParams.get("state"));
  assert.equal(typeof transaction.payload.nonce, "string");
  assert.equal(typeof transaction.payload.codeVerifier, "string");
});

test("Auth0 callback pins token classes and issues a host-only local session", async () => {
  const config = auth0Config();
  const client = new Auth0WebClient(config);
  const startResponse = responseRecorder();
  await client.start(
    requestStub({ query: { returnTo: "/admin/skills?view=active#ignored" } }),
    startResponse.response,
  );
  const transactionCookie = startResponse.cookies[0]!;
  const transaction = await jwtVerify(
    transactionCookie.value,
    config.sessionSecret,
    {
      algorithms: ["HS256"],
      issuer: `${publicBaseUrl}/auth`,
      audience: "portfolio:browser-session",
    },
  );
  const state = String(transaction.payload.state);
  const nonce = String(transaction.payload.nonce);
  const codeVerifier = String(transaction.payload.codeVerifier);

  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "portfolio-auth0-test";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const now = Math.floor(Date.now() / 1_000);
  const idToken = await new SignJWT({
    email: "Admin@Example.com",
    email_verified: true,
    name: "Portfolio Admin",
    nonce,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
    .setIssuer(config.issuer)
    .setAudience(config.clientId)
    .setSubject("auth0|portfolio-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 1_800)
    .sign(privateKey);
  const accessToken = await new SignJWT({
    permissions: ["platform:admin"],
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
    .setIssuer(config.issuer)
    .setAudience(config.browserAudience)
    .setSubject("auth0|portfolio-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 1_800)
    .sign(privateKey);

  let tokenExchangeSeen = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenExchangeSeen = true;
      assert.equal(init?.method, "POST");
      assert.match(new Headers(init?.headers).get("authorization") ?? "", /^Basic /);
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "one-time-code");
      assert.equal(body.get("code_verifier"), codeVerifier);
      return Response.json({ id_token: idToken, access_token: accessToken });
    }
    if (url.pathname === "/.well-known/jwks.json") {
      return Response.json({ keys: [jwk] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const callbackResponse = responseRecorder();
  const result = await client.callback(
    requestStub({
      cookie: `${transactionCookie.name}=${transactionCookie.value}`,
      query: { state, code: "one-time-code" },
    }),
    callbackResponse.response,
  );

  assert.equal(tokenExchangeSeen, true);
  assert.equal(result.identity.subject, "auth0|portfolio-admin");
  assert.equal(result.identity.email, "admin@example.com");
  assert.deepEqual(result.identity.scopes, ["platform:admin"]);
  assert.equal(result.returnTo, `${publicBaseUrl}/admin/skills?view=active`);
  assert.equal(callbackResponse.cleared[0]?.name, "2jog-portfolio-auth");
  assert.equal(callbackResponse.cookies[0]?.name, "2jog-portfolio-session");
  assert.equal(callbackResponse.cookies[0]?.options.httpOnly, true);
  assert.equal(callbackResponse.cookies[0]?.options.sameSite, "lax");
  assert.equal(callbackResponse.headers.get("cache-control"), "no-store");

  const sessionCookie = callbackResponse.cookies[0]!;
  assert.deepEqual(
    await client.session(requestStub({
      cookie: `${sessionCookie.name}=${sessionCookie.value}`,
    })),
    {
      subject: result.identity.subject,
      scopes: result.identity.scopes,
      expiresAt: result.identity.expiresAt,
      authMethod: "auth0",
    },
  );
  assert.equal(await client.session(requestStub({ cookie: `${sessionCookie.name}=invalid` })), undefined);

  assert.equal(
    client.logoutUrl("https://attacker.example/leave"),
    "https://portfolio-test.us.auth0.com/v2/logout?client_id=portfolio-test-client&returnTo=https%3A%2F%2F2jog.dev",
  );
  client.clearSession(callbackResponse.response);
  assert.deepEqual(
    callbackResponse.cleared.slice(-2).map((entry) => entry.name),
    ["2jog-portfolio-session", "2jog-portfolio-auth"],
  );
});

test("Auth0 callback and browser mutation guards fail closed", async () => {
  const disabled = new Auth0WebClient(auth0Config({}));
  await assert.rejects(
    () => disabled.start(requestStub(), responseRecorder().response),
    /auth0_not_configured/,
  );
  assert.equal(await disabled.session(requestStub()), undefined);
  assert.equal(disabled.logoutUrl(), undefined);

  const enabled = new Auth0WebClient(auth0Config());
  await assert.rejects(
    () => enabled.callback(
      requestStub({ query: { state: "missing", code: "missing" } }),
      responseRecorder().response,
    ),
    /auth0_transaction_missing/,
  );

  assert.equal(isLegacyAuthEnabled({ LEGACY_AUTH_ENABLED: "false" }), false);
  assert.equal(
    isLegacyAuthEnabled({ LEGACY_AUTH_EXPIRES_AT: "2026-01-01T00:00:00Z" }, Date.UTC(2026, 0, 2)),
    false,
  );
  assert.equal(isLegacyAuthEnabled({}, Date.now()), true);

  assert.equal(isSameOriginMutation(requestStub({ method: "GET" }), publicBaseUrl), true);
  assert.equal(
    isSameOriginMutation(
      requestStub({
        method: "POST",
        origin: publicBaseUrl,
        fetchSite: "same-origin",
      }),
      publicBaseUrl,
    ),
    true,
  );
  assert.equal(
    isSameOriginMutation(
      requestStub({
        method: "DELETE",
        origin: "https://attacker.example",
        fetchSite: "cross-site",
      }),
      publicBaseUrl,
    ),
    false,
  );
});
