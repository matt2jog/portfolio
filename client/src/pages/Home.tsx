import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { BlueprintCard } from "@/components/BlueprintCard";
import galaxyImage from "@assets/generated_images/abstract_visualization_of_code_compiling_into_a_galaxy.png";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Home() {
  const projects = [
    {
      title: "Nebula Stream",
      category: "Infrastructure",
      description: "A distributed event streaming platform handling 1M+ OPS with sub-10ms latency. Built for high-throughput financial data pipelines.",
      tech: ["Rust", "Kafka", "gRPC", "Kubernetes"],
      image: galaxyImage
    },
    {
      title: "Synthetix AI",
      category: "Machine Learning",
      description: "Generative design engine for architectural layouts. Uses GANs to optimize floor plans based on light efficiency and flow constraints.",
      tech: ["Python", "PyTorch", "React", "WebGL"],
    },
    {
      title: "Void Cache",
      category: "Backend",
      description: "Zero-allocation caching layer for high-frequency trading systems. Optimized for L2/L3 cache locality.",
      tech: ["C++", "Assembly", "Redis Module"],
    },
    {
      title: "Cipher Mesh",
      category: "Security",
      description: "Decentralized identity verification protocol using zero-knowledge proofs. Privacy-first authentication layer.",
      tech: ["Solidity", "ZK-Snarks", "Node.js"],
    },
    {
      title: "Quantum Ledger",
      category: "FinTech",
      description: "Post-quantum cryptographic ledger for securing cross-border settlements against future compute threats.",
      tech: ["Haskell", "Cryptography", "Nix"],
    },
    {
      title: "Aether OS",
      category: "Kernel",
      description: "Microkernel designed for low-power edge devices with hard real-time constraints and formal verification.",
      tech: ["Zig", "ARM Assembly", "LLVM"],
    },
    {
      title: "Titan Mesh",
      category: "Networking",
      description: "Self-healing mesh network protocol for planetary-scale communications in low-connectivity environments.",
      tech: ["Go", "Protobuf", "WebRTC"],
    }
  ];

  const facesCount = 4;
  const projectsPerFace = 4;
  const totalGroups = Math.max(1, Math.ceil(projects.length / projectsPerFace));

  const [rotationStep, setRotationStep] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);

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
      <div className="scanline z-[100]" />
      
      {/* Background Glow */}
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full pointer-events-none z-0 mix-blend-screen" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-accent/10 blur-[100px] rounded-full pointer-events-none z-0 mix-blend-screen" />

      {/* Components */}
      <TerminalOverlay />
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
                     /root/projects <br/>
                     Listing directories... {projects.length} found. [Project Page {currentProjectPage}/{totalGroups}]
                   </p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={prevFace}
                    className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/40 backdrop-blur-sm group"
                  >
                    <ChevronLeft size={24} className="group-active:scale-90 transition-transform" />
                  </button>
                  <button 
                    onClick={nextFace}
                    className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/40 backdrop-blur-sm group"
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
                     <div className="project-face-grid grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-full min-h-0">
                       {Array.from({ length: projectsPerFace }, (_, projectIndex) => {
                         const project = faceProjects[projectIndex];
                         return project ? (
                           <BlueprintCard
                             key={`${faceIndex}-${projectIndex}-${project.title}`}
                             {...project}
                             className={`min-h-0 ${faceIndex === rotationIndex ? "" : "project-card--inactive"}`}
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

        {/* About / Skills Section with Galaxy BG */}
        <section id="about" className="py-32 relative overflow-hidden flex items-center">
           {/* Parallax Background */}
           <div className="absolute inset-0 z-0">
              <img 
                src={galaxyImage} 
                alt="Code Galaxy" 
                className="w-full h-full object-cover opacity-30 mix-blend-screen scale-110" 
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
           </div>

           <div className="relative z-10 px-6 md:px-20 w-full max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                 <div className="space-y-8 backdrop-blur-sm bg-black/30 p-8 border border-white/10 rounded-lg">
                    <h2 className="text-3xl font-display font-bold text-white">THE KERNEL</h2>
                    <p className="text-gray-300 leading-relaxed text-lg">
                       I don't just write code; I engineer systems. My approach is rooted in first principles thinking—breaking down complex problems into their fundamental components and rebuilding them for efficiency, scalability, and resilience.
                    </p>
                    <p className="text-gray-400 font-light">
                       Currently exploring distributed systems consensus algorithms and high-performance graphics programming.
                    </p>
                    
                    <div className="pt-4">
                       <h3 className="font-mono text-primary text-xs tracking-widest mb-4">CORE_DEPENDENCIES</h3>
                       <div className="flex flex-wrap gap-2">
                          {["Rust", "TypeScript", "Go", "Docker", "Kubernetes", "AWS", "Terraform", "PostgreSQL"].map(skill => (
                             <span key={skill} className="px-3 py-1 bg-white/5 border border-white/10 text-xs font-mono text-gray-300 hover:bg-white/10 transition-colors cursor-default">
                                {skill}
                             </span>
                          ))}
                       </div>
                    </div>
                 </div>
                 
                 {/* Visual Decorator / Headshot */}
                 <div className="hidden md:flex justify-center items-center">
                    <div className="relative w-72 h-72 border border-primary/30 rounded-full flex items-center justify-center">
                       <div className="absolute inset-0 border border-dashed border-white/20 rounded-full animate-[spin_30s_linear_infinite]" />
                       <div className="absolute inset-4 border border-primary/10 rounded-full" />
                       <div className="relative w-56 h-56 rounded-full overflow-hidden border border-primary/20 bg-black/50 z-10 shadow-[0_0_50px_rgba(0,255,255,0.15)]">
                          <img 
                            src="/src/assets/images/headshot.jpg" 
                            alt="Engineer Headshot" 
                            className="w-full h-full object-cover contrast-110 brightness-105 scale-105"
                          />
                          <div className="absolute inset-0 bg-primary/5 mix-blend-overlay pointer-events-none" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                       </div>
                       <div className="absolute -bottom-2 bg-black px-4 py-1 border border-primary/30 z-20 shadow-lg shadow-primary/10">
                          <span className="font-mono text-[9px] text-primary tracking-[0.2em] font-bold animate-pulse uppercase">Core_Identity</span>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* Footer / Contact */}
        <footer id="contact" className="py-20 border-t border-white/10 bg-black text-center">
           <h2 className="text-2xl font-display font-bold text-white mb-8">INITIALIZE HANDSHAKE</h2>
           <div className="flex justify-center gap-8 mb-12">
              <a href="#" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">EMAIL</a>
              <a href="#" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">LINKEDIN</a>
              <a href="#" className="text-gray-400 hover:text-primary transition-colors font-mono text-sm underline underline-offset-4">GITHUB</a>
           </div>
           <div className="text-gray-600 text-xs font-mono">
              SYSTEM.ENG © 2026. ALL RIGHTS RESERVED. <br />
              <span className="text-gray-700">Latency: 12ms // Status: Stable</span>
           </div>
        </footer>
      </main>
    </div>
  );
}
