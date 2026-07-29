import type { Page, Route } from "@playwright/test";
export { registerClientCoverage } from "./client-coverage";
import {
  adminFixtures,
  aiModelsFixture,
  experienceFixture,
  githubActivityFixture,
  githubTimelineFixture,
  legalDocFixture,
  linkedinActivityFixture,
  linkedinTimelineFixture,
  personalInformationFixture,
  projectsFixture,
  promptSuggestionsFixture,
  skillsConstellationFixture,
  welcomeMessagesFixture,
} from "./fixtures";

type JsonValue = unknown;

const richChatResponse =
  "# Mocked 20B welcome response\n\n" +
  "I can discuss **architecture**, _tradeoffs_, and `implementation details` for this project.<br>\n\n" +
  "> The response is deterministic and provider-free.\n\n" +
  "- API boundary\n- persistence contract\n- deployment flow\n\n" +
  "1. Build\n2. Scan\n3. Deploy\n\n" +
  "| Layer | Responsibility |\n| --- | --- |\n| Edge | Authentication |\n| Origin | Project data |\n\n" +
  "```ts\nconst deployment = { scaleToZero: true };\n```\n\n" +
  "```mermaid\ngraph TD\n  Edge[Edge] --> Origin[Origin]\n```\n\n" +
  "```mermaid\nthis is not a valid diagram ???\n```\n\n" +
  "---\n\n" +
  "## References\n\n" +
  "[Read the public portfolio](https://2jog.dev/portfolio).";

const richChatStream =
  "event: tool_call\n" +
  `data: ${JSON.stringify({ name: "lookup_project", args: { projectId: "project-1" } })}\n\n` +
  "event: tool_call\n" +
  "data: not-json\n\n" +
  "event: agent_phase\n" +
  `data: ${JSON.stringify({ phase: "diagramming" })}\n\n` +
  "event: evaluator\n" +
  `data: ${JSON.stringify({ status: "reviewing" })}\n\n` +
  "event: agent_phase\n" +
  `data: ${JSON.stringify({ phase: "refining" })}\n\n` +
  "event: message\n" +
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Streamed prefix." } }] })}\n\n` +
  "event: assistant_message\n" +
  `data: ${JSON.stringify({ content: richChatResponse })}\n\n` +
  "data: [DONE]\n\n";

function shouldMockDbBackedEndpoints() {
  return process.env.E2E_DATA_MODE !== "hybrid";
}

