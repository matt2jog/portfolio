import * as React from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  AtSign,
  Github,
  Globe,
  Linkedin,
  Mail,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/Navbar";

type LinkItem = {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  chip?: string;
};

const LINKS: LinkItem[] = [
  {
    id: "portfolio",
    label: "Portfolio",
    href: "https://2jog.dev/",
    description: "The canonical landing and showcase of my engineering work.",
    icon: <Globe className="h-6 w-6" aria-hidden="true" />,
    chip: "static",
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/binimal101",
    description: "Technical repositories, open-source contributions, and security notes.",
    icon: <Github className="h-6 w-6" aria-hidden="true" />,
    chip: "public",
  },
  {
    id: "devpost",
    label: "Devpost",
    href: "https://devpost.com/",
    description: "Showcase of hackathon projects and innovative builds.",
    icon: <Terminal className="h-6 w-6" aria-hidden="true" />,
    chip: "builds",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://linkedin.com/in/matthewtujague",
    description: "Professional networking and industry connections.",
    icon: <Linkedin className="h-6 w-6" aria-hidden="true" />,
    chip: "network",
  },
  {
    id: "email",
    label: "Email",
    href: "mailto:matthew@2jog.dev",
    description: "Direct line for engineering inquiries and collaborations.",
    icon: <Mail className="h-6 w-6" aria-hidden="true" />,
    chip: "direct",
  },
  {
    id: "phone",
    label: "Phone",
    href: "tel:+10000000000",
    description: "Middletown, NJ resident. Direct contact for urgent matters.",
    icon: <AtSign className="h-6 w-6" aria-hidden="true" />,
    chip: "mobile",
  },
];

function useNowTick(ms: number) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatUptime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/* Color sequencing: base hue + jump per card gives a predictable gradient-like sequence */
const BASE_HUE = 200; /* starting hue */
const HUE_JUMP = 46;  /* degrees to advance per card (adjust for more/less contrast) */

function hashStringToHue(input: string) {
  // keep for backward-compatibility / fallbacks, but we prefer index-based sequencing
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hueForIndex(i: number) {
  return (BASE_HUE + i * HUE_JUMP) % 360;
}

function hslFromHue(h: number) {
  return `hsl(${h} 85% 56% / 1)`;
}

function useNetworkSnapshot() {
  const [snapshot, setSnapshot] = React.useState(() => {
    const c: any = (navigator as any).connection;
    return {
      online: navigator.onLine,
      effectiveType: c?.effectiveType as string | undefined,
      downlink: c?.downlink as number | undefined,
      rtt: c?.rtt as number | undefined,
    };
  });

  React.useEffect(() => {
    const update = () => {
      const c: any = (navigator as any).connection;
      setSnapshot({
        online: navigator.onLine,
        effectiveType: c?.effectiveType as string | undefined,
        downlink: c?.downlink as number | undefined,
        rtt: c?.rtt as number | undefined,
      });
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const c: any = (navigator as any).connection;
    c?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      c?.removeEventListener?.("change", update);
    };
  }, []);

  return snapshot;
}

function MonoChip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "accent";
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-none tracking-tight";
  const styles =
    tone === "primary"
      ? "border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"
      : tone === "accent"
        ? "border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.10)] text-[hsl(var(--foreground))]"
        : "border-border/80 bg-[hsl(var(--card)/.6)] text-muted-foreground";

  return (
    <span className={cn(base, styles, "font-mono")}>
      {children}
    </span>
  );
}

function HeaderStatus() {
  const now = useNowTick(1000);
  const startRef = React.useRef<number>(Date.now());
  const net = useNetworkSnapshot();

  const dt = new Date(now);
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());

  const uptime = formatUptime(now - startRef.current);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MonoChip tone="neutral">
        <span className="text-muted-foreground">t</span>
        <span className="text-foreground">
          {hh}:{mm}:{ss}
        </span>
      </MonoChip>
      <MonoChip tone="neutral">
        <span className="text-muted-foreground">up</span>
        <span className="text-foreground">
          {uptime}
        </span>
      </MonoChip>
      <MonoChip tone={net.online ? "primary" : "accent"}>
        <span>{net.online ? "online" : "offline"}</span>
      </MonoChip>
    </div>
  );
}

