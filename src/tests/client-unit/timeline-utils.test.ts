import assert from "node:assert/strict";
import { test } from "node:test";

import type { Experience } from "../../client/src/hooks/use-experience";
import type { ParsedExperience } from "../../client/src/components/timeline/timeline-types";
import {
  assignDepths,
  assignSides,
  buildBackbone,
  getPaletteColor,
  parseDate,
} from "../../client/src/components/timeline/timeline-utils";

function experience(id: string, duration: string): Experience {
  return {
    id,
    role: `Role ${id}`,
    company: `Company ${id}`,
    location: "Remote",
    duration,
    description: "Tested timeline experience",
    technologies: ["TypeScript"],
    isActive: false,
    position: 0,
  };
}

function parsed(id: string, startIndex: number, endIndex: number): ParsedExperience {
  return {
    ...experience(id, "2024"),
    start: { year: 2024, month: 0 },
    end: { year: 2024, month: 1 },
    startIndex,
    endIndex,
  };
}

test("palette and date parsing cover compact, alpha, current, named, ISO, and fallback forms", () => {
  assert.equal(getPaletteColor(0, 1), "hsl(180, 100%, 50%)");
  assert.match(getPaletteColor(14, 15, 0.5), /^hsl\(240 100% 50% \/ 0\.5\)$/);

  const now = new Date();
  assert.deepEqual(parseDate("present"), { year: now.getFullYear(), month: now.getMonth() });
  assert.deepEqual(parseDate("2024"), { year: 2024, month: 0 });
  assert.deepEqual(parseDate("February 2023"), { year: 2023, month: 1 });
  assert.deepEqual(parseDate("2022-07-15"), { year: 2022, month: 6 });
  assert.deepEqual(parseDate("not-a-date"), { year: now.getFullYear(), month: 0 });
});

test("backbone construction handles empty, single-date, boundary-month, covered, and compacted-gap timelines", () => {
  assert.deepEqual(buildBackbone([]), { backbone: [], parsedExps: [] });
  assert.deepEqual(buildBackbone(undefined as never), { backbone: [], parsedExps: [] });

  const currentYear = new Date().getFullYear();
  const result = buildBackbone([
    experience("single", `${currentYear - 3}`),
    experience("boundary", `January ${currentYear - 2} - December ${currentYear - 2}`),
    experience("recent", `March ${currentYear} - present`),
  ]);

  assert.equal(result.parsedExps.length, 3);
  assert.ok(result.backbone.some(({ type }) => type === "year"));
  assert.ok(result.backbone.some(({ type }) => type === "month"));
  assert.ok(result.backbone.some(({ type }) => type === "ellipsis"));
  assert.ok(result.parsedExps.every(({ startIndex, endIndex }) => startIndex <= endIndex));
  assert.deepEqual(
    [...result.parsedExps].sort((a, b) => a.startIndex - b.startIndex).map(({ id }) => id),
    result.parsedExps.map(({ id }) => id),
  );

  const short = buildBackbone([
    experience("short", `October ${currentYear} - December ${currentYear}`),
  ]);
  assert.equal(short.backbone.some(({ type }) => type === "ellipsis"), false);
});

test("side assignment uses preferred, alternate, and least-occupied sides", () => {
  const sides = assignSides([
    parsed("a", 0, 10),
    parsed("b", 0, 0),
    parsed("c", 5, 20),
    parsed("d", 5, 30),
  ]);
  assert.deepEqual(sides, ["left", "right", "right", "left"]);
});

test("depth assignment expires old intervals and stacks overlaps independently per side", () => {
  const exps = [
    parsed("a", 0, 5),
    parsed("b", 1, 6),
    parsed("c", 7, 8),
    parsed("d", 0, 8),
    parsed("e", 2, 9),
  ];
  assert.deepEqual(
    assignDepths(exps, ["left", "left", "left", "right", "right"]),
    [0, 1, 0, 0, 1],
  );
});
