import { expect, test } from "@playwright/test";
import { installMockApi, seedBrowserState } from "../support/mock-api";

async function setupConsentPage(page: import("@playwright/test").Page, consent: "accept_all" | "reject_all" | "none" = "none") {
  await installMockApi(page);
  await seedBrowserState(page, {
    introSeen: true,
    consent,
    logRocketTestMode: true,
  });
}

async function logRocketEvents(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.__LOGROCKET_TEST_EVENTS ?? []);
}

async function consentRecord(page: import("@playwright/test").Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("__consent_record") || "null"));
}

test("no consent does not initialize LogRocket recording", async ({ page }) => {
  await setupConsentPage(page, "none");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("consent-banner")).toBeVisible();

  const events = await logRocketEvents(page);
  expect(events.some((event) => event.event === "init")).toBe(false);
});

test("Reject All stores essential-only consent and blocks recording", async ({ page }) => {
  await setupConsentPage(page, "none");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Reject All" }).click();
  await expect(page.getByTestId("consent-banner")).toBeHidden();

  const record = await consentRecord(page);
  expect(record.user_action).toBe("reject_all");
  expect(record.categories_accepted).toEqual(["essential"]);

  const events = await logRocketEvents(page);
  expect(events.some((event) => event.event === "init")).toBe(false);
});

test("Manage Preferences with analytics disabled blocks recording", async ({ page }) => {
  await setupConsentPage(page, "none");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Manage Preferences" }).click();

  const analytics = page.getByRole("checkbox", { name: "Analytics & Performance" });
  await expect(analytics).toBeChecked();
  await analytics.click();
  await expect(analytics).not.toBeChecked();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("consent-banner")).toBeHidden();

  const record = await consentRecord(page);
  expect(record.user_action).toBe("custom");
  expect(record.categories_accepted).toEqual(["essential"]);

  const events = await logRocketEvents(page);
  expect(events.some((event) => event.event === "init")).toBe(false);
});

test("Accept All permits LogRocket initialization", async ({ page }) => {
  await setupConsentPage(page, "none");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Accept All" }).click();

  await expect
    .poll(async () => {
      const events = await logRocketEvents(page);
      return events.some((event) => event.event === "init");
    })
    .toBe(true);

  const record = await consentRecord(page);
  expect(record.user_action).toBe("accept_all");
  expect(record.categories_accepted).toEqual(["essential", "analytics"]);
});

test("no-tracking query param stores reject-all consent and blocks recording", async ({ page }) => {
  await setupConsentPage(page, "none");
  await page.goto("/?no-tracking=true", { waitUntil: "domcontentloaded" });

  await expect.poll(() => consentRecord(page)).toMatchObject({
    user_action: "reject_all",
    categories_accepted: ["essential"],
  });

  const events = await logRocketEvents(page);
  expect(events.some((event) => event.event === "init")).toBe(false);
  await expect(page.getByTestId("consent-banner")).toHaveCount(0);
});
