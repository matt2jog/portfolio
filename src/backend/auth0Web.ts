import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";

const DEFAULT_BROWSER_AUDIENCE = "https://api.2jog.dev/platform";
const DEFAULT_BROWSER_SCOPE = "platform:admin";
const TRANSACTION_TTL_SECONDS = 10 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface Auth0WebConfig {
  enabled: boolean;
  serviceId: string;
  nodeEnv: string;
  publicBaseUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: Uint8Array;
  callbackUrl: string;
  browserAudience: string;
  browserRequiredScope: string;
  sessionCookieName: string;
  transactionCookieName: string;
  sessionTtlSeconds: number;
}

export interface Auth0BrowserIdentity {
  subject: string;
  email?: string;
  name?: string;
  scopes: string[];
  expiresAt: number;
  authMethod: "auth0";
}

export interface Auth0CallbackResult {
  identity: Auth0BrowserIdentity;
  returnTo: string;
}

interface Auth0TransactionClaims extends JWTPayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

interface TokenResponse {
  access_token?: unknown;
  id_token?: unknown;
}

export class Auth0WebClient {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  public constructor(public readonly config: Auth0WebConfig) {
    this.jwks = config.enabled
      ? createRemoteJWKSet(new URL(".well-known/jwks.json", config.issuer))
      : undefined;
  }

  public async start(request: Request, response: Response): Promise<void> {
    this.assertEnabled();
    const returnTo = normalizeReturnTo(
      typeof request.query.returnTo === "string" ? request.query.returnTo : undefined,
      this.config.publicBaseUrl,
    );
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const now = Math.floor(Date.now() / 1_000);
    const transaction = await new SignJWT({
      state,
      nonce,
      codeVerifier,
      returnTo,
    })
      .setProtectedHeader({ alg: "HS256", typ: "auth0-transaction+jwt" })
      .setIssuer(this.localIssuer)
      .setAudience(this.localAudience)
      .setIssuedAt(now)
      .setExpirationTime(now + TRANSACTION_TTL_SECONDS)
      .sign(this.config.sessionSecret);

    response.cookie(
      this.config.transactionCookieName,
      transaction,
      transactionCookieOptions(this.config.nodeEnv),
    );

    const authorization = new URL("authorize", this.config.issuer);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("client_id", this.config.clientId);
    authorization.searchParams.set("redirect_uri", this.config.callbackUrl);
    authorization.searchParams.set(
      "scope",
      `openid profile email ${this.config.browserRequiredScope}`,
    );
    authorization.searchParams.set("audience", this.config.browserAudience);
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("nonce", nonce);
    authorization.searchParams.set(
      "code_challenge",
      createHash("sha256").update(codeVerifier).digest("base64url"),
    );
    authorization.searchParams.set("code_challenge_method", "S256");

    response.set("Cache-Control", "no-store");
    response.redirect(302, authorization.toString());
  }

  public async callback(request: Request, response: Response): Promise<Auth0CallbackResult> {
    this.assertEnabled();
    const transactionToken = cookieValue(
      request.headers.cookie,
      this.config.transactionCookieName,
    );
    response.clearCookie(
      this.config.transactionCookieName,
      clearCookieOptions(transactionCookieOptions(this.config.nodeEnv)),
    );
    if (!transactionToken) throw new Error("auth0_transaction_missing");

    const transaction = await this.verifyTransaction(transactionToken);
    const state = singleQueryValue(request.query.state);
    const code = singleQueryValue(request.query.code);
    if (!state || !code || !sameValue(state, transaction.state)) {
      throw new Error("auth0_callback_invalid");
    }

    const tokenResponse = await this.exchangeCode(code, transaction.codeVerifier);
    const identity = await this.verifyTokens(
      tokenResponse.idToken,
      tokenResponse.accessToken,
      transaction.nonce,
    );
    const session = await this.issueSession(identity);
    response.cookie(
      this.config.sessionCookieName,
      session,
      sessionCookieOptions(
        this.config.nodeEnv,
        Math.max(0, identity.expiresAt - Math.floor(Date.now() / 1_000)),
      ),
    );
    response.set("Cache-Control", "no-store");
    return { identity, returnTo: transaction.returnTo };
  }

