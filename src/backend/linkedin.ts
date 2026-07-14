import { desc, sql } from "drizzle-orm";
import { db } from "./data/db";
import { linkedinTimelineEvents, personalInformation } from "../shared/schema";
import { isLinkedinSyncEnabled } from "./linkedin-sync-policy";

type LinkedinEventType = "post" | "repost" | "article";

interface LinkedinTimelineEvent {
  id: string;
  type: LinkedinEventType;
  title: string;
  description: string | null;
  url: string | null;
  source: string;
  timestamp: string;
  meta: Record<string, any>;
}

interface LinkedinActivitySummary {
  name: string | null;
  headline: string | null;
  avatarUrl: string | null;
  url: string | null;
  recentPostCount: number;
  visibleReactions: number;
  visibleComments: number;
  repostsOrArticles: number;
  weeklyPosts: Array<{ week: string; rawDate: string; posts: number }>;
  weeklyEngagement: Array<{ week: string; rawDate: string; engagement: number }>;
  _error?: string;
}

interface LinkedinProviderConfig {
  provider: string;
  profileUrl: string | null;
  apifyToken: string | null;
  actorId: string;
  maxPosts: number;
}

interface LinkedinProvider {
  syncTimeline(config: LinkedinProviderConfig): Promise<typeof linkedinTimelineEvents.$inferInsert[]>;
}

const EMPTY_SERIES = buildEmptyWeeklySeries();
const EMPTY_SUMMARY = (url: string | null, error?: string): LinkedinActivitySummary => ({
  name: null,
  headline: null,
  avatarUrl: null,
  url,
  recentPostCount: 0,
  visibleReactions: 0,
  visibleComments: 0,
  repostsOrArticles: 0,
  weeklyPosts: EMPTY_SERIES.map((point) => ({ ...point, posts: 0 })),
  weeklyEngagement: EMPTY_SERIES.map((point) => ({ ...point, engagement: 0 })),
  ...(error ? { _error: error } : {}),
});

const DEFAULT_PROVIDER = "apify_public";
const DEFAULT_ACTOR_ID = "harvestapi~linkedin-profile-posts";
const DEFAULT_MAX_POSTS = 100;
const DEFAULT_SYNC_COOLDOWN_MINUTES = 60;
const DEFAULT_CACHE_TTL_MINUTES = 60;
const TIMELINE_PAGE_LIMIT = 30;

let syncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
let lastSyncError: string | null = null;
let summaryCache: { data: LinkedinActivitySummary; timestamp: number } | null = null;

const providers: Record<string, LinkedinProvider> = {
  apify_public: {
    async syncTimeline(config) {
      if (!config.apifyToken) {
        throw new Error("APIFY_TOKEN not configured");
      }
      if (!config.profileUrl) {
        throw new Error("LinkedIn profile URL not configured");
      }

      const items = await runApifyProfilePostsActor(config);
      return items
        .map((item) => mapApifyItemToTimelineEvent(item, config.profileUrl!))
        .filter((item): item is typeof linkedinTimelineEvents.$inferInsert => Boolean(item));
    },
  },
};

export async function getLinkedinActivity(): Promise<LinkedinActivitySummary> {
  const cacheTtlMs = parsePositiveInt(process.env.LINKEDIN_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MINUTES) * 60_000;
  if (canUseSummaryCache(summaryCache, cacheTtlMs)) {
    return summaryCache!.data;
  }

  const config = await resolveLinkedinProviderConfig();

  if (!config.profileUrl) {
    return EMPTY_SUMMARY(null, "LinkedIn profile URL not configured");
  }

  if (isLinkedinSyncEnabled() && !getSyncConfigError(config)) {
    void ensureLinkedinTimelineFresh(config, false);
  }

  const rows = await readLinkedinTimelineRows(250, 0);

  if (rows.length === 0) {
    const empty = EMPTY_SUMMARY(config.profileUrl, lastSyncError || undefined);
    summaryCache = { data: empty, timestamp: Date.now() };
    return empty;
  }

  const lookbackStart = EMPTY_SERIES[0]?.rawDate ?? startOfWeek(new Date()).toISOString();
  const recentRows = rows.filter((row) => row.timestamp >= new Date(lookbackStart));
  const latestMeta = (rows[0]?.meta ?? {}) as Record<string, any>;
  const author = (latestMeta.author ?? {}) as Record<string, any>;

  const visibleReactions = recentRows.reduce((sum, row) => sum + getReactionCount(row.meta), 0);
  const visibleComments = recentRows.reduce((sum, row) => sum + getCommentCount(row.meta), 0);
  const repostsOrArticles = recentRows.filter((row) => row.type === "repost" || row.type === "article").length;
  const weeklyPosts = buildWeeklyMetricSeries(recentRows, "posts");
  const weeklyEngagement = buildWeeklyMetricSeries(recentRows, "engagement");

  const summary = {
    name: stringOrNull(author.name),
    headline: stringOrNull(author.headline),
    avatarUrl: stringOrNull(author.avatarUrl),
    url: config.profileUrl,
    recentPostCount: recentRows.length,
    visibleReactions,
    visibleComments,
    repostsOrArticles,
    weeklyPosts,
    weeklyEngagement,
    ...(lastSyncError ? { _error: lastSyncError } : {}),
  };

  summaryCache = { data: summary, timestamp: Date.now() };
  return summary;
}

