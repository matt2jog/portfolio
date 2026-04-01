import type { ParsedExperience } from "./timeline-types";
import { MONTHS, getPaletteColor } from "./timeline-utils";

function formatDate(d: { year: number; month: number }): string {
  const now = new Date();
  if (d.year === now.getFullYear() && d.month === now.getMonth()) return "Present";
  return `${MONTHS[d.month]} ${d.year}`;
}

function monthsBetween(start: { year: number; month: number }, end: { year: number; month: number }): number {
  return Math.max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1);
}

interface Props {
  experiences: ParsedExperience[];
}

export default function TimelineMobile({ experiences }: Props) {
  return (
    <div className="w-full flex flex-col gap-4 px-2 py-10 font-sans">
      {experiences.map((exp, idx) => {
        const accent = getPaletteColor(idx, experiences.length);
        const accentGlow = getPaletteColor(idx, experiences.length, 0.15);

        return (
          <div key={exp.id} className="w-full flex" style={{ minHeight: '30svh' }}>
            {/* Dates split along left side: end date top, duration centered, start date bottom */}
            <div className="relative shrink-0 flex flex-col items-center justify-between py-3" style={{ width: 40 }}>
              <span
                className="font-mono text-[11px] italic tracking-wider whitespace-nowrap"
                style={{ color: accent, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {formatDate(exp.end)}
              </span>
              <div className="flex flex-1 flex-col items-center justify-center my-1.5">
                <div className="flex-1 w-px" style={{ backgroundColor: accent, opacity: 0.3 }} />
                <span
                  className="my-2 font-mono text-[10px] tracking-wider whitespace-nowrap"
                  style={{ color: accent, opacity: 0.9, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {monthsBetween(exp.start, exp.end)} Mo
                </span>
                <div className="flex-1 w-px" style={{ backgroundColor: accent, opacity: 0.3 }} />
              </div>
              <span
                className="font-mono text-[11px] italic tracking-wider whitespace-nowrap"
                style={{ color: accent, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {formatDate(exp.start)}
              </span>
            </div>

            <div
              className="relative flex-1 min-w-0 bg-black/40 border border-white/10 rounded p-4 transition-all duration-300"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: accent,
                "--accent-glow": accentGlow,
              } as React.CSSProperties}
            >
              <h4 className="font-display font-semibold text-lg text-white tracking-tight leading-tight mb-1">
                {exp.role.split(" | ")[0]}
              </h4>

              <div className="flex flex-col text-xs font-mono text-gray-400 mb-3 gap-0.5">
                <span className="uppercase tracking-wider text-[#00FFFF]">{exp.company}</span>
                {exp.role.includes(" | ") && (
                  <span className="opacity-80">{exp.role.split(" | ")[1]}</span>
                )}
              </div>

              <p className="text-gray-300 text-[13px] leading-relaxed whitespace-pre-line">
                {exp.description}
              </p>

              {exp.isActive && (
                <span className="absolute top-3 right-3 flex w-2 h-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: accent }}
                  />
                  <span
                    className="relative inline-flex rounded-full w-2 h-2"
                    style={{ backgroundColor: accent }}
                  />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
