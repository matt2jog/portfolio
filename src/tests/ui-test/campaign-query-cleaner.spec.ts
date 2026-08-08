import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await seedBrowserState(page);
});

test("retired campaign parameter is stripped without a tracking request", async ({ page }) => {
  const trackingRequests: string[] = [];
  await page.route("**/api/public/tracking/tr-en", (route) => {
    trackingRequests.push("called");
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto("/?tr_en=campaign1", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  expect(trackingRequests).toHaveLength(0);
});

test("retired campaign parameter is discarded without browser persistence", async ({ page }) => {
  await page.goto("/?tr_en=partner42", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  const persisted = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(persisted.local).not.toContain("tr_en");
  expect(persisted.session).not.toContain("tr_en");
});

test("retired campaign parameter removal preserves unrelated parameters", async ({ page }) => {
  await page.goto("/?keep=yes&tr_en=x", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
});
