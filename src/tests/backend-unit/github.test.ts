import assert from "node:assert/strict";
import { after, test } from "node:test";
const originalFetch = globalThis.fetch;

async function fetchGithubActivity(username: string) {
  process.env.TURSO_DATABASE_URL ??= "file::memory:";
  const github = await import("../../backend/github");
  return github.fetchGithubActivity(username);
}

after(() => {
  globalThis.fetch = originalFetch;
});

test("public GitHub activity works through REST without a production token", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("Authorization") });

    if (url.endsWith("/users/matt2jog")) {
      return Response.json({
        login: "matt2jog",
        name: "Matthew",
        avatar_url: "https://avatars.example/matt2jog",
        html_url: "https://github.com/matt2jog",
        bio: "Builder",
        followers: 4,
        public_repos: 12,
      });
    }
    if (url.includes("/repos?")) {
      return Response.json([{
        name: "portfolio",
        full_name: "matt2jog/portfolio",
        description: "Portfolio",
        stargazers_count: 2,
        language: "TypeScript",
        html_url: "https://github.com/matt2jog/portfolio",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        pushed_at: "2026-07-01T00:00:00Z",
      }]);
    }
    if (url.includes("/events/public")) {
      return Response.json([{
        id: "event-1",
        type: "PullRequestEvent",
        created_at: "2026-07-02T00:00:00Z",
        repo: { name: "matt2jog/portfolio" },
        payload: {
          action: "opened",
          pull_request: {
            title: "Improve activity",
            state: "open",
            html_url: "https://github.com/matt2jog/portfolio/pull/1",
            created_at: "2026-07-02T00:00:00Z",
            merged_at: null,
            closed_at: null,
          },
        },
      }]);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const activity = await fetchGithubActivity("matt2jog");
  assert.equal(activity.login, "matt2jog");
  assert.equal(activity.repositories.totalCount, 12);
  assert.equal(activity.repositories.nodes[0]?.name, "portfolio");
  assert.equal(activity.pullRequests.nodes[0]?.title, "Improve activity");
  assert.equal(activity.contributionsCollection.contributionCalendar.totalContributions, 0);
  assert.equal(requests.length, 3);
  assert.equal(requests.every((request) => request.authorization === null), true);
});

test("GitHub REST errors expose status context without leaking response bodies", async () => {
  globalThis.fetch = (async () =>
    new Response("sensitive provider body", { status: 403, statusText: "Forbidden" })
  ) as typeof fetch;

  await assert.rejects(
    () => fetchGithubActivity("matt2jog"),
    (error: unknown) =>
      error instanceof Error
      && /403 Forbidden/.test(error.message)
      && !error.message.includes("sensitive provider body"),
  );
});
