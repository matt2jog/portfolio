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

  useEffect(() => {
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
      const capped = Math.min(available, Math.floor(cardRect.height * 0.6));

      // set the container to not grow beyond the available space
      containerRef.current.style.maxHeight = `${capped}px`;

      // compute overflow for scrolling animation
      const descHeight = descriptionRef.current.scrollHeight;
      const containerHeight = containerRef.current.clientHeight;
      const overflow = Math.max(0, descHeight - containerHeight);
      setScrollAmount(overflow);
    };

    // initial calc
    recalc();

    // Resize observer to react to layout changes
    const ResizeObserverCtor = (window as any).ResizeObserver;
    const ro = ResizeObserverCtor ? new ResizeObserverCtor((entries: any[]) => {
      recalc();
    }) : null;
    if (ro) {
      if (containerRef.current) ro.observe(containerRef.current);
      if (descriptionRef.current) ro.observe(descriptionRef.current);
      if (skillsRef.current) ro.observe(skillsRef.current);
      if (titleRef.current) ro.observe(titleRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
    }

    const onResize = () => recalc();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [description, descriptionRef, containerRef, isActive]);

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
      <div className="project-card-content absolute inset-0 flex flex-col p-2.5 sm:p-6 pb-12 sm:pb-16 bg-linear-to-t from-black/90 via-black/40 to-transparent">
        
        {/* Header - Category bar with icons - Hidden on mobile, doesn't participate in space on mobile */}
        <div className="hidden sm:block w-full px-3 py-1.5 text-[7px] sm:text-[8px] uppercase tracking-widest border border-primary/30 text-primary bg-primary/20 rounded-sm translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 sm:flex justify-between items-center relative z-30 mb-auto">
          <span className="text-left">
            {category}
          </span>
          <div className="flex gap-2">
            <button className="p-1 hover:bg-white/10 rounded transition-colors text-white">
              <Github size={14} />
            </button>
            <button className="p-1 hover:bg-white/10 rounded transition-colors text-white">
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
              </div>
            </div>
          </div>

          {/* Bottom-anchored skills */}
          <div className="absolute left-0 right-0 bottom-3 px-2.5 sm:px-6">
            <div className={`h-px w-full transition-colors ${isActive ? 'bg-primary/50' : 'bg-white/20 group-hover:bg-primary/50'}`} />

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
