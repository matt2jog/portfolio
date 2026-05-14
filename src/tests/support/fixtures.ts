export const personalInformationFixture = {
  name: "Matthew Tujague",
  title: "Full Stack Engineer",
  location: "United States",
  shortBio: "Full stack engineer focused on practical systems, data, and product delivery.",
  email: "matthew@2jog.dev",
  phone: "7326393889",
  phoneFormatted: "(732) 639-3889",
  linkedinUrl: "https://www.linkedin.com/in/matthew-tujague",
  githubUrl: "https://github.com/binimal101",
  devpostUrl: "https://devpost.com/binimal101",
  portfolioUrl: "https://2jog.dev",
};

export const experienceFixture = [
  {
    id: "exp-1",
    role: "Lead Software Engineer",
    company: "Applied Systems Lab",
    location: "Remote",
    duration: "2024 - Present",
    description: "Building full stack product systems with AI-assisted workflows, data pipelines, and reliable UX.",
    technologies: ["React", "Node.js", "PostgreSQL", "AI Agents"],
    isActive: true,
    position: 0,
  },
  {
    id: "exp-2",
    role: "Software Engineer",
    company: "Civic Data Studio",
    location: "New Jersey",
    duration: "2022 - 2024",
    description: "Delivered dashboards, backend automation, and developer tooling for operational teams.",
    technologies: ["TypeScript", "Python", "Docker"],
    isActive: false,
    position: 1,
  },
];

export const projectsFixture = Array.from({ length: 8 }, (_, index) => ({
  id: `project-${index + 1}`,
  title: `Project ${index + 1}`,
  category: index % 2 === 0 ? "Systems" : "Product",
  description: `Deterministic portfolio project ${index + 1} for viewport review.`,
  longDescription: `A stable test project description for project ${index + 1}.`,
  xyzBullets: [
    "Built a reliable user-facing workflow.",
    "Improved observability and iteration speed.",
    "Reduced operational friction for maintainers.",
  ],
  tech: ["React", "TypeScript", "PostgreSQL", "Playwright"].slice(0, 2 + (index % 3)),
  image: null,
  hoverImage: null,
  deployedUrl: index % 3 === 0 ? "https://example.com" : null,
  githubUrl: "https://github.com/binimal101",
  position: index,
}));

export const skillsConstellationFixture = [
  ["Infrastructure", "PostgreSQL", "Kafka", "Docker", "Kubernetes", "Terraform", "Redis"],
  ["Frontend", "React", "TypeScript", "Tailwind", "Three.js", "Framer Motion"],
  ["AI Systems", "Agents", "RAG", "Prompt Eval", "Vector Search", "Tool Calling"],
  ["Backend", "Node.js", "Express", "Python", "FastAPI", "Drizzle"],
].flatMap(([groupName, ...skills], groupIndex) =>
  skills.map((skill, skillIndex) => ({
    portfolio_skill_id: `portfolio-skill-${groupIndex}-${skillIndex}`,
    skill_id: `skill-${groupIndex}-${skillIndex}`,
    skill_name: skill,
    group_id: `group-${groupIndex}`,
    group_name: groupName,
  })),
);

export const aiModelsFixture = [
  {
    id: "model-20b",
    label: "GPT OSS 20B",
    modelId: "openai-gpt-oss-20b",
    provider: "mock",
  },
  {
    id: "model-120b",
    label: "GPT OSS 120B",
    modelId: "openai-gpt-oss-120b",
    provider: "mock",
  },
];

export const promptSuggestionsFixture = {
  hash: "mock-suggestions",
  suggestions: [
    {
      label: "Architecture",
      prompt: "Explain the system design choices behind this project.",
    },
    {
      label: "Tradeoffs",
      prompt: "What tradeoffs shaped the implementation?",
    },
  ],
};

