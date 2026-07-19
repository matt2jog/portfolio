import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  clearConsent,
  getCategoriesForChoice,
  getStoredConsent,
  isGlobalOptOutEnabled,
  isTrackingAllowed,
  shouldShowConsentBanner,
  storeConsent,
  type ConsentRecord,
} from "../../client/src/lib/consent";

const storageKey = "__consent_record";
const originalWindow = globalThis.window;

function record(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    timestamp: new Date().toISOString(),
    jurisdiction_detected: null,
    policy_version: "1.0",
    categories_accepted: ["essential"],
    user_action: "reject_all",
    ...overrides,
  };
}

function installWindow(options: {
  search?: string;
  initial?: string;
  doNotTrack?: string;
  windowDoNotTrack?: string;
  msDoNotTrack?: string;
  globalPrivacyControl?: boolean;
  failReads?: boolean;
  failWrites?: boolean;
} = {}) {
  const values = new Map<string, string>();
  if (options.initial !== undefined) values.set(storageKey, options.initial);
  const localStorage = {
    getItem(key: string) {
      if (options.failReads) throw new Error("read blocked");
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.failWrites) throw new Error("write blocked");
      values.set(key, value);
    },
    removeItem(key: string) {
      if (options.failWrites) throw new Error("write blocked");
      values.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: options.search ?? "" },
      navigator: {
        doNotTrack: options.doNotTrack,
        msDoNotTrack: options.msDoNotTrack,
        globalPrivacyControl: options.globalPrivacyControl,
      },
      doNotTrack: options.windowDoNotTrack,
      localStorage,
    },
  });
  return values;
}

after(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("consent storage handles absent, malformed, expired, current, and blocked storage", () => {
  Reflect.deleteProperty(globalThis, "window");
  assert.equal(getStoredConsent(), null);
  storeConsent(record());
  clearConsent();

  installWindow();
  assert.equal(getStoredConsent(), null);
  installWindow({ initial: "not-json" });
  assert.equal(getStoredConsent(), null);
  installWindow({
    initial: JSON.stringify(record({ timestamp: "2020-01-01T00:00:00.000Z" })),
  });
  assert.equal(getStoredConsent(), null);

  const current = record({ user_action: "accept_all", categories_accepted: ["essential", "analytics"] });
  const values = installWindow();
  storeConsent(current);
  assert.deepEqual(getStoredConsent(), current);
  clearConsent();
  assert.equal(values.has(storageKey), false);

  installWindow({ failReads: true, failWrites: true });
  assert.equal(getStoredConsent(), null);
  storeConsent(current);
  clearConsent();
});

test("global opt-out recognizes query, DNT, and GPC signals", () => {
  Reflect.deleteProperty(globalThis, "window");
  assert.equal(isGlobalOptOutEnabled(), false);

  const values = installWindow({ search: "?no-tracking=TRUE" });
  assert.equal(isGlobalOptOutEnabled(), true);
  assert.equal(JSON.parse(values.get(storageKey) ?? "{}").user_action, "reject_all");
  assert.equal(isGlobalOptOutEnabled(), true);

  installWindow({ doNotTrack: "1" });
  assert.equal(isGlobalOptOutEnabled(), true);
  installWindow({ windowDoNotTrack: "yes" });
  assert.equal(isGlobalOptOutEnabled(), true);
  installWindow({ msDoNotTrack: "1" });
  assert.equal(isGlobalOptOutEnabled(), true);
  installWindow({ globalPrivacyControl: true });
  assert.equal(isGlobalOptOutEnabled(), true);
  installWindow();
  assert.equal(isGlobalOptOutEnabled(), false);
});

test("tracking decisions cover every consent choice", () => {
  installWindow();
  assert.equal(isTrackingAllowed(), false);
  assert.equal(shouldShowConsentBanner(), true);

  installWindow({ initial: JSON.stringify(record()) });
  assert.equal(isTrackingAllowed(), false);
  assert.equal(shouldShowConsentBanner(), false);

  installWindow({ initial: JSON.stringify(record({ user_action: "accept_all" })) });
  assert.equal(isTrackingAllowed(), true);

  installWindow({
    initial: JSON.stringify(record({ user_action: "custom", categories_accepted: ["essential"] })),
  });
  assert.equal(isTrackingAllowed(), false);
  installWindow({
    initial: JSON.stringify(record({ user_action: "custom", categories_accepted: ["essential", "analytics"] })),
  });
  assert.equal(isTrackingAllowed(), true);

  installWindow({ search: "?no-tracking=true", initial: JSON.stringify(record({ user_action: "accept_all" })) });
  assert.equal(isTrackingAllowed(), false);
});

test("category mapping remains explicit and fail-safe", () => {
  assert.deepEqual(getCategoriesForChoice("accept_all"), ["essential", "analytics"]);
  assert.deepEqual(getCategoriesForChoice("reject_all"), ["essential"]);
  assert.deepEqual(getCategoriesForChoice("custom"), []);
  assert.deepEqual(getCategoriesForChoice("unexpected" as never), ["essential"]);
});
