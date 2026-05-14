export interface MermaidBlock {
  index: number;
  chart: string;
  fullMatch: string;
}

export interface MermaidRepair {
  index: number;
  chart: string;
}

const MERMAID_FENCE_REGEX = /```mermaid\s*\r?\n?([\s\S]*?)```/gi;

export function sanitizeMermaidChart(chart: string): string {
  return chart
    .trim()
    .replace(/^\s*```mermaid\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*%\{[\s\S]*?\}%\s*\n?/gm, "")
    .replace(/<br\s*\/?>/gi, "<br/>")
    .replace(/\\n/g, "<br/>")
    .replace(/<\/?(strong|b|em|i|code|span|div|p)[^>]*>/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/&nbsp;/gi, " ");
}

export function extractMermaidBlocks(content: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = MERMAID_FENCE_REGEX.exec(content)) !== null) {
    blocks.push({
      index,
      chart: match[1] ?? "",
      fullMatch: match[0],
    });
    index += 1;
  }

  return blocks;
}

export function replaceMermaidBlocks(content: string, repairs: MermaidRepair[]): string {
  if (repairs.length === 0) return content;

  const repairMap = new Map(repairs.map((repair) => [repair.index, repair.chart.trim()]));
  let currentIndex = 0;

  return content.replace(MERMAID_FENCE_REGEX, (fullMatch, chart) => {
    const replacement = repairMap.get(currentIndex);
    currentIndex += 1;

    if (!replacement) {
      return fullMatch;
    }

    return `\`\`\`mermaid\n${replacement}\n\`\`\``;
  });
}

export function downgradeBrokenMermaidBlocks(content: string, brokenIndexes: number[]): string {
  if (brokenIndexes.length === 0) return content;

  const brokenSet = new Set(brokenIndexes);
  let currentIndex = 0;

  return content.replace(MERMAID_FENCE_REGEX, (fullMatch, chart) => {
    const shouldDowngrade = brokenSet.has(currentIndex);
    currentIndex += 1;

    if (!shouldDowngrade) {
      return fullMatch;
    }

    return [
      "> Mermaid diagram could not be validated, showing the sanitized source instead.",
      "",
      "```text",
      sanitizeMermaidChart(String(chart)).trim(),
      "```",
    ].join("\n");
  });
}
