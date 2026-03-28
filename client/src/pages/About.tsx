import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { usePersonalInformation } from "@/hooks/use-personal-information";
import { useExperience } from "@/hooks/use-experience";
import Footer from "@/components/Footer";
import BusinessCard from "@/components/BusinessCard";
import ExperienceTimeline from "@/components/ExperienceTimeline";
import { ChevronRight, ChevronLeft } from "lucide-react";

export default function About() {
  const [isOpen, setIsOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>(0);
  const { data: info } = usePersonalInformation();

  useEffect(() => {
    if (!cardRef.current) return;
    const measure = () => {
      if (cardRef.current) {
        setCardHeight(cardRef.current.getBoundingClientRect().height);
      }
    };
    const observer = new ResizeObserver(() => measure());
    observer.observe(cardRef.current);
    measure();
    return () => observer.disconnect();
  }, []);

  const { data: dbExperiences } = useExperience();

  const mockExperiences = [
    {
      id: "1",
      role: "Lead Software Engineer",
      company: "Tech Corp",
      duration: "2022 - Present",
      description: "Led development of scalable microservices and implemented CI/CD pipelines. Mentored junior developers and established code quality standards across the engineering department.",
      technologies: ["React", "Node.js", "Docker", "AWS"],
      isActive: true
    },
    {
      id: "2",
      role: "Senior Frontend Developer",
      company: "Design Studio",
      duration: "2020 - 2022",
      description: "Architected modern frontend applications focusing on performance and accessible UI/UX. Collaborated closely with design team to implement pixel-perfect user interfaces.",
      technologies: ["TypeScript", "Next.js", "Tailwind CSS"],
    },
    {
      id: "3",
      role: "Full Stack Engineer",
      company: "Startup Inc",
      duration: "2018 - 2020",
      description: "Built end-to-end features for a fast-growing SaaS platform. Integrated third-party APIs and optimized database queries for improved performance.",
      technologies: ["Vue.js", "Python", "PostgreSQL"],
    }
  ];

  const safeExperiences = dbExperiences && dbExperiences.length > 0
    ? dbExperiences.map(exp => ({
      ...exp,
      role: `${exp.role} | ${exp.location}`,
    }))
    : mockExperiences;

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

        {/* Hero: Card + Unfolding Summary */}
        <div className="flex justify-center w-full">
          <div className="flex items-stretch">

            {/* The Business Card (always visible, clickable) */}
            <div
              ref={cardRef}
              className="relative z-20 flex-shrink-0 cursor-pointer select-none"
              onClick={() => setIsOpen(prev => !prev)}
            >
              <BusinessCard isOpen={isOpen} />

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

            {/* Unfolding Summary Panel — height matched to card via ref */}
            <div
              className={`
                overflow-hidden
                transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                ${isOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}
              `}
              style={{ height: cardHeight > 0 ? `${cardHeight}px` : undefined }}
            >
              <div className="w-[420px] h-full">
                <div
                  className={`
                    h-full bg-[#0F0F12]
                    border border-white/10 border-l-0
                    rounded-r-lg rounded-l-none
                    p-8 md:p-10
                    relative overflow-y-auto
                    flex flex-col justify-center
                    transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                    ${isOpen ? 'translate-x-0' : '-translate-x-8'}
                  `}
                >
                  {/* Accent bar on left seam */}
                  <div className="absolute top-0 left-0 w-[1px] h-full bg-gradient-to-b from-[#00FFFF]/20 via-[#00FFFF]/10 to-transparent" />

                  <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-[#00FFFF] mb-6 opacity-90">
                    Professional Summary
                  </h2>

                  <div className="font-sans text-sm leading-8 text-gray-300 space-y-5">
                    {info?.shortBio?.split('\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    )) || (
                        <p>Loading summary...</p>
                      )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Experience Timeline */}
        <div className="w-full">
          <ExperienceTimeline experiences={safeExperiences} />
        </div>

      </main>

      <Footer />
    </div>
  );
}
