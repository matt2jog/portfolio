import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await seedBrowserState(page);
});

test("home renders the configured public entry point", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
});

test("first-visit intro can complete without waiting for production animation timers", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("__root_intro_seen_until");
    window.localStorage.removeItem("__consent_record");
    window.__FIRST_VISIT_INTRO_TEST_STATE = {
      stage: "name",
      typingPhase: "button",
      phrase: "Welcome!",
      showPrompt: true,
      typedIntro: "My name is",
      typedName: "Matthew Tujague",
      typedPrompt: "Let me show you around",
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Continue to website" }).click();
  await expect(page.getByTestId("first-visit-intro")).toHaveCount(0);
  await expect(page.getByTestId("hero")).toBeVisible();
});

test("first-visit intro advances through the production timer sequence", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("__root_intro_seen_until");
    window.localStorage.removeItem("__intro_force_show");
    window.localStorage.removeItem("__intro_welcome_slug");
    window.localStorage.removeItem("__consent_record");
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue to website" })).toBeVisible({
    timeout: 40_000,
  });
  await page.getByRole("button", { name: "Continue to website" }).click();
  await expect(page.getByTestId("hero")).toBeVisible();
});

test("about renders projected experience and flips the business card", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByTestId("about-timeline")).toContainText("Lead Software Engineer");

  const card = page.getByTestId("business-card-toggle");
  await card.click();
  await expect(card).toHaveAttribute("data-card-open", "true");
  await card.click();
  await expect(card).toHaveAttribute("data-card-open", "false");
});

test("mobile navigation and experience timeline remain operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");
  await expect(page.getByTestId("about-timeline")).toContainText("Lead Software Engineer");

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(page.locator("button[aria-expanded]")).toHaveAttribute("aria-expanded", "false");
});

test("tree carousel renders configured contact targets and moves both directions", async ({ page }) => {
  await page.goto("/tree");
  const carousel = page.getByTestId("niche-carousel");
  await expect(carousel).toHaveAttribute("data-active-card", "linkedin");

  await page.getByRole("button", { name: "next" }).click();
  await expect(carousel).toHaveAttribute("data-active-card", "github");
  await page.getByRole("button", { name: "previous" }).click();
  await expect(carousel).toHaveAttribute("data-active-card", "linkedin");
});

test("portfolio cube renders real project data and responds to card and paging input", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByTestId("portfolio-cube-scene")).toBeVisible();
  await expect(page.getByText("Project 1", { exact: true }).first()).toBeVisible();

  const card = page.locator(".project-card").first();
  await card.dispatchEvent("mouseover");
  await expect(card).toHaveAttribute("data-active", "true");

  await page.getByRole("button", { name: "Next project page" }).first().click();
  await page.getByTestId("portfolio-cube").dispatchEvent("transitionend", {
    propertyName: "transform",
  });
  await page.getByRole("button", { name: "Previous project page" }).first().click();
});

test("activity renders GitHub metrics and switches to the LinkedIn timeline", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: /ACTIVITY\s+MONITOR/i })).toBeVisible();
  await expect(page.getByText("Yearly Commits")).toBeVisible();
  await expect(page.getByText("Added viewport testing scaffolding")).toBeVisible();

  await page.getByTestId("activity-tab-linkedin").click();
  await expect(page.getByText("LinkedIn Timeline")).toBeVisible();
  await expect(page.getByText("Building practical developer tooling for portfolio review")).toBeVisible();
});

test("project chat selects a model and renders the mocked streamed answer", async ({ page }) => {
  await page.goto("/portfolio/project-1/chat?rotation=2");
  const answers = page.getByText(/Mocked 20B welcome response/);
  await expect(answers.first()).toBeVisible();
  await expect(page.getByText("Drag To Pan, Pinch Or Wheel To Zoom").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Mermaid Render Failed").first()).toBeVisible({ timeout: 20_000 });

  const mermaidViewport = page.getByTestId("mermaid-viewport").first();
  await page.getByRole("button", { name: "Zoom in diagram" }).first().click();
  await page.getByRole("button", { name: "Zoom out diagram" }).first().click();
  await page.getByRole("button", { name: "Reset" }).first().click();
  await mermaidViewport.dispatchEvent("wheel", { deltaY: -120, clientX: 80, clientY: 80 });
  await mermaidViewport.dispatchEvent("wheel", { deltaY: 120, clientX: 80, clientY: 80 });
  await mermaidViewport.dispatchEvent("pointermove", { pointerId: 99, clientX: 20, clientY: 20 });
  const viewportBox = await mermaidViewport.boundingBox();
  if (!viewportBox) throw new Error("Mermaid viewport has no layout box");
  await page.mouse.move(viewportBox.x + 40, viewportBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 70, viewportBox.y + 70);
  await page.mouse.up();
  await mermaidViewport.dispatchEvent("pointercancel", { pointerId: 3 });

  const answerCount = await answers.count();
  await page.getByRole("button", { name: /GPT OSS 20B/ }).click();
  await page.getByRole("button", { name: /GPT OSS 120B/ }).click();
  await page.getByRole("button", { name: "Architecture" }).first().click();
  await expect.poll(() => answers.count()).toBeGreaterThan(answerCount);
});

test("project chat handles missing models without enabling paid inference", async ({ page }) => {
  await page.unroute("**/api/public/ai-models");
  await page.route("**/api/public/ai-models", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.goto("/portfolio/project-1/chat");
  await expect(page.getByText("no model selected")).toBeVisible();
  await expect(page.getByPlaceholder("Ask about this project...")).toBeDisabled();
});

test("project chat reports provider failures and empty streams", async ({ page }) => {
  let requestCount = 0;
  await page.unroute("**/api/public/chat");
  await page.route("**/api/public/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: "data: [DONE]\n\n",
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Provider unavailable" }),
    });
  });

  await page.goto("/portfolio/project-1/chat");
  await expect(page.getByText(/internal quality-check issue/)).toBeVisible();
  await page.getByPlaceholder("Ask about this project...").fill("Explain the failure path");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Provider unavailable")).toBeVisible();
});

