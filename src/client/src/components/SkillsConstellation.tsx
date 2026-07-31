import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ConstellationNode {
  portfolio_skill_id: string;
  skill_id: string;
  skill_name: string;
  group_id: string;
  group_name: string;
  group_position?: number;
  skill_position?: number;
}

interface SkillGroup {
  id: string;
  name: string;
  position: number;
  skills: ConstellationNode[];
}

function groupSkills(data: ConstellationNode[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();

  for (const skill of data) {
    if (!skill.group_id || !skill.group_name) continue;
    const group = groups.get(skill.group_id) ?? {
      id: skill.group_id,
      name: skill.group_name,
      position: skill.group_position ?? Number.MAX_SAFE_INTEGER,
      skills: [],
    };
    group.position = Math.min(group.position, skill.group_position ?? Number.MAX_SAFE_INTEGER);
    group.skills.push(skill);
    groups.set(skill.group_id, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      skills: group.skills.sort((a, b) =>
        (a.skill_position ?? Number.MAX_SAFE_INTEGER) -
          (b.skill_position ?? Number.MAX_SAFE_INTEGER) ||
        a.skill_name.localeCompare(b.skill_name),
      ),
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function SkillsConstellation() {
  const { data = [], isLoading } = useQuery<ConstellationNode[]>({
    queryKey: ["/api/skills-constellation"],
  });
  const groups = useMemo(() => groupSkills(data), [data]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupId(null);
      return;
    }
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [activeGroupId, groups]);

  if (isLoading) {
    return (
      <div
        className="flex h-full w-full items-center justify-end"
        aria-label="Loading skills"
        role="status"
      >
        <div className="h-64 w-full max-w-xl animate-pulse border border-cyan-300/10 bg-cyan-300/5" />
      </div>
    );
  }

  if (!groups.length) return null;

  const activeIndex = Math.max(0, groups.findIndex((group) => group.id === activeGroupId));
  const activeGroup = groups[activeIndex];
  const handleStep = (direction: 1 | -1) => {
    const next = (activeIndex + direction + groups.length) % groups.length;
    setActiveGroupId(groups[next].id);
  };

  return (
    <section
      data-testid="skills-constellation"
      data-active-group={activeGroup.name}
      aria-label="Skills by discipline"
      className="flex h-full w-full items-center justify-end"
    >
      <div className="relative w-full max-w-[42rem] overflow-hidden border border-cyan-300/15 bg-black/70 p-4 shadow-[0_0_60px_rgba(0,240,255,0.08)] backdrop-blur-sm sm:p-5 md:mr-8 md:w-[46vw] md:min-w-[31rem] xl:mr-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 72% 32%, rgba(0,240,255,.13), transparent 34%), linear-gradient(rgba(0,240,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,.035) 1px, transparent 1px)",
            backgroundSize: "auto, 28px 28px, 28px 28px",
          }}
        />

        <div className="relative flex flex-col gap-4">
          <header className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-cyan-300/75">
                Skill map
              </p>
              <h2
                className="truncate text-xl font-bold text-white sm:text-2xl"
                aria-live="polite"
              >
                {activeGroup.name}
              </h2>
            </div>
            <p className="shrink-0 font-mono text-xs text-white/55">
              {activeGroup.skills.length} {activeGroup.skills.length === 1 ? "skill" : "skills"}
            </p>
          </header>

          <div
            role="tablist"
            aria-label="Skill groups"
            className="flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-custom"
          >
            {groups.map((group) => {
              const isActive = group.id === activeGroup.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="active-skill-group"
                  onClick={() => setActiveGroupId(group.id)}
                  className={`min-h-11 shrink-0 snap-start border px-3 py-2 text-left text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    isActive
                      ? "border-cyan-300 bg-cyan-300 text-black"
                      : "border-white/15 bg-black/50 text-white/70 hover:border-cyan-300/60 hover:text-white"
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
            <button
              type="button"
              onClick={() => handleStep(-1)}
              aria-label="Previous skills group"
              className="grid min-h-11 min-w-11 place-items-center border border-white/15 text-white/65 transition-colors duration-150 hover:border-cyan-300/60 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div
              id="active-skill-group"
              role="tabpanel"
              aria-label={`${activeGroup.name} skills`}
              className="min-h-52 border border-white/10 bg-black/45 p-3 sm:min-h-60 sm:p-4"
            >
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {activeGroup.skills.map((skill, index) => (
                  <li
                    key={skill.portfolio_skill_id}
                    className="relative flex min-h-11 items-center justify-center border border-white/12 bg-[#0a0a0a] px-2 py-2 text-center text-xs font-medium leading-tight text-white/80 shadow-[inset_0_0_0_1px_rgba(0,240,255,0.025)] sm:text-sm"
                  >
                    <span
                      className="absolute left-1.5 top-1.5 h-1 w-1 bg-cyan-300/70"
                      aria-hidden="true"
                    />
                    {skill.skill_name}
                    <span className="sr-only">, skill {index + 1} of {activeGroup.skills.length}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => handleStep(1)}
              aria-label="Next skills group"
              className="grid min-h-11 min-w-11 place-items-center border border-white/15 text-white/65 transition-colors duration-150 hover:border-cyan-300/60 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
