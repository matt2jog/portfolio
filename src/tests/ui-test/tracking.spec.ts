import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

async function setup(
  page: import("@playwright/test").Page,
  consent: "accept_all" | "reject_all" | "none" = "none",
) {
  await installMockApi(page);
  await seedBrowserState(page, {
    introSeen: true,
    consent,
    logRocketTestMode: true,
  });
}

function logRocketEvents(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.__LOGROCKET_TEST_EVENTS ?? []);
}

// ── UUID cookie ───────────────────────────────────────────────────────────────

test("analytics uses a tab-scoped session id and no readable durable cookie", async ({ page }) => {
  await setup(page, "accept_all");
  await page.goto("/");
  const state = await page.evaluate(() => ({
    cookie: document.cookie,
    sessionId: window.sessionStorage.getItem("__portfolio_session_id"),
  }));
  expect(state.cookie).not.toContain("tr_uuid=");
  expect(state.sessionId).toBeTruthy();
});
// ── Consent break condition ───────────────────────────────────────────────────

test("getTrackerUuid returns null when localStorage has no consent record", async ({ page }) => {
  await setup(page, "none");
  await page.goto("/");
  // Without the lib exposed we verify indirectly: user_uuid must NOT be emitted
  const events = await logRocketEvents(page);
  expect(events.some((e) => e.event === "user_uuid")).toBe(false);
});

test("user_uuid LogRocket event is NOT emitted without consent", async ({ page }) => {
  await setup(page, "none");
  await page.goto("/");
  await page.waitForTimeout(300);
  const events = await logRocketEvents(page);
  expect(events.some((e) => e.event === "user_uuid")).toBe(false);
});

test("user_uuid LogRocket event IS emitted after Accept All", async ({ page }) => {
  await setup(page, "none");
  await page.goto("/");
  await page.getByRole("button", { name: "Accept All" }).click();

  await expect
    .poll(async () => {
      const events = await logRocketEvents(page);
      return events.some((e) => e.event === "user_uuid");
    })
    .toBe(true);

  const events = await logRocketEvents(page);
  const uuidEvent = events.find((e) => e.event === "user_uuid");
  expect(uuidEvent?.payload?.uuid).toEqual(expect.any(String));
});

test("user_uuid LogRocket event IS emitted when page loads with pre-existing consent", async ({ page }) => {
  await setup(page, "accept_all");
  await page.goto("/");

  await expect
    .poll(async () => {
      const events = await logRocketEvents(page);
      return events.some((e) => e.event === "user_uuid");
    })
    .toBe(true);
});

// ── Route tracking (no query params logged) ───────────────────────────────────

test("route_change event does not include query params or rawQuery fields", async ({ page }) => {
  await setup(page, "accept_all");
  await page.goto("/?utm_source=test&ref=abc");

  await page.waitForTimeout(300);
  const events = await logRocketEvents(page);
  const routeChanges = events.filter((e) => e.event === "route_change");
  expect(routeChanges.length).toBeGreaterThan(0);
  for (const ev of routeChanges) {
    expect(ev.payload).not.toHaveProperty("query");
    expect(ev.payload).not.toHaveProperty("rawQuery");
  }
});

test("query_params event is never emitted", async ({ page }) => {
  await setup(page, "accept_all");
  await page.goto("/?utm_source=test");
  await page.waitForTimeout(300);
  const events = await logRocketEvents(page);
  expect(events.some((e) => e.event === "query_params")).toBe(false);
});

// ── tr_en query param ─────────────────────────────────────────────────────────

test("tr_en param is stripped from URL after page load (no consent)", async ({ page }) => {
  const trackingRequests: string[] = [];
  await installMockApi(page);
  await page.route("**/api/public/tracking/tr-en", (route) => {
    trackingRequests.push("called");
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await seedBrowserState(page, { introSeen: true, consent: "none", logRocketTestMode: true });
  await page.goto("/?tr_en=campaign1", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  expect(page.url()).not.toContain("tr_en");
  expect(trackingRequests).toHaveLength(0);
});

test("tr_en param is discarded without persistence when user has consented", async ({ page }) => {
  const trackingRequests: string[] = [];
  await installMockApi(page);
  await page.route("**/api/public/tracking/tr-en", async (route) => {
    const body = await route.request().postDataJSON();
    trackingRequests.push(body.trEn);
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await seedBrowserState(page, { introSeen: true, consent: "accept_all", logRocketTestMode: true });
  await page.goto("/?tr_en=partner42", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  expect(page.url()).not.toContain("tr_en");
  expect(trackingRequests).toHaveLength(0);
});

test("tr_en strips other params while preserving them", async ({ page }) => {
  await installMockApi(page);
  await seedBrowserState(page, { introSeen: true, consent: "none", logRocketTestMode: true });
  await page.goto("/?keep=yes&tr_en=x", { waitUntil: "domcontentloaded" });

  await expect.poll(() => new URL(page.url()).searchParams.has("tr_en")).toBe(false);
  const url = new URL(page.url());
  expect(url.searchParams.has("tr_en")).toBe(false);
  expect(url.searchParams.get("keep")).toBe("yes");
});
