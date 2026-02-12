import { Navbar } from "@/components/Navbar";
import Cubes from "@/components/Cubes";
import headshotImage from "@/assets/images/headshot.jpg";
import { useQuery } from "@tanstack/react-query";

export default function About() {
  const bioQuery = useQuery({ queryKey: ["/api/public/bio"] });
  const skillsQuery = useQuery({ queryKey: ["/api/public/skills"] });

  const bio: { headline: string; description: string; paragraph: string } = (bioQuery.data as any) || {
    headline: "MATTHEW TUJAGUE",
    description:
      "I don't just write code; I engineer systems. My approach is rooted in first principles thinking—breaking down complex problems into their fundamental components and rebuilding them for efficiency, scalability, and resilience.",
    paragraph:
      "Currently exploring distributed systems consensus algorithms and high-performance graphics programming.",
  };

  const skills =
    Array.isArray(skillsQuery.data) && skillsQuery.data.length > 0
      ? skillsQuery.data
      : [
          "Rust",
          "TypeScript",
          "Go",
          "Docker",
          "Kubernetes",
          "AWS",
          "Terraform",
          "PostgreSQL",
        ].map((label) => ({ label }));

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main className="relative z-10">
        <section id="about" className="py-32 relative overflow-hidden flex items-center bg-black/20 border-t border-white/5">
          <div className="relative z-10 px-6 md:px-20 w-full max-w-7xl mx-auto">
            <div className="flex flex-col items-center">
              <div className="relative bg-black/40 p-12 md:p-16 border border-white/10 rounded-lg overflow-hidden w-full max-w-5xl text-center min-h-[520px] flex flex-col">
                <div className="absolute -inset-12 opacity-80 pointer-events-auto overflow-hidden">
                  <Cubes
                    gridSize={isMobile ? 5 : 9}
                    maxAngle={30}
                    radius={2}
                    cellGap={2}
                    borderStyle="1.5px solid rgba(255,255,255,0.18)"
                    faceColor="#0a0a12"
                    hoverBorderColor="rgba(255,255,255,0.75)"
                    rippleColor="#c17bbf"
                    rippleSpeed={1.5}
                    autoAnimate={!isMobile}
                    autoAnimateSpeed={0.05}
                    autoAnimatePause={1400}
                    rippleOnClick={false}
                  />
                </div>
                <div className="absolute -inset-8 bg-black/20 pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row-reverse md:items-start md:justify-between gap-6 pointer-events-none">
                  <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-2xl overflow-hidden border border-primary/20 bg-black/60 shadow-[0_0_30px_rgba(0,255,255,0.12)] mx-auto md:mx-0 md:ml-10 md:shrink-0 opacity-90">
                    <img src={headshotImage} alt="Engineer Headshot" className="w-full h-full object-cover contrast-110 brightness-105 scale-105" />
                    <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  </div>
                  <div className="flex-1 text-left">
                    <h2 className="text-3xl font-display font-bold text-white mb-2">{bio.headline || "MATTHEW TUJAGUE"}</h2>
                    <p className="text-gray-300 leading-relaxed text-lg mb-3 whitespace-pre-line">{bio.paragraph}</p>
                    <p className="text-gray-400 font-light whitespace-pre-line">{bio.description}</p>
                  </div>
                </div>

                <div className="relative z-10 mt-auto pt-8 flex flex-col items-center pointer-events-none">
                  <h3 className="font-mono text-primary text-xs tracking-widest mb-4 pointer-events-none">CORE_DEPENDENCIES</h3>
                  <div className="flex flex-wrap gap-2 pointer-events-none">
                    {skills.map((skill: any) => (
                      <span key={skill.id ?? skill.label} className="px-3 py-1 bg-white/5 border border-white/10 text-xs font-mono text-gray-300 pointer-events-none">
                        {skill.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
