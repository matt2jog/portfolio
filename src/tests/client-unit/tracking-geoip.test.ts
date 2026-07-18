import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { ConsentRecord } from "../../client/src/lib/consent";

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function acceptedConsent(): ConsentRecord {
  return {
    timestamp: new Date().toISOString(),
    jurisdiction_detected: "US",
    policy_version: "1.0",
    categories_accepted: ["essential", "analytics"],
    user_action: "accept_all",
  };
}

function installBrowser(consent?: ConsentRecord, cookie = "") {
  const storage = new Map<string, string>();
  if (consent) storage.set("__consent_record", JSON.stringify(consent));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "" },
      navigator: {},
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie },
  });
}

after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [["window", originalWindow], ["document", originalDocument]] as const) {
    if (value === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, { configurable: true, value });
  }
});

test("GeoIP caches successful responses and preserves absent country codes", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ ip: "203.0.113.9", country_code: "US" });
  }) as typeof fetch;
  const cached = await import("../../client/src/lib/geoip.ts?case=cached");
  assert.equal((await cached.fetchGeoIP())?.country_code, "US");
  assert.equal((await cached.fetchGeoIP())?.ip, "203.0.113.9");
  assert.equal(await cached.detectJurisdiction(), "US");
  assert.equal(calls, 1);

  globalThis.fetch = (async () => Response.json({ ip: "203.0.113.10" })) as typeof fetch;
  const noCountry = await import("../../client/src/lib/geoip.ts?case=no-country");
  assert.equal(await noCountry.detectJurisdiction(), null);
});

test("GeoIP fails closed for non-success and network failures", async () => {
  globalThis.fetch = (async () => new Response("no", { status: 503 })) as typeof fetch;
  const nonSuccess = await import("../../client/src/lib/geoip.ts?case=non-success");
  assert.equal(await nonSuccess.fetchGeoIP(), null);

  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  const offline = await import("../../client/src/lib/geoip.ts?case=offline");
  assert.equal(await offline.fetchGeoIP(), null);
});

test("tracking cookie and consent checks fail closed", async () => {
  const tracking = await import("../../client/src/lib/tracking.ts?case=cookies");
  Reflect.deleteProperty(globalThis, "document");
  assert.equal(tracking.getCookieValue("tr_uuid"), null);

  installBrowser(undefined, "other=value");
  assert.equal(tracking.getCookieValue("tr_uuid"), null);
  assert.equal(tracking.getTrackerUuid(), null);

  installBrowser({ ...acceptedConsent(), user_action: "reject_all", categories_accepted: ["essential"] }, "tr_uuid=blocked");
  assert.equal(tracking.getTrackerUuid(), null);

  installBrowser(acceptedConsent(), "other=value; tr_uuid=tracked%20visitor");
  assert.equal(tracking.getCookieValue("tr_uuid"), "tracked visitor");
  assert.equal(tracking.getTrackerUuid(), "tracked visitor");
});

test("client IP lookup shares its in-flight request, caches success, and tolerates failures", async () => {
  let resolveResponse: ((value: Response) => void) | undefined;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Promise<Response>((resolve) => { resolveResponse = resolve; });
  }) as typeof fetch;
  const shared = await import("../../client/src/lib/tracking.ts?case=shared-ip");
  const first = shared.getClientIp();
  const second = shared.getClientIp();
  resolveResponse?.(Response.json({ ip: "198.51.100.7" }));
  assert.equal(await first, "198.51.100.7");
  assert.equal(await second, "198.51.100.7");
  assert.equal(await shared.getClientIp(), "198.51.100.7");
  assert.equal(calls, 1);

  globalThis.fetch = (async () => Response.json({ ip: 7 })) as typeof fetch;
  const invalid = await import("../../client/src/lib/tracking.ts?case=invalid-ip");
  assert.equal(await invalid.getClientIp(), null);

  globalThis.fetch = (async () => Response.json(null)) as typeof fetch;
  const absent = await import("../../client/src/lib/tracking.ts?case=absent-ip");
  assert.equal(await absent.getClientIp(), null);

  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  const offline = await import("../../client/src/lib/tracking.ts?case=offline-ip");
  assert.equal(await offline.getClientIp(), null);
});

test("tracking initialization and referral storage require consent and a tracker cookie", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/public/ip") return Response.json({ ip: "192.0.2.44" });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  installBrowser(undefined);
  const noConsent = await import("../../client/src/lib/tracking.ts?case=no-consent-init");
  await noConsent.initBrowserTracking();
  await noConsent.storeTrEn("ignored");
  assert.equal(calls.length, 0);

  installBrowser(acceptedConsent());
  const noCookie = await import("../../client/src/lib/tracking.ts?case=no-cookie-init");
  await noCookie.initBrowserTracking();
  await noCookie.storeTrEn("ignored");
  assert.equal(calls.length, 0);

  installBrowser(acceptedConsent(), "tr_uuid=visitor-1");
  const enabled = await import("../../client/src/lib/tracking.ts?case=enabled-init");
  await enabled.initBrowserTracking();
  await enabled.storeTrEn("campaign-1");
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/public/ip",
    "/api/public/tracking/init",
    "/api/public/tracking/tr-en",
  ]);
  assert.deepEqual(calls[1]?.init?.headers, {
    "Content-Type": "application/json",
    "X-Client-IP": "192.0.2.44",
  });
  assert.equal(calls[2]?.init?.body, JSON.stringify({ trEn: "campaign-1" }));
});

test("tracking initialization omits an unavailable IP and ignores telemetry write failures", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/public/ip") return Response.json({});
    throw new Error("telemetry unavailable");
  }) as typeof fetch;
  installBrowser(acceptedConsent(), "tr_uuid=visitor-2");
  const tracking = await import("../../client/src/lib/tracking.ts?case=no-ip-init");

  await tracking.initBrowserTracking();
  await tracking.storeTrEn("campaign-2");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/public/ip",
    "/api/public/tracking/init",
    "/api/public/tracking/tr-en",
  ]);
  assert.deepEqual(calls[1]?.init?.headers, { "Content-Type": "application/json" });
});
