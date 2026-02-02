import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { ArrowUpRight, Github, ExternalLink } from "lucide-react";
import blueprintImage from "@assets/generated_images/blueprint_wireframe_of_a_complex_software_architecture.png";

interface ProjectProps {
  title: string;
  category: string;
  description: string;
  tech: string[];
  image?: string; // Optional real image, defaults to blueprint
  className?: string;
}

export function BlueprintCard({ title, category, description, tech, image, className }: ProjectProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [scrollAmount, setScrollAmount] = useState(0);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (descriptionRef.current && containerRef.current) {
      const descHeight = descriptionRef.current.scrollHeight;
      const containerHeight = containerRef.current.clientHeight;
      const overflow = Math.max(0, descHeight - containerHeight);
      setScrollAmount(overflow);
    }
  };

  return (
    <motion.div
      className={`project-card group relative h-full min-h-[120px] sm:min-h-[240px] w-full cursor-pointer overflow-hidden rounded-sm border border-white/10 bg-black/40 ${className ?? ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        window.dispatchEvent(new CustomEvent('terminal-log', { 
          detail: { source: 'USR', message: `Project clicked: interest logged in [${title}]`, type: 'telemetry' } 
        }));
      }}
      whileHover={{ scale: 1.01 }}
    >
      {/* Background Layer: Blueprint (Default) */}
      <div 
        className="project-card-bg absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out opacity-100 mix-blend-screen grayscale contrast-125"
        style={{ backgroundImage: `url(${blueprintImage})` }}
      />
      
      {/* Background Layer: Real Image (Hover) - Simulating with Galaxy image for now if no image provided */}
      <div 
        className={`project-card-bg project-card-bg-hover absolute inset-0 bg-cover bg-center transition-opacity duration-500 ease-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          backgroundImage: image ? `url(${image})` : `url(${blueprintImage})`,
          filter: image ? 'none' : 'hue-rotate(90deg) contrast(1.2)' // Just to show a change if using same image
        }}
      />

      {/* Grid Overlay */}
      <div className="project-card-overlay absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Content Overlay */}
      <div className="project-card-content absolute inset-0 flex flex-col justify-between p-2.5 sm:p-6 bg-linear-to-t from-black/90 via-black/40 to-transparent">
        
        {/* Header - Category bar with icons */}
        <div className="w-full px-3 py-1.5 text-[7px] sm:text-[8px] uppercase tracking-widest border border-primary/30 text-primary bg-primary/10 backdrop-blur-sm rounded-sm translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 flex justify-between items-center relative z-30">
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
        <div className="space-y-2">
          <div className="relative">
            <h3 className="text-[11px] sm:text-2xl font-display font-bold text-white mb-2 group-hover:text-primary transition-colors leading-tight break-words line-clamp-2 -mt-2 sm:-mt-4 relative z-20 bg-gradient-to-b from-black/90 via-black/80 to-transparent pb-1">
              {title}
            </h3>
            <div ref={containerRef} className="relative overflow-hidden max-h-[3.6em] sm:max-h-[4.2em] z-10">
              <p 
                ref={descriptionRef}
                className="text-[8px] sm:text-xs text-gray-400 max-w-[90%] font-light"
                style={{
                  ['--scroll-amount' as any]: `${scrollAmount}px`,
                  animation: isHovered ? 'scroll-boomerang-dynamic 8s ease-in-out infinite' : 'none'
                }}
              >
                {description}
              </p>
            </div>
          </div>

          {/* Tech Stack - Reveal on Hover */}
          <div className="h-px w-full bg-white/20 group-hover:bg-primary/50 transition-colors" />
          
          <div className="flex flex-wrap gap-1 text-[6px] sm:text-[8px] font-mono text-gray-400">
            {tech.map((t, i) => (
              <span key={i} className="group-hover:text-white transition-colors">
                {`> ${t}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Corners */}
      <div className="project-card-corner absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary/50" />
      <div className="project-card-corner absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary/50" />
    </motion.div>
  );
}