async function fulfillJson(route: Route, body: JsonValue, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockDbRoute(page: Page, url: string, body: JsonValue) {
  if (!shouldMockDbBackedEndpoints()) return;
  await page.route(url, (route) => fulfillJson(route, body));
}

export async function installMockApi(page: Page) {
  await page.route("**/api/admin/**", (route) => fulfillJson(route, { ok: true }));
  await page.route("**/api/public/geoip", (route) =>
    fulfillJson(route, { ip: "127.0.0.1", country_code: "US" }),
  );
  await page.route("**/api/public/ip", (route) =>
    fulfillJson(route, { ip: "127.0.0.1" }),
  );
  await page.route("**/api/public/tracking/init", (route) =>
    fulfillJson(route, { ok: true }),
  );
  await page.route("**/api/public/tracking/tr-en", (route) =>
    fulfillJson(route, { ok: true }),
  );

  await page.route("**/api/legal/privacy", (route) => fulfillJson(route, legalDocFixture));
  await page.route("**/api/legal/terms", (route) => fulfillJson(route, legalDocFixture));
  await page.route("**/api/legal/tracking", (route) => fulfillJson(route, legalDocFixture));

  await mockDbRoute(page, "**/api/public/personal-information", personalInformationFixture);
  await mockDbRoute(page, "**/api/public/bio", adminFixtures.bio);
  await mockDbRoute(page, "**/api/public/experiences", experienceFixture);
  await mockDbRoute(page, "**/api/skills-constellation", skillsConstellationFixture);
  await mockDbRoute(page, "**/api/public/skills", skillsConstellationFixture);
  await mockDbRoute(page, "**/api/public/projects", projectsFixture);
  await mockDbRoute(page, "**/api/public/projects/*", projectsFixture[0]);

  await page.route("**/api/public/ai-models", (route) => fulfillJson(route, aiModelsFixture));
  await page.route("**/api/public/chat-prompt-suggestions?**", (route) =>
    fulfillJson(route, promptSuggestionsFixture),
  );
  await page.route("**/api/public/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
      body: richChatStream,
    }),
  );

  await page.route("**/api/public/github/activity", (route) =>
    fulfillJson(route, githubActivityFixture),
  );
  await page.route("**/api/public/github/timeline?**", (route) =>
    fulfillJson(route, githubTimelineFixture),
  );
  await page.route("**/api/public/linkedin/activity", (route) =>
    fulfillJson(route, linkedinActivityFixture),
  );
  await page.route("**/api/public/linkedin/timeline?**", (route) =>
    fulfillJson(route, linkedinTimelineFixture),
  );

  await page.route("**/api/public/welcome-message?**", (route) => {
    const url = new URL(route.request().url());
    const slug = url.searchParams.get("welcome");
    const match = welcomeMessagesFixture.find((m) => m.slug === slug);
    if (match) {
      return fulfillJson(route, { message: match.message });
    }
    return fulfillJson(route, { error: "Welcome message not found" }, 404);
  });

  await page.route("**/api/admin/welcome-messages/archived", (route) =>
    fulfillJson(route, []),
  );
  await page.route("**/api/admin/welcome-messages", (route) =>
    fulfillJson(route, welcomeMessagesFixture),
  );

  await page.route("**/api/auth/me", (route) => fulfillJson(route, adminFixtures.me));
  await page.route("**/api/admin/policy/check-acceptance", (route) =>
    fulfillJson(route, { accepted: true }),
  );
  await page.route("**/api/admin/personal-information", (route) =>
    fulfillJson(route, personalInformationFixture),
  );
  await page.route("**/api/admin/bio", (route) => fulfillJson(route, adminFixtures.bio));
  await page.route("**/api/admin/bio/versions", (route) =>
    fulfillJson(route, [adminFixtures.bio]),
  );
  await page.route("**/api/admin/projects", (route) => fulfillJson(route, projectsFixture));
  await page.route("**/api/admin/archived/projects", (route) => fulfillJson(route, []));
  await page.route("**/api/admin/skills", (route) =>
    fulfillJson(route, adminFixtures.portfolioSkills),
  );
  await page.route("**/api/admin/skills-groups", (route) =>
    fulfillJson(route, adminFixtures.skillGroups),
  );
  await page.route("**/api/admin/all-skills", (route) =>
    fulfillJson(route, adminFixtures.allSkills),
  );
}

export async function seedBrowserState(
  page: Page,
  options: {
    introSeen?: boolean;
    consent?: "accept_all" | "reject_all" | "none";
    logRocketTestMode?: boolean;
  } = {},
) {
  const {
    introSeen = true,
    consent = "reject_all",
    logRocketTestMode = true,
  } = options;

  await page.addInitScript(
    ({ introSeen: shouldSeedIntro, consentChoice, testMode }) => {
      Math.random = () => 0.42;

      if (testMode) {
        window.__LOGROCKET_TEST_MODE = true;
        window.__LOGROCKET_TEST_EVENTS = [];
      }

      if (shouldSeedIntro) {
        window.localStorage.setItem("__root_intro_seen_until", String(Date.now() + 3 * 24 * 60 * 60 * 1000));
      } else {
        window.localStorage.removeItem("__root_intro_seen_until");
      }

      if (consentChoice === "none") {
        window.localStorage.removeItem("__consent_record");
        return;
      }

      const categories =
        consentChoice === "accept_all" ? ["essential", "analytics"] : ["essential"];
      window.localStorage.setItem(
        "__consent_record",
        JSON.stringify({
          timestamp: new Date().toISOString(),
          jurisdiction_detected: "US",
          policy_version: "1.0",
          categories_accepted: categories,
          user_action: consentChoice,
        }),
      );
    },
    {
      introSeen,
      consentChoice: consent,
      testMode: logRocketTestMode,
    },
  );
}
