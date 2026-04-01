import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BlueprintCard } from "@/components/BlueprintCard";
import ProjectChat from "@/components/ProjectChat";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type TransitionEvent, useCallback, useMemo, useRef, useState } from "react";

export default function Portfolio() {
  const fallbackProjects = [
    {
      title: "Lorem Ipsum I",
      description:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      tech: ["Rust", "Kafka", "gRPC", "Kubernetes"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum II",
      description:
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      tech: ["Python", "PyTorch", "React", "WebGL"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum III",
      description:
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
      tech: ["C++", "Assembly", "Redis Module"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum IV",
      description:
        "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
      tech: ["Solidity", "ZK-Snarks", "Node.js"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum V",
      description:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.",
      tech: ["Haskell", "Cryptography", "Nix"],
      githubUrl: null,
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum VI",
      description:
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.",
      tech: ["Zig", "ARM Assembly", "LLVM"],
      githubUrl: null,
      deployedUrl: null,
    },
    {
      title: "Lorem Ipsum VII",
      description:
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
      tech: ["Go", "Protobuf", "WebRTC"],
      githubUrl: "https://github.com/binimal101",
      deployedUrl: "https://example.com",
    },
  ];

  const projectsQuery = useQuery({ queryKey: ["/api/public/projects"] });

  const projects =
    Array.isArray(projectsQuery.data) && projectsQuery.data.length > 0
      ? projectsQuery.data
      : fallbackProjects;

  const facesCount = 4;
  const projectsPerFace = 4;
  const totalGroups = Math.max(1, Math.ceil(projects.length / projectsPerFace));

  const [rotationStep, setRotationStep] = useState(0);
  const [faceKs, setFaceKs] = useState([0, 1, 2, -1]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [animDuration, setAnimDuration] = useState(1200);
  const [chatProject, setChatProject] = useState<{ id: string; title: string; description: string; tech: string[] } | null>(null);

  const rotationIndex = ((rotationStep % facesCount) + facesCount) % facesCount;
  const groupIndex = ((rotationStep % totalGroups) + totalGroups) % totalGroups;

  const groups = useMemo(() => {
    const chunks = [] as typeof projects[];
    for (let i = 0; i < projects.length; i += projectsPerFace) {
      chunks.push(projects.slice(i, i + projectsPerFace));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [projects, projectsPerFace]);

  const cubeGroups = useMemo(() => {
    return faceKs.map((k) => {
      const index = ((k % totalGroups) + totalGroups) % totalGroups;
      return groups[index] ?? [];
    });
  }, [faceKs, totalGroups, groups]);

  const currentProjectPage = Math.min(totalGroups, groupIndex + 1);

  const pendingQueue = useRef<number[]>([]);
  const isAnimating = useRef(false);

  const consolidate = (queue: number[]): number[] => {
    const stack: number[] = [];
    for (const step of queue) {
      if (stack.length > 0 && stack[stack.length - 1] === -step) {
        stack.pop();
      } else {
        stack.push(step);
      }
    }
    return stack;
  };

  const calcDuration = (queueLen: number): number =>
    Math.max(250, 1200 - queueLen * 400);

  const applyStep = useCallback(
    (step: number) => {
      isAnimating.current = true;
      setAnimDuration(calcDuration(pendingQueue.current.length));
      setRotationStep((prev) => {
        setFaceKs((faces) => {
          const newFaces = [...faces];
          const slot = ((prev + 2) % facesCount + facesCount) % facesCount;
          newFaces[slot] = step > 0 ? prev + 2 : prev - 2;
          return newFaces;
        });
        return prev + step;
      });
    },
    [facesCount],
  );

  const enqueue = useCallback(
    (step: number) => {
      pendingQueue.current.push(step);
      pendingQueue.current = consolidate(pendingQueue.current);

      if (!isAnimating.current) {
        const next = pendingQueue.current.shift();
        if (next !== undefined) applyStep(next);
      } else {
        setAnimDuration(calcDuration(pendingQueue.current.length));
      }
    },
    [applyStep],
  );

  const handleTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform" || e.target !== e.currentTarget) {
        return;
      }

      const next = pendingQueue.current.shift();
      if (next !== undefined) {
        applyStep(next);
      } else {
        isAnimating.current = false;
      }
    },
    [applyStep],
  );

  const nextFace = () => enqueue(+1);
  const prevFace = () => enqueue(-1);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary/30">
      <div className="fixed inset-0 grid-pattern opacity-[0.15] pointer-events-none z-0" />
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-primary/5 blur-[80px] rounded-full pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-accent/5 blur-[60px] rounded-full pointer-events-none z-0" />

      <Navbar />

      <main className="relative z-10 pt-20">
        <section className="min-h-[calc(100vh-5rem)] py-20 md:py-24 px-6 md:px-20 relative">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-[calc(var(--spacing)*30)]">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  DEPLOYED <br />
                  <span className="text-gray-500">MODULES</span>
                </h1>
                <p className="text-gray-400 font-mono text-sm max-w-md">
                  Listing directories... {projects.length} found. [Project Page{" "}
                  {currentProjectPage}/{totalGroups}]
                </p>
              </div>
              <div className="hidden md:flex gap-4">
                <button
                  onClick={prevFace}
                  className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                >
                  <ChevronLeft
                    size={24}
                    className="group-active:scale-90 transition-transform"
                  />
                </button>
                <button
                  onClick={nextFace}
                  className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                >
                  <ChevronRight
                    size={24}
                    className="group-active:scale-90 transition-transform"
                  />
                </button>
              </div>
            </div>

            <div className="project-cube-scene mx-auto">
              <div
                className="project-cube"
                style={{
                  transform: `rotateX(5deg) rotateY(${12 + rotationStep * -90}deg)`,
                  transition: `transform ${animDuration}ms ease-in-out`,
                }}
                onTransitionEnd={handleTransitionEnd}
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
                            setActiveCardId={
                              faceIndex === rotationIndex
                                ? setActiveCardId
                                : undefined
                            }
                            isActiveFace={faceIndex === rotationIndex}
                            onChatOpen={
                              faceIndex === rotationIndex
                                ? () => setChatProject({ id: project.id, title: project.title, description: project.description, tech: project.tech })
                                : undefined
                            }
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

            <div className="flex md:hidden justify-center gap-4 mt-8 mb-20">
              <button
                onClick={prevFace}
                className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
              >
                <ChevronLeft
                  size={24}
                  className="group-active:scale-90 transition-transform"
                />
              </button>
              <button
                onClick={nextFace}
                className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
              >
                <ChevronRight
                  size={24}
                  className="group-active:scale-90 transition-transform"
                />
              </button>
            </div>
          </div>
        </section>

        <Footer />
      </main>

      {chatProject && (
        <ProjectChat
          project={chatProject}
          onClose={() => setChatProject(null)}
        />
      )}
    </div>
  );
}