  public async session(request: Request): Promise<Auth0BrowserIdentity | undefined> {
    if (!this.config.enabled) return undefined;
    const token = cookieValue(request.headers.cookie, this.config.sessionCookieName);
    if (!token) return undefined;
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.config.sessionSecret, {
        algorithms: ["HS256"],
        issuer: this.localIssuer,
        audience: this.localAudience,
        requiredClaims: ["sub", "exp", "iat", "scopes", "auth_method"],
      });
      if (protectedHeader.typ !== "auth0-session+jwt") return undefined;
      if (
        typeof payload.sub !== "string"
        || payload.auth_method !== "auth0"
        || !Array.isArray(payload.scopes)
        || !payload.scopes.every((scope) => typeof scope === "string")
        || typeof payload.exp !== "number"
      ) {
        return undefined;
      }
      return {
        subject: payload.sub,
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        scopes: payload.scopes,
        expiresAt: payload.exp,
        authMethod: "auth0",
      };
    } catch {
      return undefined;
    }
  }

  public clearSession(response: Response): void {
    response.clearCookie(
      this.config.sessionCookieName,
      clearCookieOptions(sessionCookieOptions(this.config.nodeEnv, 0)),
    );
    response.clearCookie(
      this.config.transactionCookieName,
      clearCookieOptions(transactionCookieOptions(this.config.nodeEnv)),
    );
  }

  public logoutUrl(returnTo = this.config.publicBaseUrl): string | undefined {
    if (!this.config.enabled) return undefined;
    const url = new URL("v2/logout", this.config.issuer);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set(
      "returnTo",
      normalizeReturnTo(returnTo, this.config.publicBaseUrl, true),
    );
    return url.toString();
  }

  private async verifyTransaction(token: string): Promise<Auth0TransactionClaims> {
    const { payload, protectedHeader } = await jwtVerify(token, this.config.sessionSecret, {
      algorithms: ["HS256"],
      issuer: this.localIssuer,
      audience: this.localAudience,
      requiredClaims: ["state", "nonce", "codeVerifier", "returnTo", "iat", "exp"],
    });
    if (
      protectedHeader.typ !== "auth0-transaction+jwt"
      || typeof payload.state !== "string"
      || typeof payload.nonce !== "string"
      || typeof payload.codeVerifier !== "string"
      || typeof payload.returnTo !== "string"
    ) {
      throw new Error("auth0_transaction_invalid");
    }
    return payload as Auth0TransactionClaims;
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ accessToken: string; idToken: string }> {
    if (code.length > 8_192) throw new Error("auth0_code_invalid");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      code,
      code_verifier: codeVerifier,
    });
    const response = await fetch(new URL("oauth/token", this.config.issuer), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("auth0_token_exchange_failed");
    const document = await response.json() as TokenResponse;
    if (
      typeof document.id_token !== "string"
      || typeof document.access_token !== "string"
    ) {
      throw new Error("auth0_token_response_invalid");
    }
    return { idToken: document.id_token, accessToken: document.access_token };
  }

  private async verifyTokens(
    idToken: string,
    accessToken: string,
    nonce: string,
  ): Promise<Auth0BrowserIdentity> {
    if (!this.jwks) throw new Error("auth0_not_configured");
    const [idResult, accessResult] = await Promise.all([
      jwtVerify(idToken, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.config.issuer,
        audience: this.config.clientId,
        requiredClaims: ["sub", "exp", "iat", "nonce"],
        clockTolerance: 30,
      }),
      jwtVerify(accessToken, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.config.issuer,
        audience: this.config.browserAudience,
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: 30,
      }),
    ]);
    if (
      typeof idResult.payload.sub !== "string"
      || typeof accessResult.payload.sub !== "string"
      || typeof idResult.payload.email !== "string"
      || idResult.payload.email_verified !== true
      || !sameValue(idResult.payload.sub, accessResult.payload.sub)
      || typeof idResult.payload.nonce !== "string"
      || !sameValue(idResult.payload.nonce, nonce)
    ) {
      throw new Error("auth0_token_class_mismatch");
    }
    const scopes = tokenScopes(accessResult.payload);
    if (!scopes.includes(this.config.browserRequiredScope)) {
      throw new Error("auth0_scope_missing");
    }
    const now = Math.floor(Date.now() / 1_000);
    const tokenExpiry = Math.min(
      Number(idResult.payload.exp),
      Number(accessResult.payload.exp),
    );
    const expiresAt = Math.min(
      tokenExpiry,
      now + this.config.sessionTtlSeconds,
    );
    if (!Number.isInteger(expiresAt) || expiresAt <= now) {
      throw new Error("auth0_token_expired");
    }
    return {
      subject: idResult.payload.sub,
      email: idResult.payload.email.trim().toLowerCase(),
      ...(typeof idResult.payload.name === "string"
        ? { name: idResult.payload.name }
        : {}),
      scopes,
      expiresAt,
      authMethod: "auth0",
    };
  }

  private async issueSession(identity: Auth0BrowserIdentity): Promise<string> {
    return new SignJWT({
      scopes: identity.scopes,
      auth_method: identity.authMethod,
    })
      .setProtectedHeader({ alg: "HS256", typ: "auth0-session+jwt" })
      .setIssuer(this.localIssuer)
      .setAudience(this.localAudience)
      .setSubject(identity.subject)
      .setIssuedAt()
      .setExpirationTime(identity.expiresAt)
      .sign(this.config.sessionSecret);
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new Error("auth0_not_configured");
  }

  private get localIssuer(): string {
    return `${this.config.publicBaseUrl}/auth`;
  }

  private get localAudience(): string {
    return `${this.config.serviceId}:browser-session`;
  }
}

