import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { ArrowUpRight, Github, ExternalLink } from "lucide-react";
import blueprintImage from "@assets/generated_images/blueprint_wireframe_of_a_complex_software_architecture.png";
import SkillsMarquee from "./SkillsMarquee";

interface ProjectProps {
  title: string;
  category: string;
  description: string;
  tech: string[];
  image?: string; // Optional real image, defaults to blueprint
  className?: string;
  activeCardId?: string | null;
  setActiveCardId?: (id: string | null) => void;
  id?: string;
  isActiveFace?: boolean;
}

export function BlueprintCard({ title, category, description, tech, image, className, activeCardId, setActiveCardId, id, isActiveFace = true }: ProjectProps) {
  const cardId = id || `card-${title.replace(/\s+/g, '-')}`;
  const isActive = isActiveFace && activeCardId === cardId;
  const [scrollAmount, setScrollAmount] = useState(0);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skillsRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (setActiveCardId) {
      setActiveCardId(cardId);
    }
    if (descriptionRef.current && containerRef.current) {
      const descHeight = descriptionRef.current.scrollHeight;
      const containerHeight = containerRef.current.clientHeight;
      const overflow = Math.max(0, descHeight - containerHeight);
      setScrollAmount(overflow);
    }
  };

  const handleTouchOrClick = () => {
    if (setActiveCardId && !isActive) {
      handleMouseEnter();
    }
    window.dispatchEvent(new CustomEvent('terminal-log', { 
      detail: { source: 'USR', message: `Project clicked: interest logged in [${title}]`, type: 'telemetry' } 
    }));
  };

  // central recalc function (used by observers and on-face activation)
  const recalc = () => {
    if (!cardRef.current || !titleRef.current || !skillsRef.current || !containerRef.current || !descriptionRef.current) return;

    // compute sizes relative to the card to avoid content-driven shifts
    const cardRect = cardRef.current.getBoundingClientRect();
    const titleRect = titleRef.current.getBoundingClientRect();
    const skillsRect = skillsRef.current.getBoundingClientRect();

    const titleBottomRel = titleRect.bottom - cardRect.top;
    const skillsTopRel = skillsRect.top - cardRect.top;
    const skillsHeight = skillsRect.height;

    // padding gaps and safety buffer
    const gap = 8; // px gap between description and skills
    const safety = 12; // px additional buffer to avoid touching

    // Calculate two estimates and pick the smaller to be conservative:
    // 1) space between title bottom and skills top (position-based)
    const posGap = Math.max(0, skillsTopRel - titleBottomRel - gap);
    // 2) card-relative space minus skills height
    const cardGap = Math.max(0, cardRect.height - titleBottomRel - skillsHeight - gap - safety);

    // Choose smaller available space and subtract safety buffer
    const available = Math.max(0, Math.min(posGap, cardGap) - safety);

    // Cap to a reasonable fraction of card height to avoid massive expansion
    let capped = Math.min(available, Math.floor(cardRect.height * 0.6));

    // set the container to not grow beyond the available space
    containerRef.current.style.maxHeight = `${capped}px`;

    // compute overflow for scrolling animation
    const descHeight = descriptionRef.current.scrollHeight;
    let containerHeight = containerRef.current.clientHeight;
    let overflow = Math.max(0, descHeight - containerHeight);

    // If content still overflows, apply a small pushback and reduce the cutoff to avoid touching the skills area
    const pushback = overflow > 0 ? 8 : 0; // px to push the divider/skills down
    if (pushback > 0) {
      const adjustedAvailable = Math.max(0, Math.min(posGap, cardGap) - safety - pushback);
      const newCapped = Math.min(adjustedAvailable, Math.floor(cardRect.height * 0.6));
      if (newCapped < capped) {
        capped = newCapped;
        containerRef.current.style.maxHeight = `${capped}px`;
        // recalc heights after applying the smaller cap
        containerHeight = containerRef.current.clientHeight;
        overflow = Math.max(0, descHeight - containerHeight);
      }
      if (dividerRef.current) {
        dividerRef.current.style.transform = `translateY(${pushback}px)`;
      }
    } else {
      if (dividerRef.current) dividerRef.current.style.transform = '';
    }

    setScrollAmount(overflow);
  };

  useEffect(() => {
    // initial calc
    recalc();

    // Resize observer to react to layout changes
    const ResizeObserverCtor = (window as any).ResizeObserver;
    const ro = ResizeObserverCtor ? new ResizeObserverCtor(() => recalc()) : null;
    if (ro) {
      if (containerRef.current) ro.observe(containerRef.current);
      if (descriptionRef.current) ro.observe(descriptionRef.current);
      if (skillsRef.current) ro.observe(skillsRef.current);
      if (dividerRef.current) ro.observe(dividerRef.current);
      if (titleRef.current) ro.observe(titleRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
    }

    // IntersectionObserver to run recalc when card becomes visible in viewport or face
    const ioCtor = (window as any).IntersectionObserver;
    let io: IntersectionObserver | null = null;
    if (ioCtor && cardRef.current) {
      io = new ioCtor((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) recalc();
        }
      }, { threshold: 0.15 });
      io.observe(cardRef.current);
    }

    const onResize = () => recalc();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
    };
  }, [description, descriptionRef, containerRef, isActiveFace]);

  // Ensure recalc runs when the face becomes active and schedule deferred recalcs to account for transform animation settling
  useEffect(() => {
    if (isActiveFace) {
      // run immediately and again after layout/animation settle
      recalc();
      requestAnimationFrame(() => recalc());
      const t1 = setTimeout(recalc, 80);
      const t2 = setTimeout(recalc, 240);
      return () => {
        clearTimeout(t1); clearTimeout(t2);
      };
    }
    // no-op when face deactivates
    return;
  }, [isActiveFace, description]);

  return (
    <motion.div
      ref={cardRef}
      className={`project-card group relative h-full min-h-[120px] sm:min-h-[240px] max-h-[260px] sm:max-h-[320px] w-full cursor-pointer overflow-hidden rounded-sm border transition-colors bg-transparent ${isActive ? 'border-primary/50' : 'border-white/10'} ${className ?? ""}`}
      data-active={isActive}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setActiveCardId && setActiveCardId(null)}
      onTouchStart={handleTouchOrClick}
      onClick={handleTouchOrClick}
      style={{ willChange: 'opacity, transform' }}
    >

      {/* Grid Overlay */}
      <div className="project-card-overlay absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Content Overlay */}
      <div className="project-card-content absolute inset-0 flex flex-col p-2.5 sm:p-6 pb-12 sm:pb-16 bg-linear-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
        
        {/* Header - Category bar with icons - Hidden on mobile, doesn't participate in space on mobile */}
        <div className="hidden sm:block w-full px-3 py-1.5 text-[7px] sm:text-[8px] uppercase tracking-widest border border-primary/30 text-primary bg-primary/20 rounded-sm translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-300 sm:flex justify-between items-center relative z-30 mb-auto">
          <span className="text-left">
            {category}
          </span>
          <div className="flex gap-2">
            <button className="p-1 hover:bg-white/10 rounded transition-colors text-white pointer-events-auto">
              <Github size={14} />
            </button>
            <button className="p-1 hover:bg-white/10 rounded transition-colors text-white pointer-events-auto">
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Footer info - anchored layout */}
        <div className="flex flex-col justify-between flex-1">
          <div className="pt-2 flex flex-col">
            <div className="relative flex flex-col">
              <h3 ref={titleRef} className={`text-[9px] sm:text-xl font-display font-bold mb-2 transition-colors leading-tight break-words line-clamp-2 relative z-20 pb-1 ${isActive ? 'text-primary' : 'text-white group-hover:text-primary'}`}>
                {title}
              </h3>
              <div ref={containerRef} className="relative overflow-hidden flex-1 min-h-0 z-10">
                {/* Top blur overlay during scrolling to indicate motion (only when actively scrolling) */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-0 right-0 top-0 h-6 sm:h-8 transition-opacity duration-300 backdrop-blur-sm ${isActive && scrollAmount > 0 ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0))' }}
                />

                <p 
                  ref={descriptionRef}
                  className="text-[8px] sm:text-xs text-gray-400 max-w-[90%] font-light h-full"
                  style={{
                    ['--scroll-amount' as any]: `${scrollAmount}px`,
                    animation: isActive ? 'scroll-boomerang-dynamic 8s ease-in-out infinite' : 'none'
                  }}
                >
                  {description}
                </p>

                {/* Fade overlay at bottom when content overflows to visually indicate cut-off */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-0 right-0 bottom-0 h-6 sm:h-8 transition-opacity duration-300 ${scrollAmount > 0 ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.6))' }}
                />
              </div>
            </div>
          </div>

          {/* Bottom-anchored skills */}
          <div className="absolute left-0 right-0 bottom-3 px-2.5 sm:px-6">
            <div ref={dividerRef} className={`h-px w-full transition-colors transition-transform duration-200 ${isActive ? 'bg-primary/50' : 'bg-white/20 group-hover:bg-primary/50'}`} />

            <div ref={skillsRef} className="mt-2 overflow-hidden max-h-[2em] sm:max-h-[2.5em]">
              <SkillsMarquee skills={tech} isActive={isActive} />
            </div> 
          </div>
        </div>
      </div>

      {/* Corners */}
      <div className={`project-card-corner absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 transition-colors duration-300 ${isActive ? 'border-primary' : 'border-primary/50'}`} />
      <div className={`project-card-corner absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 transition-colors duration-300 ${isActive ? 'border-primary' : 'border-primary/50'}`} />
      
      {/* Active glow effect */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-32 h-32 bg-primary/20 blur-2xl rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/20 blur-2xl rounded-full translate-x-1/2 translate-y-1/2" />
        </div>
      )}
    </motion.div>
  );
}
