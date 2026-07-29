import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ConsentRecord } from "../../client/src/lib/consent";

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

function installBrowser(consent?: ConsentRecord) {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  if (consent) local.set("__consent_record", JSON.stringify(consent));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "" },
      navigator: {},
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => local.set(key, value),
        removeItem: (key: string) => local.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
    },
  });
}

after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("GeoIP caches successful responses and preserves absent country codes", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ ip: "203.0.113.9", country_code: "US" });
  }) as typeof fetch;
  const cached = await import("../../client/src/lib/geoip.ts?case=cached");
  assert.equal((await cached.fetchGeoIP())?.country_code, "US");
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

test("client analytics uses a consent-gated session identifier, not the durable cookie", async () => {
  const tracking = await import("../../client/src/lib/tracking.ts?case=session-id");
  installBrowser();
  assert.equal(tracking.getTrackerUuid(), null);

  installBrowser({
    ...acceptedConsent(),
    user_action: "reject_all",
    categories_accepted: ["essential"],
  });
  assert.equal(tracking.getTrackerUuid(), null);

  installBrowser(acceptedConsent());
  const first = tracking.getTrackerUuid();
  const second = tracking.getTrackerUuid();
  assert.ok(first);
  assert.equal(second, first);
});

test("tracking writes require consent and never request or transmit an IP address", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  installBrowser();
  const blocked = await import("../../client/src/lib/tracking.ts?case=blocked");
  await blocked.initBrowserTracking();
  await blocked.storeTrEn("ignored");
  assert.equal(calls.length, 0);

  installBrowser(acceptedConsent());
  const enabled = await import("../../client/src/lib/tracking.ts?case=enabled");
  await enabled.initBrowserTracking();
  await enabled.storeTrEn("campaign-1");
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/public/tracking/init",
    "/api/public/tracking/tr-en",
  ]);
  assert.equal(calls.some(({ url }) => url.includes("/api/public/ip")), false);
  assert.deepEqual(calls[0]?.init?.headers, { "Content-Type": "application/json" });
  assert.equal(calls[1]?.init?.body, JSON.stringify({ trEn: "campaign-1" }));
});

test("telemetry failures remain non-blocking", async () => {
  globalThis.fetch = (async () => { throw new Error("telemetry unavailable"); }) as typeof fetch;
  installBrowser(acceptedConsent());
  const tracking = await import("../../client/src/lib/tracking.ts?case=offline");
  await tracking.initBrowserTracking();
  await tracking.storeTrEn("campaign-2");
});
