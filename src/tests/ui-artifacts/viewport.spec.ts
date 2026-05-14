import { expect, test, type Page } from "@playwright/test";
import { installMockApi, seedBrowserState } from "../support/mock-api";
import { savePaginatedScreenshots, saveViewportScreenshot } from "../support/screenshot";

async function preparePage(
  page: Page,
  options: {
    introSeen?: boolean;
    consent?: "accept_all" | "reject_all" | "none";
  } = {},
) {
  await installMockApi(page);
  await seedBrowserState(page, {
    introSeen: options.introSeen ?? true,
    consent: options.consent ?? "reject_all",
    logRocketTestMode: true,
  });
}

async function settle(page: Page, timeout = 500) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(timeout);
}

test("first-visit-intro animation steps", async ({ page }, testInfo) => {
  await installMockApi(page);

  const introStates = [
    {
      name: "phrase",
      state: { stage: "phrase", typingPhase: "introPause", phrase: "Welcome!" },
    },
    {
      name: "gap",
      state: { stage: "gap", typingPhase: "introPause" },
    },
    {
      name: "intro-cursor",
      state: { stage: "name", typingPhase: "introPause" },
    },
    {
      name: "intro-typed",
      state: { stage: "name", typingPhase: "namePause", typedIntro: "My name is" },
    },
    {
      name: "name-cursor",
      state: { stage: "name", typingPhase: "namePause", typedIntro: "My name is" },
    },
    {
      name: "phonetics",
      state: {
        stage: "name",
        typingPhase: "promptPause",
        typedIntro: "My name is",
        typedName: "Matthew Tujague",
      },
    },
    {
      name: "prompt-cursor",
      state: {
        stage: "name",
        typingPhase: "promptPause",
        showPrompt: true,
        typedIntro: "My name is",
        typedName: "Matthew Tujague",
      },
    },
    {
      name: "prompt-typed",
      state: {
        stage: "name",
        typingPhase: "buttonPause",
        showPrompt: true,
        typedIntro: "My name is",
        typedName: "Matthew Tujague",
        typedPrompt: "Let me show you around",
      },
    },
    {
      name: "button",
      state: {
        stage: "name",
        typingPhase: "button",
        showPrompt: true,
        typedIntro: "My name is",
        typedName: "Matthew Tujague",
        typedPrompt: "Let me show you around",
      },
    },
  ] as const;

  for (const { name, state } of introStates) {
    await page.addInitScript((introState) => {
      Math.random = () => 0.42;
      window.__LOGROCKET_TEST_MODE = true;
      window.__LOGROCKET_TEST_EVENTS = [];
      window.__FIRST_VISIT_INTRO_TEST_STATE = introState;
      window.localStorage.removeItem("__root_intro_seen_until");
      window.localStorage.removeItem("__consent_record");
    }, state);
    await page.goto("/");
    await expect(page.getByTestId("first-visit-intro")).toBeVisible();
    await settle(page, 300);
    await saveViewportScreenshot(page, testInfo, `first-visit-intro/${name}`);
  }
});

test("consent clickwrap states", async ({ page }, testInfo) => {
  await preparePage(page, { introSeen: true, consent: "none" });
  await page.goto("/");
  await expect(page.getByTestId("consent-banner")).toBeVisible();
  await saveViewportScreenshot(page, testInfo, "consent-clickwrap/regular");

  await page.getByRole("button", { name: "Manage Preferences" }).click();
  await expect(page.getByRole("heading", { name: "Manage Preferences" })).toBeVisible();
  await saveViewportScreenshot(page, testInfo, "consent-clickwrap/manage");

  const analytics = page.getByRole("checkbox", { name: "Analytics & Performance" });
  await analytics.click();
  await expect(analytics).not.toBeChecked();
  await saveViewportScreenshot(page, testInfo, "consent-clickwrap/manage-analytics-off");
});

