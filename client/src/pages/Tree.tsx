import * as React from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  AtSign,
  Code2,
  Github,
  Globe,
  Linkedin,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { usePersonalInformation, type PersonalInformation } from "@/hooks/use-personal-information";

type LinkItem = {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  chip?: string;
};

function getLinks(info: PersonalInformation | undefined): LinkItem[] {
  if (!info) return [];
  return [
    {
      id: "devpost",
      label: "Devpost",
      href: info.devpostUrl,
      description: "Showcase of some of my hackathon wins and some projects.",
      icon: <Code2 className="h-6 w-6" aria-hidden="true" />,
      chip: "builds",
    },
    {
      id: "portfolio",
      label: "Portfolio",
      href: info.portfolioUrl,
      description: "My most carefully curated projects, on a pretty display.",
      icon: <Globe className="h-6 w-6" aria-hidden="true" />,
      chip: "static",
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: info.linkedinUrl,
      description: "Professional networking and industry connections. Lets Connect!",
      icon: <Linkedin className="h-6 w-6" aria-hidden="true" />,
      chip: "network",
    },
    {
      id: "github",
      label: "GitHub",
      href: info.githubUrl,
      description: "Technical repositories, open-source contributions, and hackathon winning ideas.",
      icon: <Github className="h-6 w-6" aria-hidden="true" />,
      chip: "public",
    },
    {
      id: "phone",
      label: "Phone",
      href: `tel:${info.phone}`,
      description: "Feel free to reach out!",
      icon: <AtSign className="h-6 w-6" aria-hidden="true" />,
      chip: "mobile",
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:${info.email}`,
      description: "Feel free to reach out!",
      icon: <Mail className="h-6 w-6" aria-hidden="true" />,
      chip: "direct",
    },
  ];
}

/* HeaderStatus and related helpers removed: useNowTick, pad2, formatUptime, useNetworkSnapshot, MonoChip. */

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

function TimeChip() {
  const now = useNowTick(1000);
  const dt = new Date(now);
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());

  return (
    <div className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-none tracking-tight font-mono bg-[hsl(var(--card)/.6)] text-muted-foreground">
      <span className="text-muted-foreground">t</span>
      <span className="text-foreground">{hh}:{mm}:{ss}</span>
    </div>
  );
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

function NicheCarousel({ links }: { links: LinkItem[] }) {
  const defaultIndex = links.findIndex((l) => l.id === "linkedin");
  const [index, setIndex] = React.useState(defaultIndex >= 0 ? defaultIndex : 0);
  const reduced = useReducedMotion();

  const next = () => setIndex((i) => (i + 1) % links.length);
  const prev = () => setIndex((i) => (i - 1 + links.length) % links.length);

  const getCardPosition = (i: number) => {
    const diff = (i - index + links.length) % links.length;
    if (diff === 0) return "center";
    if (diff === 1 || diff === -(links.length - 1)) return "right";
    if (diff === links.length - 1 || diff === -1) return "left";
    return "hidden";
  };

  React.useEffect(() => {
    if (import.meta.env.DEV && console.debug) {
      console.debug("NicheCarousel mount - items:", links.length);
    }
  }, [links.length]);

  if (links.length === 0) return null;

  return (
    <div data-testid="niche-carousel" className="relative flex h-[400px] w-full items-center justify-center py-10" style={{ perspective: "1000px" }}>
      <div className="relative h-full w-full max-w-[320px] overflow-visible">
        <AnimatePresence mode="popLayout">
          {links.map((item, i) => {
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
                    </div>
                  </div>

                  <p className="relative z-10 px-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>

                  <div className="relative z-10 w-full flex items-center justify-between border-t border-border/50 pt-4">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {new URL(item.href, window.location.href).host.replace(/^www\./, "") || "local"}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
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
  const { data: info } = usePersonalInformation();
  const links = getLinks(info);

  if (!info) {
    return null; // or a skeleton loader
  }

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
              <h1 className="text-balance text-4xl font-bold sm:text-5xl lg:text-6xl bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                {info.name}
              </h1>
              <p className="max-w-[500px] text-pretty text-base text-muted-foreground leading-relaxed">
                {info.shortBio}
              </p>
            </div>

            {/* time-only status chip (uptime & online removed) */}
            <div className="mt-3">
              <TimeChip />
            </div>
          </div>
        </motion.header>

        <main className="mt-4 w-full">
          <NicheCarousel links={links} />
        </main>
      </div>

      <Footer />
    </div>
  );
}