function NicheCarousel() {
  const [index, setIndex] = React.useState(0);
  const reduced = useReducedMotion();

  const next = () => setIndex((i) => (i + 1) % LINKS.length);
  const prev = () => setIndex((i) => (i - 1 + LINKS.length) % LINKS.length);

  const getCardPosition = (i: number) => {
    const diff = (i - index + LINKS.length) % LINKS.length;
    if (diff === 0) return "center";
    if (diff === 1 || diff === -(LINKS.length - 1)) return "right";
    if (diff === LINKS.length - 1 || diff === -1) return "left";
    return "hidden";
  };

  return (
    <div data-testid="niche-carousel" className="relative flex h-[400px] w-full items-center justify-center py-10" style={{ perspective: "1000px" }}>
      <div className="relative h-full w-full max-w-[320px] overflow-visible">
        {console.debug && console.debug('NicheCarousel mount — items:', LINKS.length)}
        <AnimatePresence mode="popLayout">
          {LINKS.map((item, i) => {
            const pos = getCardPosition(i);
            const hue = hueForIndex(i); // deterministic gradient jump per card

            if (pos === "hidden") return null;

            return (
              <motion.div
                key={item.id}
                initial={reduced ? { opacity: 0 } : {
                  scale: pos === "center" ? 0.8 : 0.6,
                  x: pos === "right" ? 150 : pos === "left" ? -150 : 0,
                  opacity: 0,
                  rotateY: pos === "right" ? -45 : pos === "left" ? 45 : 0,
                  z: pos === "center" ? 0 : -100,
                }}
                animate={reduced ? { opacity: 1 } : {
                  scale: pos === "center" ? 1 : 0.8,
                  x: pos === "right" ? 180 : pos === "left" ? -180 : 0,
                  opacity: pos === "center" ? 1 : 0.4,
                  rotateY: pos === "right" ? -35 : pos === "left" ? 35 : 0,
                  z: pos === "center" ? 100 : 0,
                  zIndex: pos === "center" ? 30 : 10,
                }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0"
              >
                <a
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-between rounded-3xl border bg-card/80 p-6 text-center shadow-2xl transition-colors hover:bg-card/90",
                    pos !== "center" && "pointer-events-none select-none"
                  )}
                  style={{
                    boxShadow: pos === "center"
                      ? `0 20px 50px -20px hsl(${hue} 100% 50% / 0.3), 0 0 0 1px hsl(var(--border))`
                      : "0 10px 30px -15px rgba(0,0,0,0.5), 0 0 0 1px hsl(var(--border))",
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-3xl opacity-20">
                    <div
                      className="absolute -top-1/2 -left-1/2 h-full w-full blur-3xl"
                      style={{ background: `radial-gradient(circle, ${hslFromHue(hue)} 0%, transparent 70%)` }}
                    />
                  </div>

                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/50 border border-border shadow-inner">
                      {item.icon}
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold tracking-tight text-foreground">{item.label}</h3>
                      {item.chip && <MonoChip tone="primary">{item.chip}</MonoChip>}
                    </div>
                  </div>

                  <p className="relative z-10 px-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>

                  <div className="relative z-10 w-full flex items-center justify-between border-t border-border/50 pt-4">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {new URL(item.href, window.location.href).host.replace(/^www\./, "") || "local"}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                  </div>
                </a>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="absolute inset-x-0 -bottom-8 flex justify-center gap-4 py-2 z-40">
        <button
          onClick={prev}
          aria-label="previous"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/50 hover:bg-card hover:border-primary transition-all shadow-lg"
          style={{ transform: 'translateY(6px)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={next}
          aria-label="next"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/50 hover:bg-card hover:border-primary transition-all shadow-lg"
          style={{ transform: 'translateY(6px)' }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default function Tree() {
  const reduced = useReducedMotion();

  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
      <Navbar />

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

      <div className="relative mx-auto w-full max-w-[800px] px-4 pb-16 pt-20 sm:px-6 sm:pt-24 flex flex-col items-center">
        <motion.header
          initial={reduced ? undefined : { opacity: 0, y: 12 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-8 w-full text-center items-center"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[hsl(var(--card)/.55)] px-3 py-1.5 text-xs text-muted-foreground">
                <span className="font-mono uppercase tracking-widest">
                  // FULL STACK ARCHETECT
                </span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[hsl(var(--primary))]" />
                <span className="font-mono">NJ-NY-PA</span>
              </div>
              <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                Matthew Tujague
              </h1>
              <p className="max-w-[500px] text-pretty text-base text-muted-foreground leading-relaxed">
                Based in Middletown NJ with ties to all of the tri-state, this engineer prefers to scale large systems that promote REAL value.
              </p>
            </div>

            <HeaderStatus />
          </div>
        </motion.header>

        <main className="mt-4 w-full">
          <NicheCarousel />
        </main>

        <motion.footer
          initial={reduced ? undefined : { opacity: 0 }}
          animate={reduced ? undefined : { opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.18 }}
          className="mt-12 w-full border-t border-border/60 pt-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">© {new Date().getFullYear()} Matthew Tujague</span>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