test("legal document pages", async ({ page }, testInfo) => {
  await preparePage(page);

  for (const [route, shotName, title] of [
    ["/privacy", "privacy-policy", "Privacy Policy"],
    ["/tracking", "tracking-notice", "Tracking Notice & Consent"],
    ["/terms", "terms-of-use", "Terms of Use"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await settle(page);
    await savePaginatedScreenshots(page, testInfo, shotName, {
      maxPages: 5,
      maxScrollDistance: 3_200,
    });
  }
});

test("hero with skills constellation", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
  const constellation = page.getByTestId("skills-constellation").filter({ visible: true });
  await expect(constellation).toHaveCount(1, { timeout: 15_000 });
  await page.locator("canvas").filter({ visible: true }).first().waitFor({ state: "visible", timeout: 15_000 });
  await settle(page, 2_000);
  await saveViewportScreenshot(page, testInfo, "hero");
});

test("portfolio cube pagination", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/portfolio");
  await expect(page.getByTestId("portfolio-cube")).toBeVisible();
  await settle(page, 1_000);
  await saveViewportScreenshot(page, testInfo, "portfolio/page-1");

  await page.getByRole("button", { name: "Next project page" }).first().click();
  await expect(page.getByTestId("portfolio-cube")).toHaveAttribute("data-project-page", "2");
  await page.waitForTimeout(1_400);
  await saveViewportScreenshot(page, testInfo, "portfolio/page-2");
});

test("project chat mocked welcome response", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/portfolio/project-1/chat");
  await expect(page.getByText("Portfolio Agent")).toBeVisible();
  await expect(page.getByText("Mocked 20B welcome response")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  await savePaginatedScreenshots(page, testInfo, "project-chat-page", {
    maxPages: 4,
    maxScrollDistance: 2_400,
  });
});

test("tree carousel cards", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/tree");
  const carousel = page.getByTestId("niche-carousel");
  await expect(carousel).toBeVisible({ timeout: 15_000 });

  for (const cardId of ["linkedin", "github", "phone", "email", "devpost", "portfolio"]) {
    await expect(carousel).toHaveAttribute("data-active-card", cardId, { timeout: 5_000 });
    await settle(page, 500);
    await saveViewportScreenshot(page, testInfo, `tree/${cardId}`);
    await page.getByRole("button", { name: "next" }).click();
  }
});

test("about card and timeline", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/about");
  const card = page.getByTestId("business-card-toggle");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await settle(page, 800);
  await saveViewportScreenshot(page, testInfo, "about/business-card-front");

  await card.click();
  await expect(card).toHaveAttribute("data-card-open", "true");
  await page.waitForTimeout(1_300);
  await saveViewportScreenshot(page, testInfo, "about/business-card-back");

  await page.getByTestId("about-timeline").scrollIntoViewIfNeeded();
  await settle(page, 700);
  await savePaginatedScreenshots(page, testInfo, "about/timeline", {
    maxPages: 4,
    maxScrollDistance: 2_800,
    startFromCurrentScroll: true,
  });
});

test("activity monitor tabs", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/activity");
  await expect(page.getByTestId("activity-toggle")).toHaveAttribute("data-active-tab", "github", { timeout: 15_000 });
  await expect(page.getByText("Yearly Commits")).toBeVisible({ timeout: 15_000 });
  await settle(page, 1_000);
  await savePaginatedScreenshots(page, testInfo, "activity/github", {
    maxPages: 4,
    maxScrollDistance: 2_800,
  });

  await page.getByTestId("activity-tab-linkedin").click();
  await expect(page.getByTestId("activity-toggle")).toHaveAttribute("data-active-tab", "linkedin");
  await expect(page.getByText("LinkedIn Timeline")).toBeVisible({ timeout: 15_000 });
  await settle(page, 700);
  await savePaginatedScreenshots(page, testInfo, "activity/linkedin", {
    maxPages: 4,
    maxScrollDistance: 2_800,
  });
});

test("admin dashboard tabs", async ({ page }, testInfo) => {
  await preparePage(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Bio CRUD")).toBeVisible();
  await settle(page, 700);
  await savePaginatedScreenshots(page, testInfo, "admin-dashboard/bio", {
    maxPages: 4,
    maxScrollDistance: 2_800,
  });

  await page.getByTestId("admin-tab-projects").click();
  await expect(page.getByText("Projects CRUD")).toBeVisible();
  await settle(page, 700);
  await savePaginatedScreenshots(page, testInfo, "admin-dashboard/projects", {
    maxPages: 4,
    maxScrollDistance: 2_800,
  });

  await page.getByTestId("admin-tab-skills").click();
  await expect(page.getByText("Skills CRUD")).toBeVisible();
  await settle(page, 700);
  await savePaginatedScreenshots(page, testInfo, "admin-dashboard/skills", {
    maxPages: 4,
    maxScrollDistance: 2_800,
  });
});
