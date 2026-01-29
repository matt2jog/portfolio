import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowUpRight, Github, ExternalLink } from "lucide-react";
import blueprintImage from "@assets/generated_images/blueprint_wireframe_of_a_complex_software_architecture.png";

interface ProjectProps {
  title: string;
  category: string;
  description: string;
  tech: string[];
  image?: string; // Optional real image, defaults to blueprint
}

export function BlueprintCard({ title, category, description, tech, image }: ProjectProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="group relative h-[400px] w-full cursor-pointer overflow-hidden rounded-sm border border-white/10 bg-black/40"
      onMouseEnter={() => setIsHovered(true)}
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
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out opacity-100 mix-blend-screen grayscale contrast-125"
        style={{ backgroundImage: `url(${blueprintImage})` }}
      />
      
      {/* Background Layer: Real Image (Hover) - Simulating with Galaxy image for now if no image provided */}
      <div 
        className={`absolute inset-0 bg-cover bg-center transition-opacity duration-500 ease-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          backgroundImage: image ? `url(${image})` : `url(${blueprintImage})`,
          filter: image ? 'none' : 'hue-rotate(90deg) contrast(1.2)' // Just to show a change if using same image
        }}
      />

      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Content Overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-6 bg-linear-to-t from-black/90 via-black/40 to-transparent">
        
        {/* Header */}
        <div className="flex justify-between items-start translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <span className="px-2 py-1 text-[10px] uppercase tracking-widest border border-primary/30 text-primary bg-primary/10 backdrop-blur-sm rounded-sm">
            {category}
          </span>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
              <Github size={18} />
            </button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
              <ExternalLink size={18} />
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-display font-bold text-white mb-1 group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-gray-400 line-clamp-2 max-w-[90%] font-light">
              {description}
            </p>
          </div>

          {/* Tech Stack - Reveal on Hover */}
          <div className="h-[1px] w-full bg-white/20 group-hover:bg-primary/50 transition-colors" />
          
          <div className="flex flex-wrap gap-2 text-xs font-mono text-gray-400">
            {tech.map((t, i) => (
              <span key={i} className="group-hover:text-white transition-colors">
                {`> ${t}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary/50" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary/50" />
    </motion.div>
  );
}
