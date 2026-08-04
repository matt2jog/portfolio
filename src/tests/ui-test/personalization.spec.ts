import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

const FORCE_SHOW_KEY = "__intro_force_show";
const WELCOME_SLUG_KEY = "__intro_welcome_slug";
const INTRO_SEEN_KEY = "__root_intro_seen_until";

async function setup(page: import("@playwright/test").Page, consent: "accept_all" | "reject_all" | "none" = "reject_all") {
  await installMockApi(page);
  await seedBrowserState(page, {
    introSeen: true,
    consent,
    logRocketTestMode: true,
  });
}

test("?welcome= param is stripped from URL after page load", async ({ page }) => {
  await setup(page);
  await page.goto("/?welcome=acme-corp");

  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });
  expect(page.url()).not.toContain("welcome=");
});

test("?welcome= param stores slug in localStorage", async ({ page }) => {
  await setup(page);
  await page.goto("/?welcome=acme-corp");
  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });

  const slug = await page.evaluate((key) => window.localStorage.getItem(key), WELCOME_SLUG_KEY);
  expect(slug).toBe("acme-corp");
});

test("?welcome= param sets the force-show flag in localStorage", async ({ page }) => {
  await setup(page);
  await page.goto("/?welcome=acme-corp");
  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });

  const flag = await page.evaluate((key) => window.localStorage.getItem(key), FORCE_SHOW_KEY);
  expect(flag).toBe("1");
});

test("?welcome= preserves other query params", async ({ page }) => {
  await setup(page);
  await page.goto("/?keep=yes&welcome=acme-corp");

  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });
  const url = new URL(page.url());
  expect(url.searchParams.has("welcome")).toBe(false);
  expect(url.searchParams.get("keep")).toBe("yes");
});

test("intro shows when force-show flag is set even if TTL is active", async ({ page }) => {
  await installMockApi(page);
  await page.addInitScript((keys) => {
    Math.random = () => 0.42;
    window.__LOGROCKET_TEST_MODE = true;
    window.__LOGROCKET_TEST_EVENTS = [];
    window.localStorage.setItem(keys.seenKey, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    window.localStorage.setItem(keys.forceKey, "1");
    window.localStorage.removeItem("__consent_record");
  }, { seenKey: INTRO_SEEN_KEY, forceKey: FORCE_SHOW_KEY });

  await page.goto("/");
  await expect(page.getByTestId("first-visit-intro")).toBeVisible({ timeout: 5000 });
});

test("intro does not show when the force flag is absent and TTL is active", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await expect(page.getByTestId("first-visit-intro")).not.toBeVisible({ timeout: 3000 });
});

test("non-existent welcome slug is stripped without crashing", async ({ page }) => {
  await setup(page);
  await page.goto("/?welcome=does-not-exist");
  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });
  const flag = await page.evaluate((key) => window.localStorage.getItem(key), FORCE_SHOW_KEY);
  expect(flag).toBe("1");
});