export async function syncLinkedinTimeline() {
  if (!isLinkedinSyncEnabled()) return;

  const config = await resolveLinkedinProviderConfig();
  const configError = getSyncConfigError(config);
  if (configError) return;

  const provider = providers[config.provider];
  if (!provider) return;

  const eventsToInsert = await provider.syncTimeline(config);
  if (eventsToInsert.length === 0) return;

  await db
    .insert(linkedinTimelineEvents)
    .values(eventsToInsert)
    .onConflictDoUpdate({
      target: linkedinTimelineEvents.extId,
      set: {
        type: sql`excluded.type`,
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        url: sql`excluded.url`,
        source: sql`excluded.source`,
        timestamp: sql`excluded.timestamp`,
        meta: sql`excluded.meta`,
      },
    });
}

export async function getLinkedinTimeline(
  page: number = 1,
  limit: number = TIMELINE_PAGE_LIMIT,
): Promise<{ events: LinkedinTimelineEvent[]; hasMore: boolean }> {
  const config = await resolveLinkedinProviderConfig();
  if (isLinkedinSyncEnabled() && !getSyncConfigError(config)) {
    void ensureLinkedinTimelineFresh(config, false);
  }

  const offset = (page - 1) * limit;
  const rows = await readLinkedinTimelineRows(limit + 1, offset);

  const hasMore = rows.length > limit;
  const eventsToReturn = hasMore ? rows.slice(0, limit) : rows;

  return {
    events: eventsToReturn.map((row) => ({
      id: row.extId,
      type: row.type as LinkedinEventType,
      title: row.title,
      description: row.description,
      url: row.url,
      source: row.source,
      timestamp: row.timestamp.toISOString(),
      meta: (row.meta ?? {}) as Record<string, any>,
    })),
    hasMore,
  };
}

async function resolveLinkedinProviderConfig(): Promise<LinkedinProviderConfig> {
  const [info] = await db
    .select()
    .from(personalInformation)
    .orderBy(desc(personalInformation.updatedAt))
    .limit(1);

  return {
    provider: process.env.LINKEDIN_PROVIDER || DEFAULT_PROVIDER,
    profileUrl: normalizeLinkedinUrl(process.env.LINKEDIN_PROFILE_URL || info?.linkedinUrl || null),
    apifyToken: process.env.APIFY_TOKEN || null,
    actorId: normalizeActorId(process.env.APIFY_LINKEDIN_POSTS_ACTOR_ID || DEFAULT_ACTOR_ID),
    maxPosts: parsePositiveInt(process.env.LINKEDIN_SYNC_MAX_POSTS, DEFAULT_MAX_POSTS),
  };
}

function getSyncConfigError(config: LinkedinProviderConfig): string | undefined {
  if (!config.profileUrl) {
    return "LINKEDIN_PROFILE_URL not configured";
  }
  if (!providers[config.provider]) {
    return `Unsupported LINKEDIN_PROVIDER: ${config.provider}`;
  }
  if (config.provider === "apify_public" && !config.apifyToken) {
    return "APIFY_TOKEN not configured";
  }
  return undefined;
}

async function ensureLinkedinTimelineFresh(_config: LinkedinProviderConfig, waitForSync: boolean) {
  if (!isLinkedinSyncEnabled()) return;

  const cooldownMs = parsePositiveInt(process.env.LINKEDIN_SYNC_COOLDOWN_MINUTES, DEFAULT_SYNC_COOLDOWN_MINUTES) * 60_000;
  if (Date.now() - lastSyncTime <= cooldownMs) return;

  if (!syncPromise) {
    syncPromise = syncLinkedinTimeline()
      .then(() => {
        lastSyncError = null;
      })
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "LinkedIn sync failed";
        
        if (errorMessage.includes("403")) {
          lastSyncError = "LinkedIn features in maintenence";
          console.warn("LinkedIn sync skipped: LinkedIn features in maintenence (403 Limit Exceeded)");
        } else {
          lastSyncError = errorMessage;
          console.error("Failed to sync LinkedIn timeline:", err);
        }
      })
      .finally(() => {
        syncPromise = null;
        lastSyncTime = Date.now();
      });
  }

  if (waitForSync) {
    await syncPromise;
  }
}

