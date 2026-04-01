import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { usePersonalInformation } from "@/hooks/use-personal-information";
import { useExperience } from "@/hooks/use-experience";
import Footer from "@/components/Footer";
import BusinessCard from "@/components/BusinessCard";
import ExperienceTimeline from "@/components/ExperienceTimeline";

export default function About() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: info } = usePersonalInformation();
  const { data: dbExperiences } = useExperience();

  const mockExperiences = [
    {
      id: "1",
      role: "Lead Software Engineer",
      company: "Tech Corp",
      location: "Remote",
      duration: "2022 - Present",
      description: "Led development of scalable microservices and implemented CI/CD pipelines. Mentored junior developers and established code quality standards across the engineering department.",
      technologies: ["React", "Node.js", "Docker", "AWS"],
      isActive: true,
      position: 0,
    },
    {
      id: "2",
      role: "Senior Frontend Developer",
      company: "Design Studio",
      location: "New York, NY",
      duration: "2020 - 2022",
      description: "Architected modern frontend applications focusing on performance and accessible UI/UX. Collaborated closely with design team to implement pixel-perfect user interfaces.",
      technologies: ["TypeScript", "Next.js", "Tailwind CSS"],
      isActive: false,
      position: 1,
    },
    {
      id: "3",
      role: "Full Stack Engineer",
      company: "Startup Inc",
      location: "Austin, TX",
      duration: "2018 - 2020",
      description: "Built end-to-end features for a fast-growing SaaS platform. Integrated third-party APIs and optimized database queries for improved performance.",
      technologies: ["Vue.js", "Python", "PostgreSQL"],
      isActive: false,
      position: 2,
    }
  ];

  const safeExperiences = dbExperiences && dbExperiences.length > 0
    ? dbExperiences.map(exp => ({
      ...exp,
      role: `${exp.role} | ${exp.location}`,
    }))
    : mockExperiences;

  return (
    <div className="min-h-screen bg-background text-gray-100 font-sans selection:bg-[#00FFFF]/30 relative">

      {/* Dithered background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 system-grid opacity-70" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 520px at 15% 15%, hsl(var(--primary)/.12), transparent 55%), radial-gradient(760px 420px at 95% 30%, hsl(var(--accent)/.14), transparent 55%), radial-gradient(900px 700px at 50% 100%, hsl(var(--primary)/.05), transparent 55%)",
          }}
        />
        <div className="absolute inset-0 system-noise" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex flex-col gap-16">

        {/* Hero: Flippable Business Card */}
        <div className="flex flex-col items-center w-full relative z-20">
          <div
            className={`
              relative flex-shrink-0 cursor-pointer select-none
              transition-all ease-[cubic-bezier(0.23,1,0.32,1)]
              w-[340px] h-[640px] mx-auto
              duration-[1200ms]
              ${isOpen ? 'md:w-[760px]' : ''}
            `}
            onClick={() => setIsOpen(prev => !prev)}
          >
            <BusinessCard isOpen={isOpen} />
          </div>

          <div
            aria-hidden="true"
            className="mt-8 flex flex-col items-center gap-3 text-[10px] font-medium uppercase tracking-[0.38em] text-cyan-100/65"
          >
            <span>More Below</span>
            <div className="relative flex h-14 w-10 items-start justify-center overflow-hidden">
              <div className="absolute top-0 h-7 w-px bg-gradient-to-b from-cyan-300/0 via-cyan-200/85 to-cyan-200/20 animate-pulse" />
              <div className="mt-5 flex flex-col items-center animate-bounce">
                <span className="h-3 w-3 rotate-45 border-b border-r border-cyan-200/90" />
                <span className="-mt-1 h-3 w-3 rotate-45 border-b border-r border-cyan-200/55" />
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
