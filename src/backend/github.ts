import { db } from "./data/db";
import { githubTimelineEvents } from "../shared/schema";
import { desc } from "drizzle-orm";

const GITHUB_API = "https://api.github.com";

function githubHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "2jog-portfolio",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGithubJson<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token) });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

type RestGithubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  followers: number;
  public_repos: number;
};

type RestGithubRepo = {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
};

type RestGithubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload?: {
    action?: string;
    size?: number;
    pull_request?: {
      title?: string;
      state?: string;
      html_url?: string;
      created_at?: string;
      merged_at?: string | null;
      closed_at?: string | null;
    };
  };
};

export async function fetchGithubActivity(username: string, token?: string) {
  if (!token) {
    const encodedUsername = encodeURIComponent(username);
    const [user, repositories, events] = await Promise.all([
      fetchGithubJson<RestGithubUser>(`/users/${encodedUsername}`),
      fetchGithubJson<RestGithubRepo[]>(
        `/users/${encodedUsername}/repos?sort=pushed&direction=desc&per_page=10&type=owner`,
      ),
      fetchGithubJson<RestGithubEvent[]>(`/users/${encodedUsername}/events/public?per_page=30`),
    ]);

    const pullRequests = events
      .filter((event) => event.type === "PullRequestEvent" && event.payload?.pull_request)
      .slice(0, 10)
      .map((event) => {
        const pullRequest = event.payload!.pull_request!;
        return {
          title: pullRequest.title ?? "Pull request",
          state: pullRequest.state?.toUpperCase() ?? "OPEN",
          url: pullRequest.html_url ?? null,
          createdAt: pullRequest.created_at ?? event.created_at,
          mergedAt: pullRequest.merged_at ?? null,
          closedAt: pullRequest.closed_at ?? null,
          repository: { nameWithOwner: event.repo.name },
        };
      });

    return {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      url: user.html_url,
      bio: user.bio,
      followers: { totalCount: user.followers },
      repositories: {
        totalCount: user.public_repos,
        nodes: repositories.map((repository) => ({
          name: repository.name,
          description: repository.description,
          stargazerCount: repository.stargazers_count,
          primaryLanguage: repository.language
            ? { name: repository.language, color: null }
            : null,
          url: repository.html_url,
          createdAt: repository.created_at,
          updatedAt: repository.updated_at,
          pushedAt: repository.pushed_at,
        })),
      },
      pullRequests: { totalCount: pullRequests.length, nodes: pullRequests },
      contributionsCollection: {
        contributionCalendar: { totalContributions: 0, weeks: [] },
      },
    };
  }

  const query = `
    query($login: String!) {
      user(login: $login) {
        login
        name
        avatarUrl
        url
        bio
        followers {
          totalCount
        }
        repositories(first: 10, orderBy: {field: PUSHED_AT, direction: DESC}, privacy: PUBLIC) {
          totalCount
          nodes {
            name
            description
            stargazerCount
            primaryLanguage {
              name
              color
            }
            url
            createdAt
            updatedAt
            pushedAt
          }
        }
        pullRequests(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
          totalCount
          nodes {
            title
            state
            url
            createdAt
            mergedAt
            closedAt
            repository {
              nameWithOwner
            }
          }
        }
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`${GITHUB_API}/graphql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Portfolio-App'
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error: ${response.statusText} - ${text}`);
  }

  const { data, errors } = await response.json();
  
  if (errors) {
    throw new Error(`GraphQL Errors: ${errors.map((e: any) => e.message).join(', ')}`);
  }

  if (!data?.user) {
    throw new Error("GitHub user not found.");
  }

  return data.user;
}

let cache: { data: any, timestamp: number } | null = null;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export async function getGithubActivity() {
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username) {
    return {
      login: null,
      name: null,
      avatarUrl: null,
      url: null,
      bio: null,
      followers: { totalCount: 0 },
      repositories: { totalCount: 0, nodes: [] },
      pullRequests: { totalCount: 0, nodes: [] },
      contributionsCollection: { contributionCalendar: { totalContributions: 0, weeks: [] } },
      _error: "GITHUB_USERNAME not configured"
    };
  }

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  try {
    const data = await fetchGithubActivity(username, token);
    cache = { data, timestamp: Date.now() };
    return data;
  } catch (err) {
    console.error("Failed to fetch GitHub activity:", err);
    if (cache) return cache.data;
    throw err;
  }
}

/* ─────────────── Timeline (Events API) ─────────────── */

interface TimelineEvent {
  id: string;
  type: "commit" | "pr" | "repo";
  title: string;
  description: string | null;
  url: string | null;
  repo: string;
  timestamp: string;
  meta: Record<string, any>;
}

export async function syncGithubTimeline() {
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username) return;

  if (!token) {
    await syncGithubTimelineFromRest(username);
    return;
  }

  try {
    const query = `
      query($login: String!) {
        user(login: $login) {
          repositories(first: 30, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              nameWithOwner
              description
              url
              createdAt
            }
          }
          pullRequests(first: 30, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              id
              title
              state
              url
              createdAt
              mergedAt
              closedAt
              repository {
                nameWithOwner
              }
            }
          }
          contributionsCollection {
            commitContributionsByRepository(maxRepositories: 30) {
              repository {
                nameWithOwner
              }
              contributions(first: 30) {
                nodes {
                  commitCount
                  occurredAt
                  url
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: username } }),
    });

    if (!response.ok) return;
    const { data } = await response.json();
    if (!data?.user) return;

    const eventsToInsert: typeof githubTimelineEvents.$inferInsert[] = [];

    // Parse Repositories
    const repos = data.user.repositories?.nodes || [];
    for (const repo of repos) {
      eventsToInsert.push({
        extId: `repo-${repo.createdAt}-${repo.nameWithOwner}`,
        type: "repo",
        title: repo.nameWithOwner.split("/").pop() || repo.nameWithOwner,
        description: repo.description || null,
        url: repo.url,
        repo: repo.nameWithOwner,
        timestamp: new Date(repo.createdAt),
        meta: { ref_type: "repository" },
      });
    }

    // Parse Pull Requests
    const prs = data.user.pullRequests?.nodes || [];
    for (const pr of prs) {
      const merged = !!pr.mergedAt;
      const state = pr.state;
      eventsToInsert.push({
        extId: pr.id || `pr-${pr.createdAt}-${pr.url}`,
        type: "pr",
        title: pr.title || "Pull Request",
        description: null,
        url: pr.url,
        repo: pr.repository?.nameWithOwner || "unknown",
        timestamp: new Date(pr.createdAt),
        meta: {
          action: merged ? "merged" : (pr.closedAt ? "closed" : "opened"),
          state: state,
          merged: merged,
        },
      });
    }

    // Parse Commits
    const commitGroups = data.user.contributionsCollection?.commitContributionsByRepository || [];
    for (const group of commitGroups) {
      const repoName = group.repository?.nameWithOwner || "unknown";
      const contributions = group.contributions?.nodes || [];
      for (const commit of contributions) {
        eventsToInsert.push({
          extId: `commit-${commit.occurredAt}-${repoName}`,
          type: "commit",
          title: `Pushed ${commit.commitCount} commit${commit.commitCount > 1 ? "s" : ""}`,
          description: null,
          url: commit.url,
          repo: repoName,
          timestamp: new Date(commit.occurredAt),
          meta: {
            commitCount: commit.commitCount,
            author: username,
          },
        });
      }
    }

    if (eventsToInsert.length > 0) {
      await db.insert(githubTimelineEvents)
        .values(eventsToInsert)
        .onConflictDoNothing({ target: githubTimelineEvents.extId });
    }
  } catch (err) {
    console.error("Failed to sync GitHub timeline via GraphQL:", err);
  }
}