async function readLinkedinTimelineRows(limit: number, offset: number) {
  try {
    const rows = await db
      .select()
      .from(linkedinTimelineEvents)
      .orderBy(desc(linkedinTimelineEvents.timestamp))
      .limit(limit)
      .offset(offset);
    if (lastSyncError?.includes("migration missing")) {
      lastSyncError = null;
    }
    return rows;
  } catch (err) {
    if (isMissingLinkedinTableError(err)) {
      lastSyncError = 'LinkedIn migration missing: run "npm run db:migrate" to create linkedin_timeline_events';
      return [];
    }
    throw err;
  }
}

async function runApifyProfilePostsActor(config: LinkedinProviderConfig): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(config.actorId)}/run-sync-get-dataset-items?format=json&clean=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apifyToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetUrls: [config.profileUrl],
      maxPosts: config.maxPosts,
      includeQuotePosts: true,
      includeReposts: true,
      scrapeReactions: false,
      scrapeComments: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify LinkedIn actor failed: ${response.status} ${response.statusText} - ${text}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function mapApifyItemToTimelineEvent(
  item: any,
  fallbackProfileUrl: string,
): typeof linkedinTimelineEvents.$inferInsert | null {
  const timestamp = extractTimestamp(item);
  if (!timestamp) return null;

  const url = stringOrNull(item.linkedinUrl) || stringOrNull(item.postUrl) || fallbackProfileUrl;
  const source = deriveSource(item, fallbackProfileUrl);
  const type = inferEventType(item);
  const title = buildTitle(item, type);
  const description = buildDescription(item, title);
  const author = item?.author ?? {};
  const extId =
    stringOrNull(item.id) ||
    stringOrNull(item.postId) ||
    stringOrNull(url) ||
    `${source}-${timestamp.toISOString()}`;

  const likes = parseCount(item?.engagement?.likes);
  const comments = parseCount(item?.engagement?.comments);
  const shares = parseCount(item?.engagement?.shares);
  const reactionBreakdown = Array.isArray(item?.engagement?.reactions) ? item.engagement.reactions : [];
  const imageUrls = extractImageUrls(item);

  return {
    extId,
    type,
    title,
    description,
    url,
    source,
    timestamp,
    meta: {
      provider: DEFAULT_PROVIDER,
      rawType: stringOrNull(item?.type) || stringOrNull(item?.postType) || stringOrNull(item?.contentType),
      author: {
        name: stringOrNull(author?.name),
        headline: stringOrNull(author?.info),
        avatarUrl: stringOrNull(author?.avatar?.url),
        linkedinUrl: stringOrNull(author?.linkedinUrl) || fallbackProfileUrl,
        publicIdentifier: stringOrNull(author?.publicIdentifier),
      },
      articleTitle: stringOrNull(item?.title),
      content: stringOrNull(item?.content),
      visibility: stringOrNull(item?.postedAt?.postedAgoText),
      media: {
        imageCount: imageUrls.length,
        images: imageUrls,
        hasVideo: Boolean(item?.video || item?.postVideo || item?.videoPlayMetadata),
        hasArticleLink: Boolean(item?.articleUrl || item?.externalUrl || item?.url),
      },
      engagement: {
        likes,
        comments,
        shares,
        reactions: reactionBreakdown,
      },
    },
  };
}

