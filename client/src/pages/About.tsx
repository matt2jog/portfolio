import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import BusinessCard from "@/components/BusinessCard";
import ExperienceTimeline from "@/components/ExperienceTimeline";
import { ChevronRight, ChevronLeft } from "lucide-react";

export default function About() {
  const [isOpen, setIsOpen] = useState(false);

  const experiences = [
    {
      id: "1",
      role: "Lead Software Engineer",
      company: "Tech Corp",
      duration: "2022 - Present",
      description: "Led development of scalable microservices and implemented CI/CD pipelines.",
      technologies: ["React", "Node.js", "Docker", "AWS"]
    },
    {
      id: "2",
      role: "Full Stack Developer",
      company: "Innovation Labs",
      duration: "2019 - 2022",
      description: "Developed and maintained multiple enterprise-level web applications.",
      technologies: ["TypeScript", "Next.js", "PostgreSQL", "Redis"]
    },
    {
      id: "3",
      role: "Frontend Engineer",
      company: "Digital Solutions Inc",
      duration: "2017 - 2019",
      description: "Created responsive and highly interactive user interfaces.",
      technologies: ["JavaScript", "React", "CSS3", "Redux"]
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-gray-100 font-sans selection:bg-[#00FFFF]/30 relative">
      
      {/* Background Grid Pattern */}
      <div 
        className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex flex-col gap-16">
        
        {/* Header Section */}
        <div className="w-full">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            About
          </h1>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#00FFFF]/50 to-transparent opacity-40" />
        </div>

        {/* Hero: Card + Unfolding Summary */}
        <div className="flex justify-center w-full">
          <div className="relative flex items-stretch">
            
            {/* The Business Card (always visible, clickable) */}
            <div 
              className="relative z-20 flex-shrink-0 cursor-pointer select-none"
              onClick={() => setIsOpen(prev => !prev)}
            >
              <BusinessCard />

              {/* Hint icon on right edge */}
              <div 
                className={`
                  absolute top-1/2 -translate-y-1/2 -right-3 z-30
                  w-6 h-6 rounded-full 
                  bg-[#0B0C10] border border-white/20
                  flex items-center justify-center
                  transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                  hover:border-[#00FFFF]/60 hover:shadow-[0_0_12px_rgba(0,255,255,0.3)]
                  ${isOpen ? 'opacity-70' : 'opacity-100 animate-pulse'}
                `}
              >
                {isOpen 
                  ? <ChevronLeft size={12} className="text-[#00FFFF]" />
                  : <ChevronRight size={12} className="text-[#00FFFF]" />
                }
              </div>
            </div>

            {/* Unfolding Summary Panel */}
            <div
              className={`
                relative z-10 overflow-hidden
                transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                ${isOpen ? 'w-[420px] opacity-100 ml-0' : 'w-0 opacity-0 ml-0'}
              `}
            >
              {/* Inner content with fixed width so text doesn't reflow during animation */}
              <div className="w-[420px] h-full">
                <div 
                  className={`
                    h-full bg-[#0F0F12] border border-white/10 border-l-0
                    rounded-r-lg p-8 md:p-10
                    relative overflow-hidden
                    flex flex-col justify-center
                    transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                    ${isOpen ? 'translate-x-0' : '-translate-x-8'}
                  `}
                >
                  {/* Accent bar */}
                  <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-[#00FFFF]/40 via-[#00FFFF]/20 to-transparent" />
                  
                  <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-[#00FFFF] mb-6 opacity-90">
                    Professional Summary
                  </h2>
                  
                  <div className="font-sans text-sm leading-8 text-gray-300 space-y-5">
                    <p>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    </p>
                    <p>
                      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Experience Timeline */}
        <div className="w-full">
          <h3 className="font-display text-2xl font-semibold mb-10 text-white flex items-center tracking-tight">
            Experience
          </h3>
          <ExperienceTimeline experiences={experiences} />
        </div>

      </main>

      <Footer />
    </div>
  );
}
