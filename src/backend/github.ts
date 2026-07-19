import { db } from "./data/db";
import { githubTimelineEvents } from "../shared/schema";
import { desc } from "drizzle-orm";

export async function fetchGithubActivity(username: string, token: string) {
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

  const response = await fetch('https://api.github.com/graphql', {
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

  if (!username || !token) {
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
      _error: "GITHUB_USERNAME or GITHUB_TOKEN not configured"
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

  if (!username || !token) return;

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

let syncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN = 1000 * 60 * 5; // 5 minutes

export async function getGithubTimeline(page: number = 1, limit: number = 30): Promise<{ events: TimelineEvent[]; hasMore: boolean }> {
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username || !token) {
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