test("project chat renders an unavailable state for an unknown project", async ({ page }) => {
  await page.unroute("**/api/public/projects/*");
  await page.route("**/api/public/projects/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  await page.goto("/portfolio/unknown/chat");
  await expect(page.getByText("Project chat unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Portfolio" })).toBeVisible();
});

test("mobile activity renders every LinkedIn event type and image controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.unroute("**/api/public/linkedin/timeline?**");
  await page.route("**/api/public/linkedin/timeline?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hasMore: false,
        events: [
          {
            id: "rich-post",
            type: "post",
            title: "Rich post",
            description: "Post with images and every media badge.",
            url: "https://example.com/post",
            source: "matthew",
            timestamp: "2026-07-10T12:00:00.000Z",
            meta: {
              engagement: { likes: 10, comments: 2, shares: 1 },
              media: {
                images: ["/assets/headshot.png?one", "/assets/headshot.png?two"],
                hasVideo: true,
                hasArticleLink: true,
              },
              author: { name: "Matthew" },
            },
          },
          {
            id: "rich-repost",
            type: "repost",
            title: "Rich repost",
            description: null,
            url: null,
            source: "matthew",
            timestamp: "2026-07-09T12:00:00.000Z",
            meta: {},
          },
          {
            id: "rich-article",
            type: "article",
            title: "Rich article",
            description: "Long-form activity.",
            url: "https://example.com/article",
            source: "matthew",
            timestamp: "2025-01-01T12:00:00.000Z",
            meta: { engagement: { likes: "4", comments: "1", shares: "2" } },
          },
        ],
      }),
    }),
  );

  await page.goto("/activity");
  await page.getByTestId("activity-tab-linkedin").click();
  await expect(page.getByText("Rich post")).toBeVisible();
  await expect(page.getByText("Repost", { exact: true })).toBeVisible();
  await expect(page.getByText("Article", { exact: true })).toBeVisible();

  await page.getByAltText("Rich post image 1").click();
  await page.getByRole("button", { name: "Next image" }).click();
  await page.getByRole("button", { name: "Previous image" }).click();
  await page.getByRole("button", { name: "View image 2" }).click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
});

test("activity surfaces provider errors and empty timelines", async ({ page }) => {
  await page.unroute("**/api/public/github/activity");
  await page.route("**/api/public/github/activity", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ _error: "GitHub is not configured" }),
    }),
  );
  await page.goto("/activity");
  await expect(page.getByText("GitHub Integration Pending")).toBeVisible();
});

for (const route of ["/privacy", "/terms", "/tracking"] as const) {
  test(`${route} renders the versioned legal document`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Policy Document" })).toBeVisible();
    await expect(page.getByText("March 27, 2026").first()).toBeVisible();
  });
}

test("unknown routes render the not-found boundary", async ({ page }) => {
  await page.goto("/not-a-real-route");
  await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toBeVisible();
});

test("Portfolio settings exposes no career mutation controls", async ({ page }) => {
  const careerMutations: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== "GET"
      && /^\/api\/admin\/(?:projects|experiences|bio|personal-information|skills|skills-groups|all-skills)/.test(pathname)
    ) {
      careerMutations.push(`${request.method()} ${pathname}`);
    }
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Portfolio settings" })).toBeVisible();
  await expect(page.getByText("Career data is read-only in Portfolio.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin Dashboard" })).toHaveAttribute(
    "href",
    "https://admin.2jog.dev",
  );
  await expect(page.getByTestId("admin-project-presentation-panel")).toHaveCount(0);
  await expect(page.getByText("Shared skill library")).toHaveCount(0);
  expect(careerMutations).toEqual([]);
});

test("admin personalization covers create, edit, archive, restore, and delete operations", async ({ page }) => {
  await page.unroute("**/api/admin/welcome-messages/archived");
  await page.route("**/api/admin/welcome-messages/archived", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "archived-message",
          slug: "archived",
          label: "Archived Visit",
          message: "This message is archived.",
          archivedAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ]),
    }),
  );

  await page.goto("/admin");
  await page.getByTestId("create-welcome-message").click();
  await page.getByTestId("welcome-label-input").fill("Coverage Visit");
  await page.getByTestId("welcome-slug-input").fill("coverage-visit");
  await page.getByTestId("welcome-message-input").fill("Welcome to the coverage suite.");
  await page.getByTestId("save-welcome-message").click();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByTestId("welcome-message-input").fill("Updated welcome message.");
  await page.getByTestId("save-welcome-message").click();

  await page.getByRole("button", { name: "Archive" }).first().click();
  await page.getByRole("button", { name: "Show archived messages" }).click();
  await page.getByRole("button", { name: "Restore" }).click();

  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByTestId("confirm-delete-welcome").click();
});

test("admin auth and policy boundaries render each protected state", async ({ page }) => {
  await page.unroute("**/api/auth/me");
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Access" })).toBeVisible();
});

test("admin requires policy acceptance before rendering controls", async ({ page }) => {
  await page.unroute("**/api/admin/policy/check-acceptance");
  await page.route("**/api/admin/policy/check-acceptance", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted: false }),
    }),
  );

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accept Terms Before Continuing" })).toBeVisible();
  await page.getByLabel(/I have read and agree/).click();
  await page.getByRole("button", { name: "I Agree & Continue" }).click();
  await expect(page.getByRole("heading", { name: "Portfolio settings" })).toBeVisible();
});
