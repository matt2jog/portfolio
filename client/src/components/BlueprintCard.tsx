import { useState, useRef, useEffect, useCallback } from "react";
import { Github, ExternalLink } from "lucide-react";
import SkillsMarquee from "./SkillsMarquee";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BlueprintCardProps {
  title: string;
  description: string;
  tech: string[];
  githubUrl?: string | null;
  deployedUrl?: string | null;
  className?: string;
  activeCardId?: string | null;
  setActiveCardId?: (id: string | null) => void;
  id?: string;
  isActiveFace?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Measure available vertical space between header and footer, then
 *  set the description container max-height so it never overlaps the
 *  footer marquee. Returns the scroll-overflow amount (px). */
function measureLayout(
  card: HTMLDivElement,
  header: HTMLDivElement,
  footer: HTMLDivElement,
  descContainer: HTMLDivElement,
  descText: HTMLParagraphElement,
): number {
  const cardH = card.clientHeight;
  const headerH = header.offsetHeight;
  const footerH = footer.offsetHeight;

  const GAP = 6;
  const SAFETY = 4;

  const available = Math.max(0, cardH - headerH - footerH - GAP * 2 - SAFETY);
  const capped = Math.min(available, Math.floor(cardH * 0.55));

  descContainer.style.maxHeight = `${capped}px`;

  return Math.max(0, descText.scrollHeight - descContainer.clientHeight);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BlueprintCard({
  title,
  description,
  tech,
  githubUrl,
  deployedUrl,
  className,
  activeCardId,
  setActiveCardId,
  id,
  isActiveFace = true,
}: BlueprintCardProps) {
  const cardId = id || `card-${title.replace(/\s+/g, "-")}`;
  const isActive = isActiveFace && activeCardId === cardId;

  const [scrollAmount, setScrollAmount] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const descContainerRef = useRef<HTMLDivElement>(null);
  const descTextRef = useRef<HTMLParagraphElement>(null);

  /* ---- recalc ---------------------------------------------------- */
  const recalc = useCallback(() => {
    if (
      !cardRef.current ||
      !headerRef.current ||
      !footerRef.current ||
      !descContainerRef.current ||
      !descTextRef.current
    ) return;

    const overflow = measureLayout(
      cardRef.current,
      headerRef.current,
      footerRef.current,
      descContainerRef.current,
      descTextRef.current,
    );
    setScrollAmount(overflow);
  }, []);

  /* ---- observers ------------------------------------------------- */
  useEffect(() => {
    recalc();

    const ro = new ResizeObserver(() => recalc());
    const targets = [cardRef, headerRef, footerRef, descContainerRef, descTextRef];
    targets.forEach((ref) => ref.current && ro.observe(ref.current));

    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      ro.disconnect();
    };
  }, [recalc, description]);

  /* Re-measure when the face rotates into view */
  useEffect(() => {
    if (!isActiveFace) return;
    recalc();
    const raf = requestAnimationFrame(() => recalc());
    const t1 = setTimeout(recalc, 100);
    const t2 = setTimeout(recalc, 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isActiveFace, recalc]);

  /* ---- handlers -------------------------------------------------- */
  const activate = () => setActiveCardId?.(cardId);

  const handleMouseEnter = () => {
    activate();
    recalc();
  };

  const handleClick = () => {
    if (!isActive) activate();
  };

  const hasLinks = !!githubUrl || !!deployedUrl;

  /* ---- render ---------------------------------------------------- */
  return (
    <div
      ref={cardRef}
      className={`project-card group relative flex flex-col h-full w-full cursor-pointer overflow-hidden rounded-sm border transition-colors bg-transparent ${isActive ? "border-primary/50" : "border-white/10"} ${className ?? ""}`}
      data-active={isActive}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setActiveCardId?.(null)}
      onTouchStart={handleClick}
      onClick={handleClick}
      style={{ willChange: "opacity, transform" }}
    >
      {/* Card background + grid overlay */}
      <div className="absolute inset-0 bg-black/80" />
      <div className="project-card-overlay absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.06)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Content wrapper */}
      <div className="project-card-content absolute inset-0 flex flex-col bg-gradient-to-t from-black/90 via-black/40 to-transparent">

        {/* === HEADER === */}
        <div ref={headerRef} className="flex-none px-2 sm:px-3 pt-2 sm:pt-3">
          <div className="flex items-start justify-between gap-1">
            <h3
              className={`text-[11px] sm:text-base font-display font-bold leading-tight break-words line-clamp-2 transition-colors ${isActive ? "text-primary" : "text-white group-hover:text-primary"}`}
            >
              {title}
            </h3>

            {hasLinks && (
              <div
                className={`flex items-center gap-0.5 sm:gap-1 flex-none transition-opacity duration-200 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              >
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-gray-400 hover:text-primary transition-colors pointer-events-auto"
                    aria-label="GitHub repository"
                  >
                    <Github className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </a>
                )}
                {deployedUrl && (
                  <a
                    href={deployedUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-gray-400 hover:text-primary transition-colors pointer-events-auto"
                    aria-label="Live site"
                  >
                    <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* === BODY (description) === */}
        <div className="flex-1 min-h-0 px-2 sm:px-3 pt-1">
          <div ref={descContainerRef} className="relative overflow-hidden h-full">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-4 sm:h-6 transition-opacity duration-300 ${isActive && scrollAmount > 0 ? "opacity-100" : "opacity-0"}`}
              style={{ background: "linear-gradient(to top, transparent, rgba(0,0,0,0.4))" }}
            />

            <p
              ref={descTextRef}
              className="text-[9px] sm:text-[11px] text-gray-400 font-light leading-relaxed"
              style={{
                "--scroll-amount": `${scrollAmount}px`,
                animation: isActive && scrollAmount > 0 ? "scroll-boomerang-dynamic 8s ease-in-out infinite" : "none",
              } as React.CSSProperties}
            >
              {description}
            </p>

            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-4 sm:h-6 transition-opacity duration-300 ${scrollAmount > 0 ? "opacity-100" : "opacity-0"}`}
              style={{ background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.6))" }}
            />
          </div>
        </div>

        {/* === FOOTER (divider + marquee) === */}
        <div ref={footerRef} className="flex-none px-2 sm:px-3 pb-2 sm:pb-3">
          <div
            className={`h-px w-full mb-1.5 transition-colors duration-200 ${isActive ? "bg-primary/50" : "bg-white/20 group-hover:bg-primary/50"}`}
          />

          <div className="overflow-hidden max-h-[1.6em] sm:max-h-[2em]">
            <SkillsMarquee skills={tech} isActive={isActive} />
          </div>
        </div>
      </div>

      {/* Corner decorations */}
      <div className={`project-card-corner absolute top-0 left-0 w-3 h-3 sm:w-4 sm:h-4 border-l-2 border-t-2 ${isActive ? "border-primary" : "border-primary/50"}`} />
      <div className={`project-card-corner absolute bottom-0 right-0 w-3 h-3 sm:w-4 sm:h-4 border-r-2 border-b-2 ${isActive ? "border-primary" : "border-primary/50"}`} />

      {/* Active glow */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0"}`}>
        <div className="absolute top-0 left-0 w-24 h-24 bg-primary/20 blur-2xl rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-primary/20 blur-2xl rounded-full translate-x-1/2 translate-y-1/2" />
      </div>
    </div>
  );
}
