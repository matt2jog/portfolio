import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { BlueprintCard } from "@/components/BlueprintCard";
import Cubes from "@/components/Cubes";
import FuzzyText from "@/components/FuzzyText";
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
                     <span className="project-cube-pulse" aria-hidden="true" />
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

          {/* About / Skills Section */}
          <section id="about" className="py-32 relative overflow-hidden flex items-center">
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-background via-transparent to-background" />

           <div className="relative z-10 px-6 md:px-20 w-full max-w-7xl mx-auto">
              <div className="flex flex-col items-center">
                  <div className="relative space-y-8 backdrop-blur-sm bg-black/30 p-10 md:p-12 border border-white/10 rounded-lg overflow-hidden w-full max-w-4xl text-center">
                    <div className="absolute -inset-8 opacity-80 pointer-events-auto overflow-hidden">
                      <Cubes
                       gridSize={9}
                       maxAngle={95}
                       radius={2}
                         cellGap={2}
                        borderStyle="1.5px solid rgba(255,255,255,0.12)"
                       faceColor="#0a0a12"
                       rippleColor="#c17bbf"
                       rippleSpeed={1.5}
                       autoAnimate
                       rippleOnClick={false}
                      />
                    </div>
                    <div className="absolute -inset-8 bg-black/20 pointer-events-none" />
                    <div className="relative z-10 flex flex-col md:flex-row-reverse md:items-start md:justify-between gap-6 pointer-events-none">
                      <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-2xl overflow-hidden border border-primary/20 bg-black/60 shadow-[0_0_30px_rgba(0,255,255,0.12)] mx-auto md:mx-0 md:ml-10 md:shrink-0 opacity-90">
                        <img 
                         src="/src/assets/images/headshot.jpg" 
                         alt="Engineer Headshot" 
                         className="w-full h-full object-cover contrast-110 brightness-105 scale-105"
                        />
                        <div className="absolute inset-0 bg-primary/10 mix-blend-screen pointer-events-none" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                      </div>
                      <div className="flex-1 text-left">
                          <FuzzyText
                            baseIntensity={0.2}
                            hoverIntensity={0.5}
                            enableHover
                            className="block mb-2"
                            fontSize="clamp(1.75rem, 3.5vw, 2.5rem)"
                            fontWeight={800}
                            letterSpacing={1}
                          >
                            THE KERNEL
                          </FuzzyText>
                        <p className="text-gray-300 leading-relaxed text-lg mb-3">
                           I don't just write code; I engineer systems. My approach is rooted in first principles thinking—breaking down complex problems into their fundamental components and rebuilding them for efficiency, scalability, and resilience.
                        </p>
                        <p className="text-gray-400 font-light">
                           Currently exploring distributed systems consensus algorithms and high-performance graphics programming.
                        </p>
                      </div>
                    </div>
                    
                       <div className="relative z-10 pt-4 flex flex-col items-center pointer-events-none">
                        <h3 className="font-mono text-primary text-xs tracking-widest mb-4 pointer-events-none">CORE_DEPENDENCIES</h3>
                        <div className="flex flex-wrap gap-2 pointer-events-none">
                          {["Rust", "TypeScript", "Go", "Docker", "Kubernetes", "AWS", "Terraform", "PostgreSQL"].map(skill => (
                            <span key={skill} className="px-3 py-1 bg-white/5 border border-white/10 text-xs font-mono text-gray-300 pointer-events-none">
                                {skill}
                             </span>
                          ))}
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
