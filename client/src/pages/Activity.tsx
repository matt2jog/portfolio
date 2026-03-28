import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ActivityToggle } from "@/components/ActivityToggle";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github, GitPullRequest, GitCommit, GitBranch, Star,
  Activity as ActivityIcon, Users, ExternalLink, Calendar,
  Linkedin, Clock, ArrowUpRight, TrendingUp, Loader2,
  MessageSquare, Plus, GitMerge
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid
} from "recharts";

export default function Activity() {
  const [activeTab, setActiveTab] = useState<"github" | "linkedin">("github");

  const { data: githubData, isLoading, error } = useQuery({
    queryKey: ["/api/public/github/activity"],
    enabled: activeTab === "github",
    staleTime: 1000 * 60 * 5,
  });

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-24 sm:py-32">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4 text-glow transition-all duration-300">
              Activity Feed
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Real-time feed of my latest contributions, projects, and professional updates.
            </p>
          </motion.div>

          {/* Profile Card */}
          <ProfileCard data={githubData} activeTab={activeTab} />

          <ActivityToggle activeTab={activeTab} onChange={setActiveTab} />

          <AnimatePresence mode="wait">
            {activeTab === "github" ? (
              <motion.div key="github" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <GithubDashboard data={githubData} isLoading={isLoading} error={error} />
              </motion.div>
            ) : (
              <motion.div key="linkedin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <LinkedinDashboard />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────── Profile Card ─────────────── */

function ProfileCard({ data, activeTab }: { data: any; activeTab: "github" | "linkedin" }) {
  const hasProfile = activeTab === "github" && data && !data._error && data.avatarUrl;

  return (
    <AnimatePresence mode="wait">
      {hasProfile ? (
        <motion.a
          key="profile-card"
          href={data.url}
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
            src={data.avatarUrl}
            alt={data.name || data.login}
            className="w-14 h-14 rounded-full border-2 border-border/60 group-hover:border-primary/50 transition-colors object-cover shadow-lg"
          />

          <div className="z-10">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg leading-tight">{data.name || data.login}</span>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <Github className="w-3.5 h-3.5" />
              <span>@{data.login}</span>
              {data.bio && (
                <>
                  <span className="text-border">·</span>
                  <span className="truncate max-w-[200px]">{data.bio}</span>
                </>
              )}
            </div>
          </div>
        </motion.a>
      ) : activeTab === "linkedin" ? (
        <motion.div
          key="linkedin-profile"
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
            <p className="text-sm text-muted-foreground/50">Coming soon</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ─────────────── GitHub Dashboard ─────────────── */

function GithubDashboard({ data, isLoading, error }: any) {
  if (isLoading) {
    return (
      <div className="space-y-6 pt-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-muted/50 rounded-2xl" />
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

  if (error || data?._error) {
    return (
      <div className="text-center p-12 border border-destructive/20 bg-destructive/5 rounded-3xl mt-8">
        <ActivityIcon className="w-12 h-12 text-destructive/80 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">GitHub Integration Pending</h3>
        <p className="text-muted-foreground">
          {data?._error || "Missing GITHUB_TOKEN or GITHUB_USERNAME in environment variables."}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const totalCommits = data.contributionsCollection?.contributionCalendar?.totalContributions || 0;
  const reposCount = data.repositories?.totalCount || 0;
  const prsCount = data.pullRequests?.totalCount || 0;
  const followers = data.followers?.totalCount || 0;

  return (
    <div className="space-y-12">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<GitCommit />} label="Yearly Commits" value={totalCommits} />
        <StatCard icon={<GitBranch />} label="Repositories" value={reposCount} />
        <StatCard icon={<GitPullRequest />} label="Pull Requests" value={prsCount} />
        <StatCard icon={<Users />} label="Followers" value={followers} />
      </div>

      {/* Contribution Graph */}
      <ContributionGraph weeks={data.contributionsCollection?.contributionCalendar?.weeks || []} />

      {/* Infinite Scroll Timeline */}
      <div className="mt-12">
        <ActivityTimeline />
      </div>
    </div>
  );
}

/* ─────────────── Contribution Graph ─────────────── */

function ContributionGraph({ weeks }: { weeks: any[] }) {
  const chartData = useMemo(() => {
    // Aggregate weekly contributions for the area chart
    return weeks.map((week: any) => {
      const total = week.contributionDays.reduce((sum: number, day: any) => sum + day.contributionCount, 0);
      const firstDay = week.contributionDays[0]?.date;
      return {
        week: firstDay ? new Date(firstDay).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
        rawDate: firstDay,
        contributions: total,
      };
    }).filter((d: any) => d.week);
  }, [weeks]);

  // Last 12 weeks for the bar chart detail view
  const recentWeeks = chartData.slice(-12);

  if (chartData.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-6"
    >
      {/* Full year area chart */}
      <div className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md">
        <h2 className="text-xl font-display font-bold flex items-center gap-2 mb-6">
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
              <Tooltip content={<ChartTooltip />} />
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

      {/* Recent 12 weeks bar chart */}
      <div className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md">
        <h2 className="text-xl font-display font-bold flex items-center gap-2 mb-6">
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
              <Tooltip content={<ChartTooltip />} />
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

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground font-medium mb-1">Week of {label}</p>
      <p className="text-base font-bold text-foreground">
        {payload[0].value} <span className="text-sm font-normal text-muted-foreground">contributions</span>
      </p>
    </div>
  );
}



/* ─────────────── Activity Timeline (Infinite Scroll) ─────────────── */

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

function ActivityTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
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
        // Deduplicate by id
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = data.events.filter((e: TimelineEvent) => !existingIds.has(e.id));
        return [...prev, ...newEvents];
      });
      setHasMore(data.hasMore);
      setInitialLoaded(true);
    } catch (err) {
      console.error("Timeline fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Load first page on mount
  useEffect(() => {
    if (!initialLoaded) fetchPage(1);
  }, []);

  // IntersectionObserver for infinite scroll
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
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, page, initialLoaded]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { date: string; events: TimelineEvent[] }[] = [];
    const groupMap = new Map<string, TimelineEvent[]>();

    for (const ev of events) {
      const dateKey = new Date(ev.timestamp).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
        groups.push({ date: dateKey, events: groupMap.get(dateKey)! });
      }
      groupMap.get(dateKey)!.push(ev);
    }

    return groups;
  }, [events]);

  if (!initialLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold flex items-center gap-2">
        <Clock className="w-6 h-6" /> Event Timeline
      </h2>

      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-border/50 to-transparent" />

        {groupedEvents.map((group, gi) => (
          <div key={gi} className="mb-8">
            {/* Date header */}
            <div className="flex items-center gap-3 mb-4 relative">
              <div className="w-12 h-6 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-primary/60 border-2 border-background shadow-[0_0_8px_rgba(var(--primary),0.4)]" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                {group.date}
              </span>
            </div>

            {/* Events for this date */}
            <div className="space-y-2 ml-12">
              {group.events.map((ev) => (
                <TimelineEventCard key={ev.id} event={ev} />
              ))}
            </div>
          </div>
        ))}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-4" />

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground ml-3">Loading more events...</span>
          </div>
        )}

        {!hasMore && events.length > 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            You've reached the end of the timeline
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineEventCard({ event }: { event: TimelineEvent }) {
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

  const Wrapper: any = event.url ? "a" : "div";
  const wrapperProps = event.url
    ? { href: event.url, target: "_blank", rel: "noreferrer" }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="group flex items-start gap-3 p-3.5 rounded-xl border border-border/30 bg-card/30
        hover:bg-card/60 hover:border-border/60 transition-all duration-200 relative overflow-hidden"
    >
      {/* Type icon */}
      <div className={`mt-0.5 w-8 h-8 rounded-lg ${cfg.bg} border flex items-center justify-center shrink-0 ${cfg.color}`}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {event.title}
          </p>
          {event.url && (
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
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
    </Wrapper>
  );
}

/* ─────────────── LinkedIn (Placeholder) ─────────────── */

function LinkedinDashboard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-32 px-4 border border-border/50 rounded-3xl bg-card/30 backdrop-blur-sm"
    >
      <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-muted/50 mb-8 border border-border shadow-inner">
        <Linkedin className="w-12 h-12 text-muted-foreground" />
      </div>
      <h2 className="text-3xl font-display font-bold mb-4">LinkedIn Activity</h2>
      <p className="text-muted-foreground max-w-md mx-auto text-lg leading-relaxed">
        Integration with LinkedIn is coming soon. Stay tuned to see professional updates and posts directly in this feed.
      </p>
    </motion.div>
  );
}

/* ─────────────── Shared Components ─────────────── */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="p-6 rounded-2xl bg-card/60 backdrop-blur-md border border-border/50 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-card/90 transition-all duration-300 group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h4 className="text-4xl font-bold font-display tracking-tight text-glow-sm">{value}</h4>
      <p className="text-sm text-muted-foreground mt-2 font-medium">{label}</p>
    </div>
  );
}

/* ─────────────── Helpers ─────────────── */

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
