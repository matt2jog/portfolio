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

        {/* Hero: Flippable Business Card */}
        <div className="flex justify-center w-full relative z-20">
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