async function syncGithubTimelineFromRest(username: string): Promise<void> {
  try {
    const encodedUsername = encodeURIComponent(username);
    const [repositories, events] = await Promise.all([
      fetchGithubJson<RestGithubRepo[]>(
        `/users/${encodedUsername}/repos?sort=created&direction=desc&per_page=30&type=owner`,
      ),
      fetchGithubJson<RestGithubEvent[]>(`/users/${encodedUsername}/events/public?per_page=100`),
    ]);

    const eventsToInsert: typeof githubTimelineEvents.$inferInsert[] = repositories.map((repo) => ({
      extId: `repo-${repo.created_at}-${repo.full_name}`,
      type: "repo",
      title: repo.name,
      description: repo.description,
      url: repo.html_url,
      repo: repo.full_name,
      timestamp: new Date(repo.created_at),
      meta: { ref_type: "repository" },
    }));

    for (const event of events) {
      if (event.type === "PullRequestEvent" && event.payload?.pull_request) {
        const pullRequest = event.payload.pull_request;
        eventsToInsert.push({
          extId: event.id,
          type: "pr",
          title: pullRequest.title ?? "Pull request",
          description: null,
          url: pullRequest.html_url ?? null,
          repo: event.repo.name,
          timestamp: new Date(event.created_at),
          meta: {
            action: event.payload.action ?? "updated",
            state: pullRequest.state ?? null,
            merged: Boolean(pullRequest.merged_at),
          },
        });
      } else if (event.type === "PushEvent") {
        const count = Math.max(1, event.payload?.size ?? 1);
        eventsToInsert.push({
          extId: event.id,
          type: "commit",
          title: `Pushed ${count} commit${count === 1 ? "" : "s"}`,
          description: null,
          url: `https://github.com/${event.repo.name}`,
          repo: event.repo.name,
          timestamp: new Date(event.created_at),
          meta: { commitCount: count, author: username },
        });
      }
    }

    if (eventsToInsert.length > 0) {
      await db
        .insert(githubTimelineEvents)
        .values(eventsToInsert)
        .onConflictDoNothing({ target: githubTimelineEvents.extId });
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "portfolio.github.timeline_sync_failed",
      mode: "public_rest",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }
}

let syncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN = 1000 * 60 * 5; // 5 minutes

export async function getGithubTimeline(page: number = 1, limit: number = 30): Promise<{ events: TimelineEvent[]; hasMore: boolean }> {
  const username = process.env.GITHUB_USERNAME;

  if (!username) {
    return { events: [], hasMore: false };
  }

  // Trigger sync in background if on page 1 and cooldown elapsed
  if (page === 1 && Date.now() - lastSyncTime > SYNC_COOLDOWN) {
    if (!syncPromise) {
      syncPromise = syncGithubTimeline().finally(() => {
        syncPromise = null;
        lastSyncTime = Date.now();
      });
    }
    // We can await it so page 1 always has fresh data
    await syncPromise;
  }

  try {
    const offset = (page - 1) * limit;
    
    // Fetch limit + 1 to determine hasMore
    const rows = await db.select()
      .from(githubTimelineEvents)
      .orderBy(desc(githubTimelineEvents.timestamp))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const eventsToReturn = hasMore ? rows.slice(0, limit) : rows;

    const formattedEvents = eventsToReturn.map(row => ({
      id: row.extId,
      type: row.type as "commit" | "pr" | "repo",
      title: row.title,
      description: row.description,
      url: row.url,
      repo: row.repo,
      timestamp: row.timestamp.toISOString(),
      meta: row.meta as Record<string, any>
    }));

    return { events: formattedEvents, hasMore };
  } catch (err) {
    console.error("Failed to fetch timeline from DB:", err);
    throw err;
  }
}
