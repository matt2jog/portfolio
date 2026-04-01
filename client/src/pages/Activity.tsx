import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ActivityToggle } from "@/components/ActivityToggle";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  GitPullRequest,
  GitCommit,
  GitBranch,
  Activity as ActivityIcon,
  Users,
  ExternalLink,
  Calendar,
  Linkedin,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Loader2,
  Plus,
  GitMerge,
  FileText,
  Repeat2,
  Heart,
  Image as ImageIcon,
  Video,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

type ActivityTab = "github" | "linkedin";

interface GithubTimelineEvent {
  id: string;
  type: "commit" | "pr" | "repo";
  title: string;
  description: string | null;
  url: string | null;
  repo: string;
  timestamp: string;
  meta: Record<string, any>;
}

interface LinkedinSummary {
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

interface LinkedinTimelineEvent {
  id: string;
  type: "post" | "repost" | "article";
  title: string;
  description: string | null;
  url: string | null;
  source: string;
  timestamp: string;
  meta: Record<string, any>;
}

interface LinkedinImageViewerState {
  eventId: string;
  title: string;
  images: string[];
  activeIndex: number;
}

export default function Activity() {
  const [activeTab, setActiveTab] = useState<ActivityTab>("github");
  const isMobile = useIsMobile();

  const {
    data: githubData,
    isLoading: isGithubLoading,
    error: githubError,
  } = useQuery({
    queryKey: ["/api/public/github/activity"],
    enabled: activeTab === "github",
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: linkedinData,
    isLoading: isLinkedinLoading,
    error: linkedinError,
  } = useQuery<LinkedinSummary>({
    queryKey: ["/api/public/linkedin/activity"],
    enabled: activeTab === "linkedin",
    staleTime: 1000 * 60 * 10,
  });

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 flex flex-col relative">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 system-grid opacity-70" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 520px at 15% 15%, hsl(var(--primary)/.12), transparent 55%), radial-gradient(760px 420px at 95% 30%, hsl(var(--accent)/.14), transparent 55%), radial-gradient(900px 700px at 50% 100%, hsl(var(--primary)/.05), transparent 55%)",
          }}
        />
        <div className="absolute inset-0 system-noise" />
      </div>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-24 sm:py-32">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              ACTIVITY<span> </span>
              <span className="text-gray-500">FEED</span>
            </h1>
            <p className="text-muted-foreground font-mono text-sm max-w-2xl mx-auto">
              Real-time contributions, projects, and professional updates.
            </p>
          </motion.div>

          <ProfileCard activeTab={activeTab} githubData={githubData} linkedinData={linkedinData} isMobile={isMobile} />

          <ActivityToggle activeTab={activeTab} onChange={setActiveTab} />

          <AnimatePresence mode="wait">
            {activeTab === "github" ? (
              <motion.div key="github" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <GithubDashboard data={githubData} isLoading={isGithubLoading} error={githubError} />
              </motion.div>
            ) : (
              <motion.div key="linkedin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <LinkedinDashboard data={linkedinData} isLoading={isLinkedinLoading} error={linkedinError} isMobile={isMobile} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function ProfileCard({
  githubData,
  linkedinData,
  activeTab,
  isMobile,
}: {
  githubData: any;
  linkedinData: LinkedinSummary | undefined;
  activeTab: ActivityTab;
  isMobile: boolean;
}) {
  const githubReady = activeTab === "github" && githubData && !githubData._error && githubData.avatarUrl;
  const linkedinReady =
    activeTab === "linkedin" &&
    linkedinData &&
    !linkedinData._error &&
    (linkedinData.avatarUrl || linkedinData.name || linkedinData.url);

  if (githubReady) {
    return (
      <motion.a
        key="github-profile"
        href={githubData.url}
        target="_blank"
        rel="noreferrer"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="group flex items-center gap-5 mx-auto w-fit px-6 py-4 mb-8 rounded-2xl
          border border-border/50 bg-card/40 backdrop-blur-md
          hover:border-primary/40 hover:bg-card/70 hover:shadow-[0_0_40px_rgba(var(--primary),0.08)]
          transition-all duration-300 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />

        <img
          src={githubData.avatarUrl}
          alt={githubData.name || githubData.login}
          className="w-14 h-14 rounded-full border-2 border-border/60 group-hover:border-primary/50 transition-colors object-cover shadow-lg"
        />

        <div className="z-10">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg leading-tight">{githubData.name || githubData.login}</span>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
            <Github className="w-3.5 h-3.5" />
            <span>@{githubData.login}</span>
            {githubData.bio && (
              <>
                <span className="text-border">|</span>
                <span className="truncate max-w-[200px]">{githubData.bio}</span>
              </>
            )}
          </div>
        </div>
      </motion.a>
    );
  }

  if (linkedinReady && linkedinData) {
    return (
      <motion.a
        key="linkedin-profile"
        href={linkedinData.url || undefined}
        target="_blank"
        rel="noreferrer"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className={`group mx-auto max-w-full mb-8 rounded-2xl
          border border-border/50 bg-card/40 backdrop-blur-md
          hover:border-primary/40 hover:bg-card/70 hover:shadow-[0_0_40px_rgba(var(--primary),0.08)]
          transition-all duration-300 relative overflow-hidden
          ${isMobile ? "w-full px-4 py-4 flex items-start gap-4" : "w-fit px-6 py-4 flex items-center gap-5"}`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />

        {linkedinData.avatarUrl ? (
          <img
            src={linkedinData.avatarUrl}
            alt={linkedinData.name || "LinkedIn profile"}
            className="w-14 h-14 rounded-full border-2 border-border/60 group-hover:border-primary/50 transition-colors object-cover shadow-lg"
          />
        ) : (
          <div className="w-14 h-14 rounded-full border-2 border-border/60 group-hover:border-primary/50 transition-colors bg-muted/40 flex items-center justify-center shadow-lg">
            <Linkedin className="w-6 h-6 text-[#0A66C2]" />
          </div>
        )}

        <div className="z-10 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg leading-tight truncate">
              {linkedinData.name || "LinkedIn Profile"}
            </span>
            {linkedinData.url && (
              <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
          </div>
          <div className={`text-sm text-muted-foreground mt-0.5 min-w-0 ${isMobile ? "space-y-1" : "flex items-center gap-2"}`}>
            <Linkedin className="w-3.5 h-3.5 shrink-0 text-[#0A66C2]" />
            <span className={`${isMobile ? "block" : "truncate max-w-[320px]"}`}>{linkedinData.headline || "Recent public activity"}</span>
          </div>
        </div>
      </motion.a>
    );
  }

  if (activeTab === "linkedin") {
    return (
      <motion.div
        key="linkedin-placeholder"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex items-center gap-5 mx-auto w-fit px-6 py-4 mb-8 rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm"
      >
        <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center border border-border/40">
          <Linkedin className="w-7 h-7 text-muted-foreground/50" />
        </div>
        <div>
          <span className="font-display font-bold text-lg text-muted-foreground/70">LinkedIn Profile</span>
          <p className="text-sm text-muted-foreground/50">
            {linkedinData?._error || "Waiting for LinkedIn activity configuration"}
          </p>
        </div>
      </motion.div>
    );
  }

  return null;
}

function GithubDashboard({ data, isLoading, error }: any) {
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || data?._error) {
    return (
      <IntegrationErrorCard
        icon={<ActivityIcon className="w-12 h-12 text-destructive/80 mx-auto mb-4" />}
        title="GitHub Integration Pending"
        message={data?._error || "Missing GITHUB_TOKEN or GITHUB_USERNAME in environment variables."}
      />
    );
  }

  if (!data) return null;

  const totalCommits = data.contributionsCollection?.contributionCalendar?.totalContributions || 0;
  const reposCount = data.repositories?.totalCount || 0;
  const prsCount = data.pullRequests?.totalCount || 0;
  const followers = data.followers?.totalCount || 0;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<GitCommit />} label="Yearly Commits" value={totalCommits} />
        <StatCard icon={<GitBranch />} label="Repositories" value={reposCount} />
        <StatCard icon={<GitPullRequest />} label="Pull Requests" value={prsCount} />
        <StatCard icon={<Users />} label="Followers" value={followers} />
      </div>

      <ContributionGraph weeks={data.contributionsCollection?.contributionCalendar?.weeks || []} />

      <div className="mt-12">
        <GithubTimeline />
      </div>
    </div>
  );
}

