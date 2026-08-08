import { desc } from "drizzle-orm";
import { db } from "./data/db";
import { linkedinTimelineEvents, personalInformation } from "../shared/schema";

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

const DEFAULT_CACHE_TTL_MINUTES = 60;
const TIMELINE_PAGE_LIMIT = 30;

let lastSyncError: string | null = null;
let summaryCache: { data: LinkedinActivitySummary; timestamp: number } | null = null;

export async function getLinkedinActivity(): Promise<LinkedinActivitySummary> {
  const cacheTtlMs = parsePositiveInt(process.env.LINKEDIN_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MINUTES) * 60_000;
  if (canUseSummaryCache(summaryCache, cacheTtlMs)) {
    return summaryCache!.data;
  }

  const profileUrl = await resolveLinkedinProfileUrl();

  if (!profileUrl) {
    return EMPTY_SUMMARY(null, "LinkedIn profile URL not configured");
  }

  const rows = await readLinkedinTimelineRows(250, 0);

  if (rows.length === 0) {
    const empty = EMPTY_SUMMARY(profileUrl, lastSyncError || undefined);
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
    url: profileUrl,
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

export async function getLinkedinTimeline(
  page: number = 1,
  limit: number = TIMELINE_PAGE_LIMIT,
): Promise<{ events: LinkedinTimelineEvent[]; hasMore: boolean }> {
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

async function resolveLinkedinProfileUrl(): Promise<string | null> {
  const [info] = await db
    .select()
    .from(personalInformation)
    .orderBy(desc(personalInformation.updatedAt))
    .limit(1);

  return normalizeLinkedinUrl(process.env.LINKEDIN_PROFILE_URL || info?.linkedinUrl || null);
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
      lastSyncError = "Admin-owned career schema is missing linkedin_timeline_events";
      return [];
    }
    throw err;
  }
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

function normalizeLinkedinUrl(value: string | null) {
  const url = stringOrNull(value)?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
