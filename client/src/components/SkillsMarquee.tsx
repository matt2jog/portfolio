import React from 'react';

interface SkillsMarqueeProps {
  skills: string[];
  className?: string;
}

const SkillsMarquee = ({ skills, className }: SkillsMarqueeProps) => {
  const duplicatedSkills = [...skills, ...skills, ...skills, ...skills];

  return (
    <div className={`w-full overflow-hidden ${className ?? ""}`}>
      <div className="animate-marquee flex w-max">
        {[...Array(2)].map((_, setIndex) => (
          <div 
            key={setIndex} 
            className="flex items-center gap-4 pr-4"
            aria-hidden={setIndex === 1 ? "true" : undefined}
          >
            {duplicatedSkills.map((skill, index) => (
              <div
                key={`${setIndex}-${index}`}
                className="flex items-center gap-2 text-gray-400 group-hover:text-white transition-colors"
              >
                <span className="text-[7.5px] sm:text-[10px] font-mono tracking-tight whitespace-nowrap italic">
                  {skill}
                </span>
                <span className="text-gray-600 select-none text-[7.5px] sm:text-[10px]">•</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 60s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default SkillsMarquee;