function LinkedinDashboard({
  data,
  isLoading,
  error,
  isMobile,
}: {
  data: LinkedinSummary | undefined;
  isLoading: boolean;
  error: unknown;
  isMobile: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || data?._error) {
    return (
      <IntegrationErrorCard
        icon={<Linkedin className="w-12 h-12 text-[#0A66C2] mx-auto mb-4" />}
        title="LinkedIn Integration Pending"
        message={data?._error || "LinkedIn activity source is not configured yet."}
      />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-12">
      <div className="mt-12">
        <LinkedinTimeline isMobile={isMobile} />
      </div>
    </div>
  );
}

function ContributionGraph({ weeks }: { weeks: any[] }) {
  const chartData = useMemo(() => {
    return weeks
      .map((week: any) => {
        const total = week.contributionDays.reduce((sum: number, day: any) => sum + day.contributionCount, 0);
        const firstDay = week.contributionDays[0]?.date;
        return {
          week: firstDay ? new Date(firstDay).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
          rawDate: firstDay,
          contributions: total,
        };
      })
      .filter((d: any) => d.week);
  }, [weeks]);

  const recentWeeks = chartData.slice(-12);

  if (chartData.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-6"
    >
      <div className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          Contribution Activity
          <span className="text-sm font-normal text-muted-foreground ml-2">(past year)</span>
        </h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="contribGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<MetricTooltip metricLabel="contributions" labelPrefix="Week of" />} />
              <Area
                type="monotone"
                dataKey="contributions"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#contribGradient)"
                animationDuration={1200}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
          <Calendar className="w-5 h-5 text-primary" />
          Weekly Breakdown
          <span className="text-sm font-normal text-muted-foreground ml-2">(last 12 weeks)</span>
        </h2>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recentWeeks} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<MetricTooltip metricLabel="contributions" labelPrefix="Week of" />} />
              <Bar
                dataKey="contributions"
                fill="hsl(var(--primary))"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
                opacity={0.85}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}