export function loadAuth0WebConfig(options: {
  serviceId: string;
  publicBaseUrl: string;
  nodeEnv: string;
  environment?: NodeJS.ProcessEnv;
}): Auth0WebConfig {
  const environment = options.environment ?? process.env;
  const issuerValue = environment.AUTH0_ISSUER_BASE_URL?.trim();
  const clientId = environment.AUTH0_CLIENT_ID?.trim() ?? "";
  const clientSecret = environment.AUTH0_CLIENT_SECRET ?? "";
  const sessionSecretValue = environment.AUTH0_SESSION_SECRET ?? "";
  const configured = [issuerValue, clientId, clientSecret, sessionSecretValue]
    .filter(Boolean).length;
  if (configured !== 0 && configured !== 4) {
    throw new Error(
      "AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_SESSION_SECRET must be configured together",
    );
  }
  const enabled = configured === 4;
  const issuer = enabled ? normalizeIssuer(issuerValue!) : "https://auth.invalid/";
  if (enabled && Buffer.byteLength(sessionSecretValue, "utf8") < 32) {
    throw new Error("AUTH0_SESSION_SECRET must contain at least 32 bytes");
  }
  const callbackUrl = environment.AUTH0_CALLBACK_URL
    || new URL("/auth/callback", options.publicBaseUrl).toString();
  if (
    enabled
    && callbackUrl !== new URL("/auth/callback", options.publicBaseUrl).toString()
  ) {
    throw new Error("AUTH0_CALLBACK_URL must be the exact service callback URL");
  }
  const sessionTtlSeconds = integerInRange(
    environment.AUTH0_SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    300,
    MAX_SESSION_TTL_SECONDS,
  );
  return {
    enabled,
    serviceId: options.serviceId,
    nodeEnv: options.nodeEnv,
    publicBaseUrl: stripTrailingSlash(options.publicBaseUrl),
    issuer,
    clientId,
    clientSecret,
    sessionSecret: new TextEncoder().encode(sessionSecretValue || "development-only-session-secret"),
    callbackUrl,
    browserAudience: environment.AUTH0_BROWSER_AUDIENCE
      || DEFAULT_BROWSER_AUDIENCE,
    browserRequiredScope: environment.AUTH0_BROWSER_REQUIRED_SCOPE
      || DEFAULT_BROWSER_SCOPE,
    sessionCookieName: options.nodeEnv === "production"
      ? `__Host-2jog-${options.serviceId}-session`
      : `2jog-${options.serviceId}-session`,
    transactionCookieName: options.nodeEnv === "production"
      ? `__Secure-2jog-${options.serviceId}-auth`
      : `2jog-${options.serviceId}-auth`,
    sessionTtlSeconds,
  };
}

export function isSameOriginMutation(request: Request, publicBaseUrl: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.get("origin");
  const fetchSite = request.get("sec-fetch-site");
  return origin === new URL(publicBaseUrl).origin
    && (!fetchSite || fetchSite === "same-origin" || fetchSite === "none");
}

function normalizeIssuer(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("AUTH0_ISSUER_BASE_URL must be an HTTPS origin");
  }
  url.pathname = "/";
  return url.toString();
}

function normalizeReturnTo(
  requested: string | undefined,
  publicBaseUrl: string,
  allowOriginOnly = false,
): string {
  const base = new URL(publicBaseUrl);
  if (!requested) return allowOriginOnly ? base.origin : `${base.origin}/`;
  try {
    const candidate = new URL(requested, base);
    if (
      candidate.origin === base.origin
      && !candidate.username
      && !candidate.password
      && (!allowOriginOnly || candidate.pathname === "/")
    ) {
      candidate.hash = "";
      return candidate.toString();
    }
  } catch {
    // Use the safe service root below.
  }
  return allowOriginOnly ? base.origin : `${base.origin}/`;
}

function tokenScopes(payload: JWTPayload): string[] {
  const scopes = new Set<string>();
  if (typeof payload.scope === "string") {
    for (const scope of payload.scope.split(/\s+/)) {
      if (scope) scopes.add(scope);
    }
  }
  if (Array.isArray(payload.permissions)) {
    for (const permission of payload.permissions) {
      if (typeof permission === "string" && permission) scopes.add(permission);
    }
  }
  return Array.from(scopes).sort();
}

function cookieValue(rawCookie: string | undefined, name: string): string | undefined {
  if (!rawCookie) return undefined;
  for (const part of rawCookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value || undefined;
  }
  return undefined;
}

function sessionCookieOptions(nodeEnv: string, maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds * 1_000,
  };
}

function transactionCookieOptions(nodeEnv: string): CookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: TRANSACTION_TTL_SECONDS * 1_000,
  };
}

function clearCookieOptions(options: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, ...rest } = options;
  return rest;
}

function singleQueryValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 8_192 ? value : undefined;
}

function sameValue(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function integerInRange(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`AUTH0_SESSION_TTL_SECONDS must be between ${minimum} and ${maximum}`);
  }
  return value;
}
