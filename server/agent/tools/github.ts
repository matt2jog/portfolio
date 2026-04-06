import { Tool, type ToolDefinition } from "../tool";

const GITHUB_API = "https://api.github.com";

function githubHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Portfolio-Agent",
  };
}

async function ghFetch(path: string): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  1. Repo overview — README + top-level metadata                     */
/* ------------------------------------------------------------------ */

export class GitHubRepoTool extends Tool {
  readonly name = "github_repo_overview";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "Fetch the README and basic metadata (description, language, stars, topics, open issues) for a GitHub repository. Use this first to understand what a repo is about.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner / org (e.g. 'binimal101')" },
        repo: { type: "string", description: "Repository name (e.g. 'my-project')" },
      },
      required: ["owner", "repo"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const owner = String(args.owner);
    const repo = String(args.repo);

    const [meta, readmeRaw] = await Promise.all([
      ghFetch(`/repos/${owner}/${repo}`),
      ghFetch(`/repos/${owner}/${repo}/readme`).catch(() => null),
    ]);

    let readme = "(no README)";
    if (readmeRaw?.content) {
      try {
        readme = Buffer.from(readmeRaw.content, "base64").toString("utf-8").slice(0, 4000);
      } catch { /* ignore */ }
    }

    return JSON.stringify({
      full_name: meta.full_name,
      description: meta.description,
      language: meta.language,
      stars: meta.stargazers_count,
      forks: meta.forks_count,
      open_issues: meta.open_issues_count,
      topics: meta.topics,
      created_at: meta.created_at,
      pushed_at: meta.pushed_at,
      homepage: meta.homepage,
      readme: readme,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  2. File tree — list files/dirs at a path                           */
/* ------------------------------------------------------------------ */

export class GitHubFileTreeTool extends Tool {
  readonly name = "github_file_tree";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "List files and directories in a GitHub repository at a given path. Use this to explore the project structure before reading specific files.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: {
          type: "string",
          description: "Directory path within the repo (empty string or '.' for root)",
        },
        ref: {
          type: "string",
          description: "Branch or commit SHA (defaults to the repo's default branch)",
        },
      },
      required: ["owner", "repo", "path"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const owner = String(args.owner);
    const repo = String(args.repo);
    const path = String(args.path || "").replace(/^\.?\/?/, "");
    const ref = args.ref ? `?ref=${args.ref}` : "";

    const endpoint = path
      ? `/repos/${owner}/${repo}/contents/${path}${ref}`
      : `/repos/${owner}/${repo}/contents${ref}`;

    const data = await ghFetch(endpoint);
    const items = (Array.isArray(data) ? data : [data]).map((f: any) => ({
      name: f.name,
      type: f.type, // "file" | "dir"
      path: f.path,
      size: f.size,
    }));

    return JSON.stringify({ path: path || "/", items });
  }
}

/* ------------------------------------------------------------------ */
/*  3. Read a specific file                                            */
/* ------------------------------------------------------------------ */

export class GitHubReadFileTool extends Tool {
  readonly name = "github_read_file";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "Read the contents of a specific file in a GitHub repository. Content is truncated at 6000 characters. Use github_file_tree first to find the right path.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "Full file path within the repo (e.g. 'src/main.ts')" },
        ref: { type: "string", description: "Branch or commit SHA (optional)" },
      },
      required: ["owner", "repo", "path"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const owner = String(args.owner);
    const repo = String(args.repo);
    const path = String(args.path);
    const ref = args.ref ? `?ref=${args.ref}` : "";

    const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}${ref}`);

    if (data.type !== "file") {
      return JSON.stringify({ error: `'${path}' is not a file — use github_file_tree to list directories` });
    }
    if (!data.content) {
      return JSON.stringify({ error: "File has no content (may be binary or too large)" });
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8").slice(0, 6000);
    const truncated = content.length === 6000;

    return JSON.stringify({ path, size: data.size, content, truncated });
  }
}

/* ------------------------------------------------------------------ */
/*  4. List recent commits                                             */
/* ------------------------------------------------------------------ */

export class GitHubCommitsTool extends Tool {
  readonly name = "github_commits";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "List the most recent commits for a repository, optionally filtered to a specific file path.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "Optional file/dir path to filter commits" },
        per_page: { type: "string", description: "Number of commits to return (default 10, max 30)" },
      },
      required: ["owner", "repo"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const owner = String(args.owner);
    const repo = String(args.repo);
    const perPage = Math.min(30, parseInt(String(args.per_page || "10"), 10) || 10);
    const pathFilter = args.path ? `&path=${encodeURIComponent(String(args.path))}` : "";

    const data = await ghFetch(
      `/repos/${owner}/${repo}/commits?per_page=${perPage}${pathFilter}`,
    );

    const commits = (Array.isArray(data) ? data : []).map((c: any) => ({
      sha: c.sha?.slice(0, 7),
      message: c.commit?.message?.split("\n")[0],
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
      url: c.html_url,
    }));

    return JSON.stringify({ repo: `${owner}/${repo}`, commits });
  }
}

/* ------------------------------------------------------------------ */
/*  5. List open issues / PRs                                          */
/* ------------------------------------------------------------------ */

export class GitHubIssuestool extends Tool {
  readonly name = "github_issues";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "List open issues and pull requests for a GitHub repository.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: {
          type: "string",
          description: "Filter by state",
          enum: ["open", "closed", "all"],
        },
        per_page: { type: "string", description: "Number of results (default 10, max 30)" },
      },
      required: ["owner", "repo"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const owner = String(args.owner);
    const repo = String(args.repo);
    const state = ["open", "closed", "all"].includes(String(args.state)) ? String(args.state) : "open";
    const perPage = Math.min(30, parseInt(String(args.per_page || "10"), 10) || 10);

    const data = await ghFetch(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}`,
    );

    const issues = (Array.isArray(data) ? data : []).map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      type: i.pull_request ? "pr" : "issue",
      created_at: i.created_at,
      labels: i.labels?.map((l: any) => l.name),
      url: i.html_url,
    }));

    return JSON.stringify({ repo: `${owner}/${repo}`, issues });
  }
}
