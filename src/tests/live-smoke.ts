import assert from "node:assert/strict";
import { chromium, request } from "playwright";

function record(value: unknown, description: string): Record<string, unknown> {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${description} must be a JSON object`,
  );
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, description: string): string {
  assert.ok(
    typeof value === "string" && value.trim(),
    `${description} must be nonempty`,
  );
  return value;
}

async function jsonResponse(
  api: Awaited<ReturnType<typeof request.newContext>>,
  path: string,
): Promise<unknown> {
  const response = await api.get(path);
  assert.equal(response.status(), 200, `${path} returned ${response.status()}`);
  assert.match(
    response.headers()["content-type"] ?? "",
    /^application\/json\b/i,
  );
  return response.json();
}

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
assert.ok(
  configuredBaseUrl,
  "PLAYWRIGHT_BASE_URL is required for the live smoke",
);
const baseUrl = new URL(configuredBaseUrl);
assert.equal(baseUrl.protocol, "https:", "the live smoke requires HTTPS");
assert.equal(baseUrl.username, "");
assert.equal(baseUrl.password, "");
baseUrl.pathname = "/";
baseUrl.search = "";
baseUrl.hash = "";

const api = await request.newContext({ baseURL: baseUrl.toString() });
const browser = await chromium.launch();

try {
  const projectsValue = await jsonResponse(api, "/api/public/projects");
  assert.ok(Array.isArray(projectsValue), "projects must be a JSON array");
  const projects = projectsValue.map((value, index) => {
    const project = record(value, `projects[${index}]`);
    return {
      id: nonemptyString(project.id, `projects[${index}].id`),
      title: nonemptyString(project.title, `projects[${index}].title`),
    };
  });

  const skillsValue = await jsonResponse(api, "/api/skills-constellation");
  assert.ok(Array.isArray(skillsValue), "skills must be a JSON array");
  const skillGroups = new Set<string>();
  for (const [index, value] of skillsValue.entries()) {
    const skill = record(value, `skills[${index}]`);
    nonemptyString(
      skill.portfolio_skill_id,
      `skills[${index}].portfolio_skill_id`,
    );
    nonemptyString(skill.skill_id, `skills[${index}].skill_id`);
    nonemptyString(skill.skill_name, `skills[${index}].skill_name`);
    skillGroups.add(
      nonemptyString(skill.group_name, `skills[${index}].group_name`),
    );
  }
  if (skillsValue.length > 0) {
    assert.ok(
      skillGroups.size > 0,
      "configured skills must include a display group",
    );
  }

  const activity = record(
    await jsonResponse(api, "/api/public/github/activity"),
    "GitHub activity",
  );
  const githubLogin = nonemptyString(activity.login, "GitHub activity login");
  const repositories = record(
    activity.repositories,
    "GitHub activity repositories",
  );
  assert.ok(
    typeof repositories.totalCount === "number" && repositories.totalCount > 0,
    "GitHub activity must report repositories",
  );
  assert.ok(
    Array.isArray(repositories.nodes),
    "GitHub activity repository nodes must be an array",
  );
  const contributions = record(
    activity.contributionsCollection,
    "GitHub contributions collection",
  );
  const calendar = record(
    contributions.contributionCalendar,
    "GitHub contribution calendar",
  );
  assert.ok(
    typeof calendar.totalContributions === "number",
    "GitHub total contributions must be numeric",
  );
  const contributionWeeks = calendar.weeks;
  assert.ok(
    Array.isArray(contributionWeeks),
    "GitHub contribution weeks must be an array",
  );

  const context = await browser.newContext();
  const page = await context.newPage();

  const portfolioResponse = await page.goto(
    new URL("/portfolio", baseUrl).toString(),
    {
      waitUntil: "domcontentloaded",
    },
  );
  assert.ok(portfolioResponse?.ok(), "/portfolio must render successfully");
  await page
    .locator('[data-testid="portfolio-cube-scene"], [data-testid="portfolio-empty"]')
    .waitFor({ state: "visible" });
  if (projects.length > 0) {
    await page.getByText(projects[0].title, { exact: true }).first().waitFor({
      state: "visible",
    });
    assert.equal(await page.getByTestId("portfolio-empty").count(), 0);
  } else {
    await page.getByTestId("portfolio-empty").waitFor({ state: "visible" });
    assert.equal(
      (await page.getByTestId("portfolio-empty").textContent())?.trim(),
      "No portfolio projects are configured.",
    );
  }

  const activityResponse = await page.goto(
    new URL("/activity", baseUrl).toString(),
    {
      waitUntil: "domcontentloaded",
    },
  );
  assert.ok(activityResponse?.ok(), "/activity must render successfully");
  await page.getByTestId("activity-toggle").waitFor({
    state: "visible",
  });
  await page
    .getByText(`@${githubLogin}`, { exact: true })
    .waitFor({ state: "attached" });
  if (contributionWeeks.length > 0) {
    await page.getByText("Contribution Activity", { exact: true }).waitFor({
      state: "attached",
    });
  } else {
    await page.getByText("Event Timeline", { exact: true }).waitFor({
      state: "attached",
    });
  }
  assert.equal(await page.getByText("GitHub Integration Pending").count(), 0);

  await context.close();
} finally {
  await browser.close();
  await api.dispose();
}
