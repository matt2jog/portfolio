import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { Agent } from "./agent";
import type { LLMProvider } from "./providers/base";
import {
  downgradeBrokenMermaidBlocks,
  extractMermaidBlocks,
  replaceMermaidBlocks,
  sanitizeMermaidChart,
  type MermaidRepair,
} from "@shared/mermaid";

type MermaidModule = typeof import("mermaid");

interface MermaidValidationFailure {
  index: number;
  chart: string;
  sanitizedChart: string;
  error: string;
}

interface MermaidRepairResult {
  content: string;
  repaired: boolean;
  downgraded: boolean;
  attempts: number;
}

let mermaidModulePromise: Promise<MermaidModule["default"]> | null = null;

function installMermaidDomGlobals(window: JSDOM["window"]) {
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: window.document,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
}

async function getMermaidValidator() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = (async () => {
      const window = new JSDOM("").window;
      const domPurifyInstance = createDOMPurify(window);

      Object.assign(createDOMPurify, domPurifyInstance);
      installMermaidDomGlobals(window);

      const module = await import("mermaid");
      const mermaid = module.default;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        flowchart: {
          htmlLabels: true,
          useMaxWidth: true,
          curve: "basis",
        },
        sequence: {
          useMaxWidth: true,
          wrap: true,
        },
      });

      return mermaid;
    })();
  }

  return mermaidModulePromise;
}

function normalizeMermaidError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  return String(err || "Unknown Mermaid error");
}

async function validateMermaidBlocks(content: string): Promise<MermaidValidationFailure[]> {
  const blocks = extractMermaidBlocks(content);
  if (blocks.length === 0) {
    return [];
  }

  const mermaid = await getMermaidValidator();
  const failures: MermaidValidationFailure[] = [];

  for (const block of blocks) {
    const sanitizedChart = sanitizeMermaidChart(block.chart);

    try {
      await mermaid.parse(sanitizedChart, { suppressErrors: false });
    } catch (err) {
      failures.push({
        index: block.index,
        chart: block.chart.trim(),
        sanitizedChart,
        error: normalizeMermaidError(err),
      });
    }
  }

  return failures;
}

function parseRepairs(raw: string): MermaidRepair[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonSource = fenced?.[1] ?? trimmed;
  const parsed = JSON.parse(jsonSource) as any;
  const repairs = Array.isArray(parsed) ? parsed : parsed?.repairs;

  if (!Array.isArray(repairs)) {
    return [];
  }

  return repairs
    .map((repair) => ({
      index: typeof repair?.index === "number" ? repair.index : Number.parseInt(String(repair?.index ?? ""), 10),
      chart: typeof repair?.chart === "string" ? repair.chart : "",
    }))
    .filter((repair) => Number.isFinite(repair.index) && repair.chart.trim().length > 0);
}

async function requestMermaidRepairs(
  content: string,
  failures: MermaidValidationFailure[],
  modelId: string,
  provider: LLMProvider,
  parentRun?: import("langsmith/run_trees").RunTree,
): Promise<MermaidRepair[]> {
  const repairAgent = new Agent({
    name: "mermaid refiner",
    modelId,
    provider,
    systemPrompt: [
      "You repair Mermaid diagrams inside markdown responses.",
      "Return JSON only in the form {\"repairs\":[{\"index\":0,\"chart\":\"...\"}]} with no markdown fence unless JSON is inside one code block.",
      "Make sure the JSON is valid and only includes the `repairs` object. Output ONLY the JSON codeblock, no explanation.",
      "Only return repairs for the listed broken mermaid block indexes.",
      "Each chart must be valid Mermaid syntax after sanitization.",
      "Preserve the meaning of the original diagram, but simplify aggressively if needed to make it renderable.",
      "Use ASCII-safe IDs and labels. Do not include Mermaid init directives. Do not use raw HTML tags except <br/> if absolutely necessary.",
      "Do not use parentheses or brackets in node labels without quoting them e.g., A[\"Some (text) with [brackets]\"].",
      "Do not include any prose outside the JSON payload.",
    ].join("\n"),
    maxTokens: 1600,
    temperature: 0.2,
    tracingTags: ["project-chat", "mermaid-repair", modelId, provider.constructor.name],
    tracingMeta: { brokenMermaidBlocks: failures.length, modelId, provider: provider.constructor.name },
  });

  const raw = await repairAgent.run([{
    role: "user",
    content: JSON.stringify({
      responseMarkdown: content,
      brokenBlocks: failures.map((failure) => ({
        index: failure.index,
        error: failure.error,
        originalChart: failure.chart,
        sanitizedChart: failure.sanitizedChart,
      })),
    }),
  }], parentRun);

  return parseRepairs(raw);
}

export async function ensureRenderableMermaid(
  content: string,
  options: {
    modelId: string;
    provider: LLMProvider;
    maxAttempts?: number;
    parentRun?: import("langsmith/run_trees").RunTree;
  },
): Promise<MermaidRepairResult> {
  if (!content.includes("```mermaid")) {
    return { content, repaired: false, downgraded: false, attempts: 0 };
  }

  const maxAttempts = options.maxAttempts ?? 3;
  let currentContent = content;
  let repaired = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const failures = await validateMermaidBlocks(currentContent);
    if (failures.length === 0) {
      return {
        content: currentContent,
        repaired,
        downgraded: false,
        attempts: attempt - 1,
      };
    }

    const repairs = await requestMermaidRepairs(
      currentContent,
      failures,
      options.modelId,
      options.provider,
      options.parentRun,
    );

    if (repairs.length === 0) {
      const downgradedContent = downgradeBrokenMermaidBlocks(
        currentContent,
        failures.map((failure) => failure.index),
      );

      return {
        content: downgradedContent,
        repaired,
        downgraded: true,
        attempts: attempt,
      };
    }

    currentContent = replaceMermaidBlocks(currentContent, repairs);
    repaired = true;
  }

  const remainingFailures = await validateMermaidBlocks(currentContent);
  if (remainingFailures.length === 0) {
    return {
      content: currentContent,
      repaired,
      downgraded: false,
      attempts: maxAttempts,
    };
  }

  return {
    content: downgradeBrokenMermaidBlocks(
      currentContent,
      remainingFailures.map((failure) => failure.index),
    ),
    repaired,
    downgraded: true,
    attempts: maxAttempts,
  };
}
