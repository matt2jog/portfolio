import { GitCommit } from "lucide-react";

export interface Experience {
  id: string;
  role: string;
  company: string;
  duration: string;
  description: string;
  isActive?: boolean;
}

interface TimelineProps {
  experiences: Experience[];
}

export default function ExperienceTimeline({ experiences }: TimelineProps) {
  return (
    <div className="relative pl-6 md:pl-10 space-y-12 before:absolute before:inset-0 before:ml-6 md:before:ml-10 before:-translate-x-px md:before:-translate-x-px before:w-[1px] before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
      {experiences.map((exp, index) => (
        <div key={exp.id} className="relative group">
          {/* Node Icon */}
          <div className="absolute -left-6 md:-left-10 w-6 md:w-10 flex justify-center -translate-x-[50%] bg-background">
            <div
              className={`flex items-center justify-center p-[2px] rounded-full border bg-background transition-all duration-300
                ${
                  exp.isActive
                    ? "border-primary shadow-[0_0_10px_rgba(0,255,255,0.4)]"
                    : "border-white/20 group-hover:border-primary/50"
                }
              `}
            >
              <GitCommit
                size={16}
                className={
                  exp.isActive
                    ? "text-primary drop-shadow-[0_0_5px_rgba(0,255,255,0.8)]"
                    : "text-gray-500 group-hover:text-primary/70 transition-colors"
                }
              />
            </div>
          </div>

          {/* Content Box */}
          <div className="relative border border-white/5 bg-black/40 p-6 rounded-[4px] ml-4 transition-all duration-300 hover:border-white/20 hover:bg-black/60 group-hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-3 pointer-events-none opacity-20">
              <span className="font-mono text-xs text-white">[{index.toString().padStart(2, '0')}]</span>
            </div>
            
            <p className="font-mono text-xs text-primary mb-2 opacity-90">{exp.duration}</p>
            <h4 className="font-display font-bold text-lg text-white mb-1 tracking-tight">
              {exp.role}
            </h4>
            <h5 className="font-mono text-sm text-gray-400 mb-4 tracking-tight uppercase">
              // {exp.company}
            </h5>
            <p className="font-sans text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {exp.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