export const githubActivityFixture = {
  login: "binimal101",
  name: "Matthew Tujague",
  bio: "Full stack engineer",
  url: "https://github.com/binimal101",
  avatarUrl: "/assets/headshot.png",
  followers: { totalCount: 42 },
  repositories: { totalCount: 18 },
  pullRequests: { totalCount: 64 },
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: 512,
      weeks: Array.from({ length: 14 }, (_, weekIndex) => ({
        contributionDays: Array.from({ length: 7 }, (_, dayIndex) => ({
          date: `2026-04-${String(Math.min(28, weekIndex * 2 + dayIndex + 1)).padStart(2, "0")}`,
          contributionCount: (weekIndex + dayIndex) % 6,
        })),
      })),
    },
  },
};

export const githubTimelineFixture = {
  hasMore: false,
  events: [
    {
      id: "gh-1",
      type: "commit",
      title: "Added viewport testing scaffolding",
      description: "Committed deterministic visual review infrastructure.",
      url: "https://github.com/binimal101",
      repo: "portfolio",
      timestamp: "2026-05-12T14:00:00.000Z",
      meta: {},
    },
    {
      id: "gh-2",
      type: "pr",
      title: "Refined portfolio UI flows",
      description: "Improved interaction coverage across pages.",
      url: "https://github.com/binimal101",
      repo: "portfolio",
      timestamp: "2026-05-11T14:00:00.000Z",
      meta: {},
    },
  ],
};

export const linkedinActivityFixture = {
  name: "Matthew Tujague",
  headline: "Full Stack Engineer",
  avatarUrl: "/assets/headshot.png",
  url: "https://www.linkedin.com/in/matthew-tujague",
  recentPostCount: 3,
  visibleReactions: 120,
  visibleComments: 18,
  repostsOrArticles: 1,
  weeklyPosts: [{ week: "May 6", rawDate: "2026-05-06", posts: 2 }],
  weeklyEngagement: [{ week: "May 6", rawDate: "2026-05-06", engagement: 70 }],
};

export const linkedinTimelineFixture = {
  hasMore: false,
  events: [
    {
      id: "li-1",
      type: "post",
      title: "Building practical developer tooling for portfolio review",
      description: "A short mocked LinkedIn activity item for visual test coverage.",
      url: "https://www.linkedin.com/in/matthew-tujague",
      source: "matthew-tujague",
      timestamp: "2026-05-12T15:00:00.000Z",
      meta: {
        engagement: { likes: 34, comments: 6, shares: 2 },
        media: { images: [], hasVideo: false, hasArticleLink: true },
        author: { name: "Matthew Tujague" },
      },
    },
  ],
};

export const legalHtmlFixture = `
  <h1>Policy Document</h1>
  <h2>Overview</h2>
  <p>This deterministic legal document fixture gives the page stable content during UI tests.</p>
  <h2>Data Practices</h2>
  <p>We use this content to validate layout, table of contents behavior, and responsive reading surfaces.</p>
  <h3>Contact</h3>
  <p>Contact the site owner for questions about policy details.</p>
`;

export const legalDocFixture = {
  html: legalHtmlFixture,
  lastUpdated: "March 27, 2026",
  effectiveDate: "March 27, 2026",
};

export const adminFixtures = {
  me: {
    id: "admin-test-user",
    email: "admin@example.com",
    name: "Local Admin",
    role: "admin",
  },
  bio: {
    id: "bio-current",
    headline: "Full stack engineer building useful systems.",
    paragraphs: [
      { id: "bio-p-1", bioId: "bio-current", content: "I build practical software across product and infrastructure.", position: 0 },
    ],
    createdAt: "2026-05-12T12:00:00.000Z",
  },
  skillGroups: [
    { id: "group-1", name: "Frontend" },
    { id: "group-2", name: "Infrastructure" },
  ],
  allSkills: [
    { id: "all-skill-1", name: "React", groupingId: "group-1", groupingName: "Frontend" },
    { id: "all-skill-2", name: "PostgreSQL", groupingId: "group-2", groupingName: "Infrastructure" },
  ],
  portfolioSkills: [
    { id: "portfolio-skill-1", label: "React", groupingName: "Frontend" },
    { id: "portfolio-skill-2", label: "PostgreSQL", groupingName: "Infrastructure" },
  ],
};
