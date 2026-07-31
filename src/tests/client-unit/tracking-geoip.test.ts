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

test("GeoIP caches only the explicit unknown-location hint", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ country_code: null, status: "unknown" });
  }) as typeof fetch;
  const cached = await import("../../client/src/lib/geoip.ts?case=cached");
  assert.deepEqual(await cached.fetchGeoIP(), { country_code: null, status: "unknown" });
  assert.equal(await cached.detectJurisdiction(), null);
  assert.equal(calls, 1);

  globalThis.fetch = (async () => Response.json({ country_code: "US" })) as typeof fetch;
  const authoritativeCountry = await import("../../client/src/lib/geoip.ts?case=country");
  assert.equal(await authoritativeCountry.fetchGeoIP(), null);
});

test("GeoIP fails closed for non-success and network failures", async () => {
  globalThis.fetch = (async () => new Response("no", { status: 503 })) as typeof fetch;
  const nonSuccess = await import("../../client/src/lib/geoip.ts?case=non-success");
  assert.equal(await nonSuccess.fetchGeoIP(), null);

  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  const offline = await import("../../client/src/lib/geoip.ts?case=offline");
  assert.equal(await offline.fetchGeoIP(), null);
});

test("client analytics uses only a consent-gated tab session identifier", async () => {
  const tracking = await import("../../client/src/lib/analytics-session.ts?case=session-id");
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
