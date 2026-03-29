import type { Experience } from "@/hooks/use-experience";
import type { BackboneNode, ParsedExperience } from "./timeline-types";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const ROW_HEIGHT = 56;

// Maps experiences onto [180°, 240°] with a log-scaled reach and quadratic clustering.
// - Reach: ln(total)/ln(15) controls how far into the spectrum the set extends.
//   3 items ≈ 216°, 5 ≈ 228°, 10 ≈ 237°, 15 = 240°.
// - Power curve (t²): pushes the median toward cyan so most colors stay cool.
export function getPaletteColor(idx: number, total: number, alpha = 1): string {
  const t = total <= 1 ? 0 : idx / (total - 1);
  const reach = Math.min(1, Math.log(total) / Math.log(15));
  const hue = Math.round(180 + 60 * reach * t * t);
  return alpha === 1
    ? `hsl(${hue}, 100%, 50%)`
    : `hsl(${hue} 100% 50% / ${alpha})`;
}

export function parseDate(str: string): { year: number; month: number } {
  const s = str.trim().toLowerCase();
  const now = new Date();

  if (s === "present") {
    return { year: now.getFullYear(), month: now.getMonth() };
  }

  if (/^\d{4}$/.test(s)) {
    return { year: parseInt(s, 10), month: 0 };
  }

  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const monthStr = parts[0].substring(0, 3);
    const year = parseInt(parts[1], 10);
    const month = MONTHS.findIndex((m) => m.toLowerCase().startsWith(monthStr));
    if (month !== -1 && !isNaN(year)) {
      return { year, month };
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  return { year: now.getFullYear(), month: 0 };
}

export function buildBackbone(experiences: Experience[]): {
  backbone: BackboneNode[];
  parsedExps: ParsedExperience[];
} {
  if (!experiences || experiences.length === 0) {
    return { backbone: [], parsedExps: [] };
  }

  const parsed = experiences.map((exp) => {
    const parts = exp.duration.split(/[-–—]/);
    const startStr = parts[0];
    const endStr = parts.length > 1 ? parts[1] : parts[0];

    return {
      ...exp,
      start: parseDate(startStr),
      end: parseDate(endStr),
    };
  });

  let minYear = Infinity;
  let minMonth = Infinity;
  let maxYear = -Infinity;
  let maxMonth = -Infinity;

  parsed.forEach((exp) => {
    if (exp.start.year < minYear || (exp.start.year === minYear && exp.start.month < minMonth)) {
      minYear = exp.start.year;
      minMonth = exp.start.month;
    }
    if (exp.end.year > maxYear || (exp.end.year === maxYear && exp.end.month > maxMonth)) {
      maxYear = exp.end.year;
      maxMonth = exp.end.month;
    }
  });

  const d = new Date();
  const currentY = d.getFullYear();
  const currentM = d.getMonth();

  const fullTimeline: { type: "year" | "month"; year: number; month: number; isCovered: boolean }[] = [];
  if (minYear !== Infinity) {
    if (currentY > maxYear || (currentY === maxYear && currentM > maxMonth)) {
      maxYear = currentY;
      maxMonth = currentM;
    }

    if (minMonth === 0) { minYear--; minMonth = 11; } else { minMonth--; }
    if (maxMonth === 11) { maxYear++; maxMonth = 0; } else { maxMonth++; }

    for (let y = minYear; y <= maxYear; y++) {
      const startM = y === minYear ? minMonth : 0;
      const endM = y === maxYear ? maxMonth : 11;

      if (startM === 0 || (y === minYear && startM === minMonth)) {
        fullTimeline.push({ type: "year", year: y, month: -1, isCovered: false });
      }

      for (let m = startM; m <= endM; m++) {
        const isCurrentMonth = y === currentY && m === currentM;

        const isCovered = parsed.some((exp) => {
          const expStart = exp.start.year * 12 + exp.start.month;
          const expEnd = exp.end.year * 12 + exp.end.month;
          const current = y * 12 + m;
          return current >= expStart && current <= expEnd;
        }) || isCurrentMonth;

        fullTimeline.push({ type: "month", year: y, month: m, isCovered });
      }
    }
  }

  // Compress gaps of uncovered months (> 4 months)
  const compactedTimeline: BackboneNode[] = [];
  let gapSequence: typeof fullTimeline = [];

  const flushGapSequence = () => {
    const emptyMonths = gapSequence.filter((n) => n.type === "month");

    if (emptyMonths.length < 5) {
      for (const n of gapSequence) {
        compactedTimeline.push(n);
      }
    } else {
      const keepEmptyMonths = new Set<(typeof fullTimeline)[0]>();
      keepEmptyMonths.add(emptyMonths[0]);
      keepEmptyMonths.add(emptyMonths[1]);
      keepEmptyMonths.add(emptyMonths[emptyMonths.length - 2]);
      keepEmptyMonths.add(emptyMonths[emptyMonths.length - 1]);

      let lastWasEllipsis = false;

      for (const n of gapSequence) {
        if (n.type === "year") {
          compactedTimeline.push(n);
          lastWasEllipsis = false;
        } else if (n.type === "month") {
          if (keepEmptyMonths.has(n)) {
            compactedTimeline.push(n);
            lastWasEllipsis = false;
          } else if (!lastWasEllipsis) {
            compactedTimeline.push({ type: "ellipsis", year: n.year, month: -1 });
            lastWasEllipsis = true;
          }
        }
      }
    }
    gapSequence = [];
  };

  for (const node of fullTimeline) {
    if (node.type === "month" && node.isCovered) {
      flushGapSequence();
      compactedTimeline.push(node);
    } else {
      gapSequence.push(node);
    }
  }
  flushGapSequence();

  // Reverse so most recent appears first (top of page)
  compactedTimeline.reverse();

  const mapped = parsed.map((exp) => {
    // After reversal, the "start" (earlier date) has a higher index than "end" (later date).
    // startIndex should be the smaller index (visually higher) so brackets render correctly.
    const earlyIdx = compactedTimeline.findIndex(
      (t) => t.type === "month" && t.year === exp.start.year && t.month === exp.start.month
    );
    const lateIdx = compactedTimeline.findIndex(
      (t) => t.type === "month" && t.year === exp.end.year && t.month === exp.end.month
    );
    const si = lateIdx !== -1 ? lateIdx : 0;
    const ei = earlyIdx !== -1 ? earlyIdx : compactedTimeline.length - 1;
    return {
      ...exp,
      startIndex: Math.min(si, ei),
      endIndex: Math.max(si, ei),
    };
  }).sort((a, b) => a.startIndex - b.startIndex);

  return { backbone: compactedTimeline, parsedExps: mapped };
}

// Greedy interval-based side assignment — resolves overlapping same-side experiences.
export function assignSides(exps: ParsedExperience[]): ("left" | "right")[] {
  const MIN_CARD_ROWS = 3;
  let leftEnd = -Infinity;
  let rightEnd = -Infinity;

  return exps.map((exp, idx) => {
    const preferredSide = idx % 2 === 0 ? "left" : "right";
    const otherSide = preferredSide === "left" ? "right" : "left";

    const preferredEnd = preferredSide === "left" ? leftEnd : rightEnd;
    const otherEnd = otherSide === "left" ? leftEnd : rightEnd;

    let chosen: "left" | "right";

    if (exp.startIndex > preferredEnd) {
      chosen = preferredSide;
    } else if (exp.startIndex > otherEnd) {
      chosen = otherSide;
    } else {
      chosen = leftEnd <= rightEnd ? "left" : "right";
    }

    const visualEnd = Math.max(exp.endIndex, exp.startIndex + MIN_CARD_ROWS);
    if (chosen === "left") leftEnd = visualEnd;
    else rightEnd = visualEnd;

    return chosen;
  });
}

// Compute how far each experience's bracket should be pushed away from the spine.
// Depth 0 = closest to spine. Overlapping same-side experiences get increasing depths.
// Simultaneous starts are idempotent: tiebreak by longer duration → lower depth (closer).
export function assignDepths(exps: ParsedExperience[], sides: ("left" | "right")[]): number[] {
  const MIN_CARD_ROWS = 4;
  const depths: number[] = new Array(exps.length).fill(0);

  // Process each side independently
  for (const side of ["left", "right"] as const) {
    // Indices into exps that are on this side, in backbone order (already sorted)
    const indices = exps.map((_, i) => i).filter((i) => sides[i] === side);

    // Active intervals: { visualEnd, depth }
    const active: { visualEnd: number; depth: number }[] = [];

    for (const i of indices) {
      const exp = exps[i];

      // Expire intervals that have ended before this one starts
      const stillActive = active.filter((a) => a.visualEnd >= exp.startIndex);
      active.length = 0;
      active.push(...stillActive);

      const depth = active.length > 0
        ? Math.max(...active.map((a) => a.depth)) + 1
        : 0;

      depths[i] = depth;

      const visualEnd = Math.max(exp.endIndex, exp.startIndex + MIN_CARD_ROWS);
      active.push({ visualEnd, depth });
    }
  }

  return depths;
}
