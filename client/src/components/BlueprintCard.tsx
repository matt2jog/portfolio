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
}

export function BlueprintCard({ title, category, description, tech, image, className, activeCardId, setActiveCardId, id }: ProjectProps) {
  const cardId = id || `card-${title.replace(/\s+/g, '-')}`;
  const isActive = activeCardId === cardId;
  const [scrollAmount, setScrollAmount] = useState(0);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <motion.div
      className={`project-card group relative h-full min-h-[120px] sm:min-h-[240px] w-full cursor-pointer overflow-hidden rounded-sm border border-white/10 bg-black/40 ${className ?? ""}`}
      data-active={isActive}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setActiveCardId && setActiveCardId(null)}
      onTouchStart={handleTouchOrClick}
      onClick={handleTouchOrClick}
      whileHover={{ scale: 1.01 }}
    >
      {/* Background Layer: Blueprint (Default) */}
      <div 
        className="project-card-bg absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out opacity-100 mix-blend-screen grayscale contrast-125"
        style={{ backgroundImage: `url(${blueprintImage})` }}
      />
      
      {/* Background Layer: Real Image (Hover) - Simulating with Galaxy image for now if no image provided */}
      <div 
        className={`project-card-bg project-card-bg-hover absolute inset-0 bg-cover bg-center transition-opacity duration-500 ease-out ${isActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          backgroundImage: image ? `url(${image})` : `url(${blueprintImage})`,
          filter: image ? 'none' : 'hue-rotate(90deg) contrast(1.2)' // Just to show a change if using same image
        }}
      />

      {/* Grid Overlay */}
      <div className="project-card-overlay absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Content Overlay */}
      <div className="project-card-content absolute inset-0 flex flex-col p-2.5 sm:p-6 bg-linear-to-t from-black/90 via-black/40 to-transparent">
        
        {/* Header - Category bar with icons - Hidden on mobile, doesn't participate in space on mobile */}
        <div className="hidden sm:block w-full px-3 py-1.5 text-[7px] sm:text-[8px] uppercase tracking-widest border border-primary/30 text-primary bg-primary/10 backdrop-blur-sm rounded-sm translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 sm:flex justify-between items-center relative z-30 mb-auto">
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

        {/* Footer info */}
        <div className="space-y-2 mt-auto sm:mt-auto">
          <div className="relative">
            <h3 className={`text-[11px] sm:text-2xl font-display font-bold mb-2 transition-colors leading-tight break-words line-clamp-2 relative z-20 bg-gradient-to-b from-black/90 via-black/80 to-transparent pb-1 ${isActive ? 'text-primary' : 'text-white group-hover:text-primary'}`}>
              {title}
            </h3>
            <div ref={containerRef} className="relative overflow-hidden max-h-[3.6em] sm:max-h-[4.2em] z-10">
              <p 
                ref={descriptionRef}
                className="text-[8px] sm:text-xs text-gray-400 max-w-[90%] font-light"
                style={{
                  ['--scroll-amount' as any]: `${scrollAmount}px`,
                  animation: isActive ? 'scroll-boomerang-dynamic 8s ease-in-out infinite' : 'none'
                }}
              >
                {description}
              </p>
            </div>
          </div>

          {/* Tech Stack - Reveal on Hover */}
          <div className={`h-px w-full transition-colors flex-shrink-0 ${isActive ? 'bg-primary/50' : 'bg-white/20 group-hover:bg-primary/50'}`} />
          
          <div className="relative overflow-hidden max-h-[2em] sm:max-h-[2.5em] flex-shrink-0">
            <SkillsMarquee skills={tech} isActive={isActive} />
          </div>
        </div>
      </div>

      {/* Corners */}
      <div className="project-card-corner absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary/50" />
      <div className="project-card-corner absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary/50" />
    </motion.div>
  );
}
