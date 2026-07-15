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

// ── ?welcome= query param processing ─────────────────────────────────────────

test("?welcome= param is stripped from URL after page load", async ({ page }) => {
  await setup(page);
  await page.goto("/?welcome=acme-corp");

  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });
  expect(page.url()).not.toContain("welcome=");
});

test("?welcome= param stores slug in localStorage", async ({ page }) => {
  await setup(page);

  // Intercept the reload to check localStorage before it navigates away
  await page.addInitScript(() => {
    const origReplace = window.location.replace.bind(window.location);
    (window.location as any).replace = (url: string) => {
      // Store signal before replace fires
      (window as any).__welcomeReplaceTarget = url;
      origReplace(url);
    };
  });

  await page.goto("/?welcome=acme-corp");
  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });

  // After reload: slug should be in localStorage
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

// ── Force-show flag overrides TTL ─────────────────────────────────────────────

test("intro shows when force-show flag is set even if TTL is active", async ({ page }) => {
  await installMockApi(page);
  await page.addInitScript((keys) => {
    Math.random = () => 0.42;
    window.__LOGROCKET_TEST_MODE = true;
    window.__LOGROCKET_TEST_EVENTS = [];
    // TTL valid (seen recently)
    window.localStorage.setItem(keys.seenKey, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    // Force-show override
    window.localStorage.setItem(keys.forceKey, "1");
    window.localStorage.removeItem("__consent_record");
  }, { seenKey: INTRO_SEEN_KEY, forceKey: FORCE_SHOW_KEY });

  await page.goto("/");
  await expect(page.getByTestId("first-visit-intro")).toBeVisible({ timeout: 5000 });
});

test("intro does NOT show when force-show flag is absent and TTL is active", async ({ page }) => {
  await setup(page);
  // introSeen: true from seedBrowserState — TTL is valid, no force-show flag
  await page.goto("/");
  await expect(page.getByTestId("first-visit-intro")).not.toBeVisible({ timeout: 3000 });
});

// ── Admin personalization panel ───────────────────────────────────────────────

test("admin exposes only Portfolio-owned presentation surfaces", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText("Canonical career content is managed in Admin Dashboard.")).toBeVisible();
  await expect(page.getByTestId("admin-tab-project-presentation")).toBeVisible();
  await expect(page.getByTestId("admin-tab-skill-presentation")).toBeVisible();
  await expect(page.getByTestId("admin-tab-personalization")).toBeVisible();
  await expect(page.getByTestId("admin-tab-bio")).toHaveCount(0);
  await expect(page.getByTestId("admin-tab-projects")).toHaveCount(0);
  await expect(page.getByTestId("admin-tab-skills")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Welcome Messages" })).toBeVisible();
  await expect(page.getByTestId("admin-personalization-panel")).toBeVisible();
});

test("project and skill tabs expose presentation controls without canonical editors", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");

  await page.getByTestId("admin-tab-project-presentation").click();
  await expect(page.getByRole("heading", { name: "Project presentation" })).toBeVisible();
  await expect(page.getByText("Create and edit canonical projects in Admin Dashboard.")).toBeVisible();

  await page.getByTestId("admin-tab-skill-presentation").click();
  await expect(page.getByRole("heading", { name: "Skill presentation" })).toBeVisible();
  await expect(page.getByText("Create and rename canonical skills in Admin Dashboard.")).toBeVisible();
  await expect(page.getByRole("button", { name: /add all_skill/i })).toHaveCount(0);
});

test("admin personalization panel renders message cards from mock data", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");

  await expect(page.getByText("Test Org Visit")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Acme Corp Visit")).toBeVisible();
});

test("clicking + New Message opens the create dialog", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");
  await page.getByTestId("create-welcome-message").click();

  await expect(page.getByTestId("welcome-label-input")).toBeVisible();
  await expect(page.getByTestId("welcome-slug-input")).toBeVisible();
  await expect(page.getByTestId("welcome-message-input")).toBeVisible();
});

test("save button is disabled when form fields are empty", async ({ page }) => {
  await setup(page);
  await page.goto("/admin");
  await page.getByTestId("create-welcome-message").click();

  const saveBtn = page.getByTestId("save-welcome-message");
  await expect(saveBtn).toBeDisabled();
});

test("copy URL button copies the welcome URL to clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await page.goto("/admin");

  // Click the copy URL link for the first message card
  const copyBtn = page.getByText("copy URL").first();
  await expect(copyBtn).toBeVisible({ timeout: 5000 });
  await copyBtn.click();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain("?welcome=test-org");
});

// ── Welcome message API error handling ───────────────────────────────────────

test("non-existent welcome slug in URL still strips param and does not crash", async ({ page }) => {
  await setup(page);
  // no-slug: slug that won't match any fixture
  await page.goto("/?welcome=does-not-exist");
  await page.waitForURL((url) => !url.searchParams.has("welcome"), { timeout: 5000 });
  // Page should render normally (no crash), force-show flag should still be set
  const flag = await page.evaluate((key) => window.localStorage.getItem(key), FORCE_SHOW_KEY);
  expect(flag).toBe("1");
});
