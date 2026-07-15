import { expect, test } from "@playwright/test";
import { installMockApi, registerClientCoverage, seedBrowserState } from "../support/mock-api";

registerClientCoverage();

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await seedBrowserState(page);
});

test("About never substitutes invented experience when the projection is empty", async ({ page }) => {
  await page.unroute("**/api/public/experiences");
  await page.route("**/api/public/experiences", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.goto("/about");

  await expect(page.getByTestId("about-experience-empty")).toContainText(
    "Experience history is being updated.",
  );
  await expect(page.getByText("Tech Corp")).toHaveCount(0);
  await expect(page.getByText("Design Studio")).toHaveCount(0);
  await expect(page.getByText("Startup Inc")).toHaveCount(0);
});
