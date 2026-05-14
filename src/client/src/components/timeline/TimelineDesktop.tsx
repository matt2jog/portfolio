import type { CSSProperties } from "react";
import type { BackboneNode, ParsedExperience } from "./timeline-types";
import { MONTHS, ROW_HEIGHT, getPaletteColor } from "./timeline-utils";

interface Props {
  backbone: BackboneNode[];
  experiences: ParsedExperience[];
  sides: ("left" | "right")[];
  depths: number[];
}

const BACKBONE_PADDING_TOP = 80;
const DEPTH_OFFSET = 25; // px pushed outward per depth level
const BRACKET_BASE_OFFSET = 45;
const BRACKET_PRONG_LENGTH = 46;

function monthsBetween(start: { year: number; month: number }, end: { year: number; month: number }): number {
  return Math.max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1);
}

export default function TimelineDesktop({ backbone, experiences, sides, depths }: Props) {
  const maxDepthPx = Math.max(0, ...depths) * DEPTH_OFFSET;
  const connectorGapToCard = 8;
  const baseConnectorWidth = 16;
  const sharedCardPos = BRACKET_BASE_OFFSET + BRACKET_PRONG_LENGTH + maxDepthPx + baseConnectorWidth + connectorGapToCard;

  return (
    <div className="relative w-full max-w-5xl mx-auto py-20">

      {/* CENTRAL TIMELINE BACKBONE */}
      <div className="relative flex flex-col items-center z-10 w-full">
        {backbone.map((node, i) => (
          <div
            key={`node-${i}`}
            className="flex flex-col items-center justify-center relative select-none"
            style={{ height: ROW_HEIGHT, width: 120 }}
          >
            {node.type === "year" && (
              <div className="pb-2 w-max text-center z-20">
                <div className="inline-flex items-center justify-center rounded-full border-2 border-white/60 py-1.5 px-10 font-display font-bold text-2xl tracking-widest text-[#00FFFF] backdrop-blur-md bg-white/[0.03]">
                  {node.year}
                </div>
              </div>
            )}

            {node.type === "ellipsis" && (
              <span className="font-mono text-[13px] font-bold tracking-widest text-[#00FFFF]/70 z-10 px-2 uppercase py-1">
                ...
              </span>
            )}

            {node.type === "month" && (
              <span className="font-mono text-[11px] tracking-[0.2em] text-gray-400 z-10 px-3 py-0.5 uppercase">
                {MONTHS[node.month]}
              </span>
            )}

            {i > 0 && (
              <div className="absolute top-0 h-[calc(50%-14px)] border-l border-[#00FFFF]/30 -z-10" />
            )}
            {i < backbone.length - 1 && (
              <div className="absolute bottom-0 h-[calc(50%-14px)] border-l border-[#00FFFF]/30 -z-10" />
            )}
          </div>
        ))}
      </div>

      {/* EXPERIENCES LAYER */}
      <div className="absolute inset-x-0 top-0 h-full pointer-events-none z-20">
        {experiences.map((exp, idx) => {
          const isLeft = sides[idx] === "left";
          const depth = depths[idx];
          const depthPx = depth * DEPTH_OFFSET;

          const topPos = exp.startIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + BACKBONE_PADDING_TOP;
          const rawHeight = (exp.endIndex - exp.startIndex) * ROW_HEIGHT;

          const bracketHeight = Math.max(40, rawHeight);
          const adjustedTop = rawHeight < 40 ? topPos - 20 : topPos;

          // Bracket starts at the base offset from spine edge, width grows with depth.
          // Outer edge of bracket = base offset + prong length + depthPx
          const bracketOuterEdge = BRACKET_BASE_OFFSET + BRACKET_PRONG_LENGTH + depthPx;
          const connectorWidth = Math.max(
            baseConnectorWidth,
            sharedCardPos - bracketOuterEdge - connectorGapToCard
          );

          return (
            <div
              key={exp.id}
              className={`absolute top-0 flex items-center pointer-events-auto group ${isLeft ? "right-[50%] ml-[-50vw] pl-8" : "left-[50%] mr-[-50vw] pr-8"
                }`}
              style={{
                top: adjustedTop,
                height: bracketHeight,
                width: "calc(50% + 40px)",
                "--accent": getPaletteColor(idx, experiences.length),
                "--accent-border": getPaletteColor(idx, experiences.length, 0.5),
                "--accent-glow": getPaletteColor(idx, experiences.length, 0.15),
              } as CSSProperties}
            >
              {/* Bracket Shape */}
              <div
                className={`absolute inset-y-0 transition-all duration-300 z-0 ${isLeft
                  ? "border-l-2 border-t-2 border-b-2 rounded-l-lg"
                  : "border-r-2 border-t-2 border-b-2 rounded-r-lg"
                  }`}
                style={{
                  borderColor: "var(--accent)",
                  width: BRACKET_PRONG_LENGTH + depthPx,
                  ...(isLeft ? { right: BRACKET_BASE_OFFSET } : { left: BRACKET_BASE_OFFSET }),
                }}
              />

              {/* Connector Line */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                style={{
                  backgroundColor: "var(--accent)",
                  width: connectorWidth,
                  ...(isLeft ? { right: bracketOuterEdge } : { left: bracketOuterEdge }),
                }}
              />

              {/* Content Card */}
              <div
                className="absolute top-1/2 -translate-y-1/2 bg-black/40 border border-white/10 rounded overflow-hidden transition-all duration-300 hover:border-[var(--accent-border)] hover:bg-black/80 hover:shadow-[0_0_20px_var(--accent-glow)] p-5 md:p-6 w-[280px] sm:w-[350px] lg:w-[480px] z-10"
                style={isLeft ? { right: sharedCardPos } : { left: sharedCardPos }}
              >
                <div className="mb-1 flex items-start justify-between gap-4 pr-2">
                  <h4 className="font-semibold text-lg md:text-xl text-white leading-none">
                    {exp.role.split(" | ")[0]}
                  </h4>
                  <span className="shrink-0 pt-0.5 font-mono text-xs tracking-wider text-[#00FFFF] uppercase opacity-[0.12] group-hover:opacity-25 transition-opacity">
                    {monthsBetween(exp.start, exp.end)} Mo.
                  </span>
                </div>
                <div className="flex flex-col text-xs md:text-sm font-mono text-gray-400 mb-4 gap-0.5 pr-2">
                  <span className="uppercase tracking-wider text-[#00FFFF]">{exp.company}</span>
                  {exp.role.includes(" | ") && (
                    <span className="opacity-80">{exp.role.split(" | ")[1]}</span>
                  )}
                </div>

                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line group-hover:text-white transition-colors duration-300">
                  {exp.description}
                </p>

                {exp.isActive && (
                  <span className="absolute top-4 right-4 flex w-2 h-2">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                    <span
                      className="relative inline-flex rounded-full w-2 h-2"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