function MetricTooltip({
  active,
  payload,
  label,
  metricLabel,
  labelPrefix,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metricLabel: string;
  labelPrefix: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground font-medium mb-1">
        {labelPrefix} {label}
      </p>
      <p className="text-base font-bold text-foreground">
        {payload[0].value} <span className="text-sm font-normal text-muted-foreground">{metricLabel}</span>
      </p>
    </div>
  );
}

function GithubTimeline() {
  const [events, setEvents] = useState<GithubTimelineEvent[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/public/github/timeline?page=${pageNum}`);
      if (!res.ok) throw new Error("Failed to fetch timeline");
      const data = await res.json();
      setEvents((prev) => {
        const existingIds = new Set(prev.map((event) => event.id));
        const newEvents = data.events.filter((event: GithubTimelineEvent) => !existingIds.has(event.id));
        return [...prev, ...newEvents];
      });
      setHasMore(data.hasMore);
      setInitialLoaded(true);
    } catch (err) {
      console.error("Timeline fetch error:", err);
      setInitialLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!initialLoaded) fetchPage(1);
  }, [fetchPage, initialLoaded]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore && initialLoaded) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPage(nextPage);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, initialLoaded, isLoading, page]);

  const groupedEvents = useMemo(() => groupEventsByDate(events), [events]);

  if (!initialLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return <TimelineEmptyState message="No GitHub timeline events available yet." />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Clock className="w-6 h-6" /> Event Timeline
      </h2>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-border/50 to-transparent" />

        {groupedEvents.map((group) => (
          <div key={group.date} className="mb-8">
            <div className="flex items-center gap-3 mb-4 relative">
              <div className="w-12 h-6 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-primary/60 border-2 border-background shadow-[0_0_8px_rgba(var(--primary),0.4)]" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                {group.date}
              </span>
            </div>

            <div className="space-y-2 ml-12">
              {group.events.map((event) => (
                <GithubTimelineEventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}

        <div ref={sentinelRef} className="h-4" />

        {isLoading && <TimelineLoadingMessage message="Loading more events..." />}

        {!hasMore && events.length > 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            You've reached the end of the timeline
          </div>
        )}
      </div>
    </div>
  );
}

function GithubTimelineEventCard({ event }: { event: GithubTimelineEvent }) {
  const repoShort = event.repo.split("/").pop() || event.repo;
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const typeConfig = {
    commit: {
      icon: <GitCommit className="w-4 h-4" />,
      color: "text-sky-400",
      bg: "bg-sky-500/10 border-sky-500/20",
      label: "Commit",
    },
    pr: {
      icon: event.meta.merged ? <GitMerge className="w-4 h-4" /> : <GitPullRequest className="w-4 h-4" />,
      color: event.meta.merged ? "text-purple-400" : event.meta.action === "opened" ? "text-green-400" : "text-red-400",
      bg: event.meta.merged
        ? "bg-purple-500/10 border-purple-500/20"
        : event.meta.action === "opened"
          ? "bg-green-500/10 border-green-500/20"
          : "bg-red-500/10 border-red-500/20",
      label: event.meta.merged ? "PR Merged" : event.meta.action === "opened" ? "PR Opened" : `PR ${event.meta.action}`,
    },
    repo: {
      icon: <Plus className="w-4 h-4" />,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      label: "New Repo",
    },
  };

  const cfg = typeConfig[event.type];

  return (
    <div
      className="group flex items-start gap-3 p-3.5 rounded-xl border border-border/30 bg-card/30
        hover:bg-card/60 hover:border-border/60 transition-all duration-200 relative overflow-hidden"
    >
      <div className={`mt-0.5 w-8 h-8 rounded-lg ${cfg.bg} border flex items-center justify-center shrink-0 ${cfg.color}`}>
        {cfg.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0"
            >
              <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {event.title}
              </p>
            </a>
          ) : (
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {event.title}
            </p>
          )}
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer" className="shrink-0 mt-0.5">
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
        </div>

        {event.description && (
          <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-1 font-mono">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/70 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full font-semibold border text-[10px] uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="font-mono text-foreground/50 border border-border/40 px-1.5 py-0.5 rounded bg-muted/20 truncate max-w-[160px]">
            {repoShort}
          </span>
          {event.type === "commit" && event.meta.sha && (
            <span className="font-mono text-foreground/40">{event.meta.sha}</span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}

function LinkedinTimeline({ isMobile }: { isMobile: boolean }) {
  const [events, setEvents] = useState<LinkedinTimelineEvent[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [viewer, setViewer] = useState<LinkedinImageViewerState | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/public/linkedin/timeline?page=${pageNum}`);
      if (!res.ok) throw new Error("Failed to fetch LinkedIn timeline");
      const data = await res.json();
      setEvents((prev) => {
        const existingIds = new Set(prev.map((event) => event.id));
        const newEvents = data.events.filter((event: LinkedinTimelineEvent) => !existingIds.has(event.id));
        return [...prev, ...newEvents];
      });
      setHasMore(data.hasMore);
      setInitialLoaded(true);
    } catch (err) {
      console.error("LinkedIn timeline fetch error:", err);
      setInitialLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!initialLoaded) fetchPage(1);
  }, [fetchPage, initialLoaded]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore && initialLoaded) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPage(nextPage);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, initialLoaded, isLoading, page]);

  const groupedEvents = useMemo(() => groupEventsByDate(events), [events]);

  if (!initialLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return <TimelineEmptyState message="No LinkedIn posts have been synced yet." />;
  }

  const openImageViewer = (event: LinkedinTimelineEvent, images: string[], activeIndex: number) => {
    setViewer({
      eventId: event.id,
      title: event.title,
      images,
      activeIndex,
    });
  };

  const closeImageViewer = () => setViewer(null);
  const showPreviousImage = () => {
    setViewer((current) => {
      if (!current) return null;
      return {
        ...current,
        activeIndex: (current.activeIndex - 1 + current.images.length) % current.images.length,
      };
    });
  };
  const showNextImage = () => {
    setViewer((current) => {
      if (!current) return null;
      return {
        ...current,
        activeIndex: (current.activeIndex + 1) % current.images.length,
      };
    });
  };

  return (
    <div className="space-y-6">
      <h2 className={`font-bold flex items-center gap-2 ${isMobile ? "text-xl" : "text-2xl"}`}>
        <Clock className={isMobile ? "w-5 h-5" : "w-6 h-6"} /> LinkedIn Timeline
      </h2>

      <div className="relative">
        {!isMobile && (
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-[#0A66C2]/50 via-border/50 to-transparent" />
        )}

        {groupedEvents.map((group) => (
          <div key={group.date} className="mb-8">
            <div className={`flex items-center gap-3 mb-4 relative ${isMobile ? "" : ""}`}>
              {!isMobile && (
                <div className="w-12 h-6 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-[#0A66C2]/70 border-2 border-background shadow-[0_0_8px_rgba(10,102,194,0.35)]" />
                </div>
              )}
              <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                {group.date}
              </span>
            </div>

            <div className={`space-y-3 ${isMobile ? "" : "ml-12"}`}>
              {group.events.map((event) => (
                <LinkedinTimelineEventCard
                  key={event.id}
                  event={event}
                  onOpenImageViewer={openImageViewer}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        ))}

        <div ref={sentinelRef} className="h-4" />

        {isLoading && <TimelineLoadingMessage message="Loading more LinkedIn activity..." />}

        {!hasMore && events.length > 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            You've reached the end of the timeline
          </div>
        )}
      </div>

      <LinkedinImageViewer
        viewer={viewer}
        onOpenChange={(open) => {
          if (!open) closeImageViewer();
        }}
        onPrevious={showPreviousImage}
        onNext={showNextImage}
        onSelectIndex={(index) => {
          setViewer((current) => (current ? { ...current, activeIndex: index } : null));
        }}
        isMobile={isMobile}
      />
    </div>
  );
}

function LinkedinTimelineEventCard({
  event,
  onOpenImageViewer,
  isMobile,
}: {
  event: LinkedinTimelineEvent;
  onOpenImageViewer: (event: LinkedinTimelineEvent, images: string[], activeIndex: number) => void;
  isMobile: boolean;
}) {
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const reactions = getLinkedinMetric(event.meta, "likes");
  const comments = getLinkedinMetric(event.meta, "comments");
  const shares = getLinkedinMetric(event.meta, "shares");
  const media = event.meta?.media ?? {};
  const author = event.meta?.author ?? {};
  const imageUrls = getLinkedinImageUrls(event.meta);

  const typeConfig = {
    post: {
      icon: <Linkedin className="w-4 h-4" />,
      color: "text-[#0A66C2]",
      bg: "bg-[#0A66C2]/10 border-[#0A66C2]/20",
      label: "Post",
    },
    repost: {
      icon: <Repeat2 className="w-4 h-4" />,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      label: "Repost",
    },
    article: {
      icon: <FileText className="w-4 h-4" />,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      label: "Article",
    },
  };

  const cfg = typeConfig[event.type];

  return (
    <div
      className={`group rounded-xl border border-border/30 bg-card/30 hover:bg-card/60 hover:border-border/60 transition-all duration-200 relative overflow-hidden ${isMobile ? "p-3.5" : "flex items-start gap-3 p-3.5"
        }`}
    >
      {isMobile ? (
        <div className="mb-3 flex items-start gap-3">
          <div className={`mt-0.5 w-8 h-8 rounded-lg ${cfg.bg} border flex items-center justify-center shrink-0 ${cfg.color}`}>
            {cfg.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              {event.url ? (
                <a href={event.url} target="_blank" rel="noreferrer" className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                    {event.title}
                  </p>
                </a>
              ) : (
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                  {event.title}
                </p>
              )}
              {event.url && (
                <a href={event.url} target="_blank" rel="noreferrer" className="shrink-0 mt-0.5">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60" />
                </a>
              )}
            </div>

            {event.description && (
              <p className="text-xs text-muted-foreground/70 mt-1.5 line-clamp-3">
                {event.description}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className={`mt-0.5 w-8 h-8 rounded-lg ${cfg.bg} border flex items-center justify-center shrink-0 ${cfg.color}`}>
          {cfg.icon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isMobile && (
          <>
            <div className="flex items-start justify-between gap-2">
              {event.url ? (
                <a href={event.url} target="_blank" rel="noreferrer" className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {event.title}
                  </p>
                </a>
              ) : (
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {event.title}
                </p>
              )}
              {event.url && (
                <a href={event.url} target="_blank" rel="noreferrer" className="shrink-0 mt-0.5">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              )}
            </div>

            {event.description && (
              <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                {event.description}
              </p>
            )}
          </>
        )}

        <div className={`flex items-center gap-2 text-xs text-muted-foreground/70 flex-wrap ${isMobile ? "mt-0" : "mt-2"}`}>
          <span className={`px-2 py-0.5 rounded-full font-semibold border text-[10px] uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className={`font-mono text-foreground/50 border border-border/40 px-1.5 py-0.5 rounded bg-muted/20 truncate ${isMobile ? "max-w-[120px]" : "max-w-[160px]"}`}>
            @{event.source}
          </span>
          {imageUrls.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/40 bg-muted/20">
              <ImageIcon className="w-3 h-3" />
              {imageUrls.length}
            </span>
          )}
          {media.hasVideo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/40 bg-muted/20">
              <Video className="w-3 h-3" />
              Video
            </span>
          )}
          {media.hasArticleLink && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/40 bg-muted/20">
              <Link2 className="w-3 h-3" />
              Link
            </span>
          )}
        </div>

        {imageUrls.length > 0 && (
          <div
            className={`mt-3 ${isMobile
              ? "flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory"
              : `grid gap-2 ${imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`
              }`}
          >
            {imageUrls.slice(0, 4).map((imageUrl: string, index: number) => (
              <button
                key={`${event.id}-image-${index}`}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenImageViewer(event, imageUrls, index);
                }}
                className={`overflow-hidden rounded-xl border border-border/40 bg-muted/20 text-left ${isMobile
                  ? "w-[76vw] max-w-[76vw] shrink-0 snap-start"
                  : !isMobile && imageUrls.length === 3 && index === 0
                    ? "col-span-2"
                    : ""
                  }`}
              >
                <img
                  src={imageUrl}
                  alt={`${event.title} image ${index + 1}`}
                  loading="lazy"
                  className={`w-full transition-transform duration-300 group-hover:scale-[1.015] ${isMobile ? "h-[24vh] max-h-[24vh] min-h-[18vh] object-cover" : "h-48 object-cover"
                    }`}
                />
              </button>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-3 mt-2 text-xs text-muted-foreground/70 flex-wrap ${isMobile ? "items-start" : ""}`}>
          <span className="inline-flex items-center gap-1">
            <Heart className="w-3.5 h-3.5" />
            {reactions}
          </span>
          <span className="inline-flex items-center gap-1">
            <ActivityIcon className="w-3.5 h-3.5" />
            {comments}
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat2 className="w-3.5 h-3.5" />
            {shares}
          </span>
          {author.name && (
            <span className={`truncate ${isMobile ? "max-w-[140px]" : "max-w-[180px]"}`}>by {author.name}</span>
          )}
          <span className={`flex items-center gap-1 ${isMobile ? "" : "ml-auto"}`}>
            <Clock className="w-3 h-3" />
            {time}
          </span>
          <span className={`${isMobile ? "w-full" : ""} text-muted-foreground/50`}>{formatRelativeTime(event.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pt-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-40 bg-muted/50 rounded-2xl" />
        ))}
      </div>
      <div className="h-72 bg-muted/50 rounded-2xl mt-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        <div className="h-96 bg-muted/50 rounded-2xl" />
        <div className="h-96 bg-muted/50 rounded-2xl" />
      </div>
    </div>
  );
}

function LinkedinImageViewer({
  viewer,
  onOpenChange,
  onPrevious,
  onNext,
  onSelectIndex,
  isMobile,
}: {
  viewer: LinkedinImageViewerState | null;
  onOpenChange: (open: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectIndex: (index: number) => void;
  isMobile: boolean;
}) {
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer, onNext, onPrevious]);

  const activeImage = viewer ? viewer.images[viewer.activeIndex] : null;

  return (
    <Dialog open={Boolean(viewer)} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "h-[100dvh] w-[100vw] max-w-none rounded-none border-0 bg-black/95 p-0"
            : "max-w-6xl border-border/50 bg-background/95 p-3 sm:p-4"
        }
      >
        <DialogTitle className="sr-only">
          {viewer ? `${viewer.title} image viewer` : "LinkedIn image viewer"}
        </DialogTitle>

        {viewer && activeImage && (
          <div className={`flex flex-col ${isMobile ? "h-full" : "gap-3"}`}>
            <div className={`flex items-center justify-between gap-4 text-sm text-muted-foreground ${isMobile ? "px-4 pt-4 pb-2 pr-14" : "px-10 pt-1"}`}>
              <p className={`${isMobile ? "line-clamp-2" : "truncate"}`}>{viewer.title}</p>
              <p className="shrink-0">
                {viewer.activeIndex + 1} / {viewer.images.length}
              </p>
            </div>

            <div
              className={`relative flex items-center justify-center overflow-hidden bg-black/70 ${isMobile ? "flex-1" : "min-h-[65vh] rounded-2xl"
                }`}
              onTouchStart={(event) => {
                touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const touchStartX = touchStartXRef.current;
                const touchEndX = event.changedTouches[0]?.clientX ?? null;
                if (touchStartX === null || touchEndX === null) return;
                const deltaX = touchEndX - touchStartX;
                if (Math.abs(deltaX) < 40) return;
                if (deltaX > 0) onPrevious();
                else onNext();
              }}
            >
              {viewer.images.length > 1 && (
                <button
                  type="button"
                  onClick={onPrevious}
                  className={`absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 text-white transition-colors hover:bg-black/75 ${isMobile ? "p-3" : "p-2"}`}
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              <img
                src={activeImage}
                alt={`${viewer.title} enlarged image ${viewer.activeIndex + 1}`}
                className={`w-auto max-w-full object-contain ${isMobile ? "max-h-[calc(100dvh-11rem)]" : "max-h-[75vh]"}`}
              />

              {viewer.images.length > 1 && (
                <button
                  type="button"
                  onClick={onNext}
                  className={`absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 text-white transition-colors hover:bg-black/75 ${isMobile ? "p-3" : "p-2"}`}
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {viewer.images.length > 1 && (
              <div className={`${isMobile ? "grid grid-cols-4 gap-2 overflow-x-auto px-3 pb-3 pt-2" : "grid grid-cols-4 gap-2 sm:grid-cols-6"}`}>
                {viewer.images.map((imageUrl, index) => (
                  <button
                    key={`${viewer.eventId}-thumb-${index}`}
                    type="button"
                    onClick={() => onSelectIndex(index)}
                    className={`overflow-hidden rounded-lg border ${index === viewer.activeIndex ? "border-primary" : "border-border/40"
                      }`}
                    aria-label={`View image ${index + 1}`}
                  >
                    <img
                      src={imageUrl}
                      alt={`${viewer.title} thumbnail ${index + 1}`}
                      className={`${isMobile ? "h-14 w-full object-cover" : "h-16 w-full object-cover"}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationErrorCard({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="text-center p-12 border border-destructive/20 bg-destructive/5 rounded-3xl mt-8">
      {icon}
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function TimelineEmptyState({ message }: { message: string }) {
  return (
    <div className="text-center p-10 rounded-3xl border border-border/40 bg-card/20 backdrop-blur-sm">
      <Clock className="w-10 h-10 text-muted-foreground/60 mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function TimelineLoadingMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
      <span className="text-sm text-muted-foreground ml-3">{message}</span>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="p-6 rounded-2xl bg-card/60 backdrop-blur-md border border-border/50 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-card/90 transition-all duration-300 group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h4 className="text-4xl font-bold tracking-tight text-glow-sm">{value}</h4>
      <p className="text-sm text-muted-foreground mt-2 font-medium">{label}</p>
    </div>
  );
}

function groupEventsByDate<T extends { timestamp: string }>(events: T[]) {
  const groups: Array<{ date: string; events: T[] }> = [];
  const groupMap = new Map<string, T[]>();

  for (const event of events) {
    const dateKey = new Date(event.timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    if (!groupMap.has(dateKey)) {
      groupMap.set(dateKey, []);
      groups.push({ date: dateKey, events: groupMap.get(dateKey)! });
    }

    groupMap.get(dateKey)!.push(event);
  }

  return groups;
}

function getLinkedinMetric(meta: Record<string, any>, key: "likes" | "comments" | "shares") {
  const value = meta?.engagement?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getLinkedinImageUrls(meta: Record<string, any>) {
  const images = Array.isArray(meta?.media?.images) ? meta.media.images : [];
  return images.filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 5) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
