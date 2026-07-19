import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BlueprintCard } from "@/components/BlueprintCard";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type TransitionEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

function ProjectCardClickHint({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-chalk-hint="card"
      className={`portfolio-card-click-hint pointer-events-none absolute z-50 drop-shadow-[0_0_9px_rgba(255,255,255,0.16)] transition-opacity duration-500 ${
        isVisible ? "opacity-90" : "opacity-0"
      }`}
    >
      <img
        src="/assets/chalk-arrow-desktop.png"
        alt=""
        className="block h-auto w-full"
      />
    </div>
  );
}

export default function Portfolio() {
  const [, setLocation] = useLocation();
  const projectsQuery = useQuery({ queryKey: ["/api/public/projects"] });

  const projects = useMemo(
    () => Array.isArray(projectsQuery.data) ? projectsQuery.data : [],
    [projectsQuery.data],
  );

  const facesCount = 4;
  const projectsPerFace = 4;
  const totalGroups = Math.max(1, Math.ceil(projects.length / projectsPerFace));

  const initRotation = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const params = new URLSearchParams(window.location.search);
    const rot = params.get('rotation');
    return rot ? parseInt(rot, 10) || 0 : 0;
  }, []);

  const [rotationStep, setRotationStep] = useState(initRotation);
  const [faceKs, setFaceKs] = useState(() => {
    const R = initRotation;
    const newFaces = [0, 0, 0, 0];
    const S = ((R % 4) + 4) % 4;
    newFaces[S] = R;
    newFaces[(S + 1) % 4] = R + 1;
    newFaces[(S + 2) % 4] = R + 2;
    newFaces[(S + 3) % 4] = R - 1;
    return newFaces;
  });
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [animDuration, setAnimDuration] = useState(1200);
  const [isClickHintMounted, setIsClickHintMounted] = useState(true);
  const [isClickHintVisible, setIsClickHintVisible] = useState(true);

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
  const clickHintHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickHintHideTimeout.current) {
        clearTimeout(clickHintHideTimeout.current);
      }
    };
  }, []);

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
      if (isClickHintMounted) {
        setIsClickHintVisible(false);
        if (clickHintHideTimeout.current) {
          clearTimeout(clickHintHideTimeout.current);
        }
        clickHintHideTimeout.current = setTimeout(() => {
          setIsClickHintMounted(false);
          clickHintHideTimeout.current = null;
        }, 500);
      }

      pendingQueue.current.push(step);
      pendingQueue.current = consolidate(pendingQueue.current);

      if (!isAnimating.current) {
        const next = pendingQueue.current.shift();
        if (next !== undefined) applyStep(next);
      } else {
        setAnimDuration(calcDuration(pendingQueue.current.length));
      }
    },
    [applyStep, isClickHintMounted],
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
              {projects.length > 0 && <div className="hidden md:flex gap-4">
                <button
                  aria-label="Previous project page"
                  onClick={prevFace}
                  className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                >
                  <ChevronLeft
                    size={24}
                    className="group-active:scale-90 transition-transform"
                  />
                </button>
                <button
                  aria-label="Next project page"
                  onClick={nextFace}
                  className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
                >
                  <ChevronRight
                    size={24}
                    className="group-active:scale-90 transition-transform"
                  />
                </button>
              </div>}
            </div>

            {projects.length === 0 ? (
              <div
                data-testid="portfolio-empty"
                className="mx-auto flex min-h-[28rem] max-w-2xl items-center justify-center border border-dashed border-white/15 bg-black/30 p-8 text-center"
              >
                <p className="font-mono text-sm text-gray-400">No portfolio projects are configured.</p>
              </div>
            ) : <>
            <div data-testid="portfolio-cube-scene" className="project-cube-scene mx-auto">
              <div
                data-testid="portfolio-cube"
                data-project-page={currentProjectPage}
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
                    <div className="project-face-grid grid grid-cols-2 gap-2 sm:gap-4 md:gap-6 w-full h-full min-h-0 p-2 sm:p-4">
                      {Array.from({ length: projectsPerFace }, (_, projectIndex) => {
                        const project = faceProjects[projectIndex];
                        return project ? (
                          <div
                            key={`${faceIndex}-${projectIndex}-${project.title}`}
                            className="relative min-h-0 overflow-visible"
                          >
                            {isClickHintMounted && faceIndex === rotationIndex && projectIndex === 0 && (
                              <ProjectCardClickHint isVisible={isClickHintVisible} />
                            )}
                            <BlueprintCard
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
                                  ? () => setLocation(`/portfolio/${project.id}/chat?rotation=${rotationStep}`)
                                  : undefined
                              }
                            />
                          </div>
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
                aria-label="Previous project page"
                onClick={prevFace}
                className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
              >
                <ChevronLeft
                  size={24}
                  className="group-active:scale-90 transition-transform"
                />
              </button>
              <button
                aria-label="Next project page"
                onClick={nextFace}
                className="p-4 border border-white/10 hover:border-primary/50 text-white/50 hover:text-primary transition-all bg-black/60 group"
              >
                <ChevronRight
                  size={24}
                  className="group-active:scale-90 transition-transform"
                />
              </button>
            </div>
            </>}
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
