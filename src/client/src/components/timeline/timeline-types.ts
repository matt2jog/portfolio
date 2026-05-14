import type { Experience } from "@/hooks/use-experience";

export interface BackboneNode {
  type: "year" | "month" | "ellipsis";
  year: number;
  month: number;
  isCovered?: boolean;
}

export interface ParsedExperience extends Experience {
  start: { year: number; month: number };
  end: { year: number; month: number };
  startIndex: number;
  endIndex: number;
}
