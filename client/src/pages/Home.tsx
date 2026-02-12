import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { BlueprintCard } from "@/components/BlueprintCard";
// Cubes and headshot moved to About page
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Home() {
  // Mobile detection based on screen size (user-agent temporarily disabled for testing)
  const isMobile = window.innerWidth < 768;
  
  const fallbackProjects = [
    {
      title: "Nebula Stream",
      description: "A distributed event streaming platform handling 1M+ OPS with sub-10ms latency. Built for high-throughput financial data pipelines.",
      tech: ["Rust", "Kafka", "gRPC", "Kubernetes"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Synthetix AI",
      description: "Generative design engine for architectural layouts. Uses GANs to optimize floor plans based on light efficiency and flow constraints.",
      tech: ["Python", "PyTorch", "React", "WebGL"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Void Cache",
      description: "Zero-allocation caching layer for high-frequency trading systems. Optimized for L2/L3 cache locality.",
      tech: ["C++", "Assembly", "Redis Module"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Cipher Mesh",
      description: "Decentralized identity verification protocol using zero-knowledge proofs. Privacy-first authentication layer.",
      tech: ["Solidity", "ZK-Snarks", "Node.js"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Quantum Ledger",
      description: "Post-quantum cryptographic ledger for securing cross-border settlements against future compute threats.",
      tech: ["Haskell", "Cryptography", "Nix"],
      githubUrl: null,
      deployedUrl: null,
    },
    {
      title: "Aether OS",
      description: "Microkernel designed for low-power edge devices with hard real-time constraints and formal verification.",
      tech: ["Zig", "ARM Assembly", "LLVM"],
      githubUrl: null,
      deployedUrl: null,
    },
    {
      title: "Titan Mesh",
      description: "Self-healing mesh network protocol for planetary-scale communications in low-connectivity environments.",
      tech: ["Go", "Protobuf", "WebRTC"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: "https://example.com",
    }
  ];

  const projectsQuery = useQuery({ queryKey: ["/api/public/projects"] });

  const projects =
    Array.isArray(projectsQuery.data) && projectsQuery.data.length > 0
      ? projectsQuery.data
      : fallbackProjects;

  // bio and skills moved to About page

  const facesCount = 4;
  const projectsPerFace = 4;
  const totalGroups = Math.max(1, Math.ceil(projects.length / projectsPerFace));

  const [rotationStep, setRotationStep] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const rotationIndex = ((rotationStep % facesCount) + facesCount) % facesCount;

  const groups = useMemo(() => {
    const chunks = [] as typeof projects[];
    for (let i = 0; i < projects.length; i += projectsPerFace) {
      chunks.push(projects.slice(i, i + projectsPerFace));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [projects, projectsPerFace]);

  const cubeGroups = useMemo(() => {
    return Array.from({ length: facesCount }, (_, faceIndex) => {
      const offset = (faceIndex - rotationIndex + facesCount) % facesCount;
      const index = (groupIndex + offset) % totalGroups;
      const group = groups[index] ?? [];
      return group;
    });
  }, [facesCount, rotationIndex, groupIndex, totalGroups, groups]);

  const currentProjectPage = Math.min(totalGroups, groupIndex + 1);

  const totalFaces = cubeGroups.length;

  const nextFace = () => {
    setRotationStep((prev) => prev + 1);
    setGroupIndex((prev) => (prev + 1) % totalGroups);
  };

  const prevFace = () => {
    setRotationStep((prev) => prev - 1);
    setGroupIndex((prev) => (prev - 1 + totalGroups) % totalGroups);
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary/30">
      {/* Global Background Elements */}
      <div className="fixed inset-0 grid-pattern opacity-[0.15] pointer-events-none z-0" />
      
      {/* Background Glow */}
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-primary/5 blur-[80px] rounded-full pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-accent/5 blur-[60px] rounded-full pointer-events-none z-0" />

      {/* Components */}
      {!isMobile && <TerminalOverlay />}
      <Navbar />
      
      <main className="relative z-10">
        <Hero />

        {/* Projects Section */}
        <section id="projects" className="min-h-screen py-20 md:py-24 px-6 md:px-20 relative border-t border-white/5 bg-black/20">
          <div className="max-w-7xl mx-auto">
             <div className="flex items-end justify-between mb-[calc(var(--spacing)*30)]">
                <div>
                   <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">DEPLOYED <br /><span className="text-gray-500">MODULES</span></h2>
                   <p className="text-gray-400 font-mono text-sm max-w-md">
                     Listing directories... {projects.length} found. [Project Page {currentProjectPage}/{totalGroups}]
                   </p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={prevFace}
                    className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                  >
                    <ChevronLeft size={24} className="group-active:scale-90 transition-transform" />
                  </button>
                  <button 
                    onClick={nextFace}
                    className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                  >
                    <ChevronRight size={24} className="group-active:scale-90 transition-transform" />
                  </button>
                </div>
             </div>

             <div className="project-cube-scene mx-auto mb-20">
               <div
                 className="project-cube"
                 style={{ transform: `rotateX(5deg) rotateY(${12 + rotationStep * -90}deg)` }}
               >
                 {cubeGroups.map((faceProjects, faceIndex) => (
                   <div
                     key={faceIndex}
                     className={`project-cube-face project-cube-face--${faceIndex + 1}`}
                   >
                     <span className="project-cube-pulse" aria-hidden="true" />
                      <div className="project-face-grid grid grid-cols-2 gap-2 sm:gap-4 md:gap-6 w-full h-full min-h-0 p-2 sm:p-4">
                       {Array.from({ length: projectsPerFace }, (_, projectIndex) => {
                         const project = faceProjects[projectIndex];
                         return project ? (
                           <BlueprintCard
                             key={`${faceIndex}-${projectIndex}-${project.title}`}
                             {...project}
                             className={`min-h-0 ${faceIndex === rotationIndex ? "" : "project-card--inactive"}`}
                             activeCardId={activeCardId}
                             setActiveCardId={faceIndex === rotationIndex ? setActiveCardId : undefined}
                             isActiveFace={faceIndex === rotationIndex}
                           />
                         ) : (
                           <div
                             key={`${faceIndex}-${projectIndex}-placeholder`}
                             className="project-card-placeholder"
                           />
                         );
                       })}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        </section>

          {/* About section moved to /about */}

        {/* Footer / Contact */}
        <footer id="contact" className="py-20 border-t border-white/10 bg-black text-center">
           <h2 className="text-2xl font-display font-bold text-white mb-8">INITIALIZE HANDSHAKE</h2>
           <div className="flex justify-center gap-8 mb-12">
              <a href="mailto:matthew@2jog.dev" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">EMAIL</a>
              <a href="https://linkedin.com/in/matthewtujague" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">LINKEDIN</a>
              <a href="https://github.com/binimal101" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">GITHUB</a>
           </div>
           <div className="text-gray-600 text-xs font-mono">
              Matthew Tujague © 2026. ALL RIGHTS RESERVED. <br />
           </div>
        </footer>
      </main>
    </div>
  );
}
