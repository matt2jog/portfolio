import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await seedBrowserState(page);
});

test("portfolio shows an explicit empty state when no projects are configured", async ({ page }) => {
  await page.unroute("**/api/public/projects");
  await page.route("**/api/public/projects", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.goto("/portfolio");

  await expect(page.getByTestId("portfolio-empty")).toContainText(
    "No portfolio projects are configured.",
  );
  await expect(page.getByText(/Lorem Ipsum/i)).toHaveCount(0);
  await expect(page.locator('a[href="https://example.com"]')).toHaveCount(0);
});

test("about shows an explicit not-configured state without owner fallbacks", async ({ page }) => {
  await page.unroute("**/api/public/personal-information");
  await page.route("**/api/public/personal-information", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  await page.goto("/about");

  await expect(page.getByTestId("personal-information-empty")).toContainText(
    "Personal information is not configured.",
  );
  await expect(page.getByText("Matthew Tujague", { exact: true })).toHaveCount(0);
  await expect(page.getByText("matthew@2jog.dev", { exact: true })).toHaveCount(0);
});