function inferEventType(item: any): LinkedinEventType {
  const rawType = [
    item?.type,
    item?.postType,
    item?.contentType,
    item?.entityType,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (
    rawType.includes("article") ||
    Boolean(item?.title && item?.articleUrl)
  ) {
    return "article";
  }

  if (
    rawType.includes("repost") ||
    rawType.includes("reshare") ||
    rawType.includes("share") ||
    Boolean(item?.repostedPost) ||
    Boolean(item?.quotePost) ||
    Boolean(item?.sharedPost)
  ) {
    return "repost";
  }

  return "post";
}

function buildTitle(item: any, type: LinkedinEventType): string {
  const articleTitle = cleanText(stringOrNull(item?.title));
  const content = cleanText(stringOrNull(item?.content));

  if (type === "article" && articleTitle) {
    return truncate(articleTitle, 110);
  }

  if (content) {
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || content;
    return truncate(firstLine, 110);
  }

  if (articleTitle) {
    return truncate(articleTitle, 110);
  }

  return type === "repost" ? "LinkedIn repost" : type === "article" ? "LinkedIn article" : "LinkedIn post";
}

function buildDescription(item: any, title: string): string | null {
  const content = cleanText(stringOrNull(item?.content));
  if (!content) return null;

  let description = content;
  if (description.startsWith(title)) {
    description = description.slice(title.length).trim();
  }

  return description ? truncate(description, 180) : null;
}

function deriveSource(item: any, fallbackProfileUrl: string): string {
  const author = item?.author ?? {};
  const authorId = stringOrNull(author?.publicIdentifier);
  if (authorId) return authorId;

  const authorUrl = stringOrNull(author?.linkedinUrl) || fallbackProfileUrl;
  return extractProfileSlug(authorUrl) || "linkedin";
}

function extractTimestamp(item: any): Date | null {
  const timestampValue = item?.postedAt?.timestamp;
  if (typeof timestampValue === "number" && Number.isFinite(timestampValue)) {
    return new Date(timestampValue);
  }

  const dateString = stringOrNull(item?.postedAt?.date) || stringOrNull(item?.createdAt) || stringOrNull(item?.timestamp);
  if (!dateString) return null;

  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWeeklyMetricSeries(
  rows: Array<typeof linkedinTimelineEvents.$inferSelect>,
  metric: "posts" | "engagement",
) {
  const series = EMPTY_SERIES.map((point) => ({
    ...point,
    [metric]: 0,
  })) as Array<{ week: string; rawDate: string; posts?: number; engagement?: number }>;

  const indexByWeek = new Map(series.map((point, index) => [point.rawDate, index]));

  for (const row of rows) {
    const weekStart = startOfWeek(row.timestamp).toISOString();
    const index = indexByWeek.get(weekStart);
    if (index === undefined) continue;

    if (metric === "posts") {
      series[index].posts = (series[index].posts ?? 0) + 1;
    } else {
      series[index].engagement =
        (series[index].engagement ?? 0) +
        getReactionCount(row.meta) +
        getCommentCount(row.meta) +
        getShareCount(row.meta);
    }
  }

  return series as Array<{ week: string; rawDate: string; posts: number } & { engagement?: number }> as any;
}

function buildEmptyWeeklySeries() {
  const now = new Date();
  const start = startOfWeek(new Date(now));
  const points: Array<{ week: string; rawDate: string }> = [];

  for (let offset = 11; offset >= 0; offset--) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - offset * 7);
    points.push({
      week: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      rawDate: weekStart.toISOString(),
    });
  }

  return points;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function getReactionCount(meta: unknown) {
  const engagement = (meta as any)?.engagement;
  const likes = parseCount(engagement?.likes);
  if (likes > 0) return likes;

  const reactions = Array.isArray(engagement?.reactions) ? engagement.reactions : [];
  return reactions.reduce((sum: number, reaction: any) => sum + parseCount(reaction?.count), 0);
}

function getCommentCount(meta: unknown) {
  return parseCount((meta as any)?.engagement?.comments);
}

function getShareCount(meta: unknown) {
  return parseCount((meta as any)?.engagement?.shares);
}

function parseCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d]/g, "");
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeActorId(actorId: string) {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

function normalizeLinkedinUrl(value: string | null) {
  const url = stringOrNull(value)?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

function extractProfileSlug(url: string | null) {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] || parts[0] || null;
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function extractImageUrls(item: any) {
  const candidates: unknown[] = [];

  if (Array.isArray(item?.postImages)) {
    candidates.push(...item.postImages);
  }

  if (Array.isArray(item?.images)) {
    candidates.push(...item.images);
  }

  if (item?.image) {
    candidates.push(item.image);
  }

  if (item?.imageUrl) {
    candidates.push(item.imageUrl);
  }

  const urls = new Set<string>();

  for (const candidate of candidates) {
    const url = extractImageUrl(candidate);
    if (url) {
      urls.add(url);
    }
  }

  return Array.from(urls);
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct =
    stringOrNull(record.url) ||
    stringOrNull(record.imageUrl) ||
    stringOrNull(record.originalUrl) ||
    stringOrNull(record.src) ||
    stringOrNull(record.downloadUrl);

  if (direct) return direct;

  const nested =
    extractImageUrl(record.image) ||
    extractImageUrl(record.attributes) ||
    extractImageUrl(record.vectorImage);

  if (nested) return nested;

  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const rootUrl = stringOrNull(record.rootUrl);
  if (rootUrl && artifacts.length > 0) {
    const lastArtifact = artifacts[artifacts.length - 1] as Record<string, unknown>;
    const artifactPath = stringOrNull(lastArtifact?.fileIdentifyingUrlPathSegment);
    if (artifactPath) {
      return `${rootUrl}${artifactPath}`;
    }
  }

  return null;
}

function isMissingLinkedinTableError(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "42P01";
}

function canUseSummaryCache(
  cache: { data: LinkedinActivitySummary; timestamp: number } | null,
  ttlMs: number,
) {
  if (!cache) return false;
  if (Date.now() - cache.timestamp > ttlMs) return false;
  if (cache.data._error?.includes("migration missing")) return false;
  return true;
}
