import { Client } from "langsmith";
import { RunTree } from "langsmith/run_trees";

/** Shared client — configured entirely from env vars:
 *  LANGSMITH_API_KEY, LANGSMITH_ENDPOINT, LANGSMITH_PROJECT, LANGSMITH_TRACING */
export const lsClient = new Client();

export function tracingEnabled(): boolean {
  return (
    process.env.LANGSMITH_TRACING === "true" &&
    !!process.env.LANGSMITH_API_KEY
  );
}

const project = process.env.LANGSMITH_PROJECT ?? "default";

/* ------------------------------------------------------------------ */
/*  Run factories                                                       */
/* ------------------------------------------------------------------ */

export interface RunMeta {
  name: string;
  runType: "chain" | "llm" | "tool";
  inputs: Record<string, unknown>;
  parent?: RunTree;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Create a RunTree. Returns null when tracing is disabled so callers
 * can short-circuit without nested if-checks.
 */
export function createRun(meta: RunMeta): RunTree | null {
  if (!tracingEnabled()) return null;
  try {
    const config = {
      name: meta.name,
      run_type: meta.runType,
      inputs: meta.inputs,
      project_name: project,
      tags: meta.tags,
      metadata: meta.metadata,
    };
    return meta.parent
      ? meta.parent.createChild(config)
      : new RunTree({ client: lsClient, ...config });
  } catch {
    return null;
  }
}

/** Post, run fn, then end+patch. Fire-and-forget on errors. */
export async function withRun<T>(
  run: RunTree | null,
  fn: () => Promise<T>,
  getOutput: (result: T) => Record<string, unknown>,
): Promise<T> {
  if (!run) return fn();

  try { await run.postRun(); } catch { /* never block real work */ }

  let result: T;
  try {
    result = await fn();
    try {
      await run.end(getOutput(result));
      await run.patchRun();
    } catch { /* trace failed silently */ }
    return result;
  } catch (err: any) {
    try {
      await run.end({}, err?.message ?? "unknown error");
      await run.patchRun();
    } catch { /* */ }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Prompt versioning                                                   */
/* ------------------------------------------------------------------ */

/**
 * Push the system prompt to LangSmith Hub as a versioned prompt.
 * identifier example: "project-abc123-system"
 * Fails silently — prompt versioning must never break chat.
 */
export async function pushPromptVersion(
  identifier: string,
  systemPrompt: string,
  meta?: { description?: string; tags?: string[] },
): Promise<void> {
  if (!tracingEnabled()) return;
  try {
    await lsClient.pushPrompt(identifier, {
      object: {
        lc: 1,
        type: "constructor",
        id: ["langchain", "prompts", "chat", "ChatPromptTemplate"],
        kwargs: {
          messages: [
            {
              lc: 1,
              type: "constructor",
              id: ["langchain", "prompts", "messages", "SystemMessagePromptTemplate"],
              kwargs: {
                prompt: {
                  lc: 1,
                  type: "constructor",
                  id: ["langchain", "prompts", "prompt", "PromptTemplate"],
                  kwargs: { template: systemPrompt, input_variables: [] },
                },
              },
            },
          ],
        },
      },
      description: meta?.description,
      tags: meta?.tags,
    });
  } catch {
    /* silent — tracing must never break chat */
  }
}
