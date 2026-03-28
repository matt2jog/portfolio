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
