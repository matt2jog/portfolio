import type { Tool } from "./tool";
import { createRun, withRun } from "./tracing";
import type { RunTree } from "langsmith/run_trees";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AgentYield =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface CompletionChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface CompletionResponse {
  choices: CompletionChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface StreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface StreamChoice {
  delta: StreamDelta;
  finish_reason: string | null;
}

interface StreamChunk {
  choices: StreamChoice[];
}

export interface AgentConfig {
  /** DigitalOcean Gradient model ID */
  modelId: string;
  /** Gradient API token */
  token: string;
  /** System prompt — injected as first message */
  systemPrompt: string;
  /** Tools the agent can invoke */
  tools?: Tool[];
  /** Max sequential tool-call rounds before forcing a text reply (default 6) */
  maxToolRounds?: number;
  /** Max output tokens per completion (default 4096) */
  maxTokens?: number;
  /** Temperature (default 0.7) */
  temperature?: number;
  /** Optional metadata attached to every LangSmith trace */
  tracingMeta?: Record<string, unknown>;
  /** Optional tags attached to every LangSmith trace */
  tracingTags?: string[];
}

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

const GRADIENT_URL = "https://inference.do-ai.run/v1/chat/completions";

export class Agent {
  private readonly config: Required<AgentConfig>;
  private readonly toolMap: Map<string, Tool>;

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
      tools: config.tools ?? [],
      maxToolRounds: config.maxToolRounds ?? 6,
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      tracingMeta: config.tracingMeta ?? {},
      tracingTags: config.tracingTags ?? [],
    };

    this.toolMap = new Map();
    for (const tool of this.config.tools) {
      this.toolMap.set(tool.name, tool);
    }
  }

  /* ---- public API ------------------------------------------------- */

  /**
   * Pre-execute a list of tool calls and return synthetic message pairs
   * (assistant tool_call + tool result) that can be prepended to the
   * user messages before the first LLM turn. This guarantees the model
   * has context without relying on it to decide to call tools first.
   *
   * Usage: const seed = await agent.primeContext([{ name: "get_project_details", args: { project_id: "..." } }])
   *        agent.stream([...seed, ...userMessages])
   */
  async primeContext(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
  ): Promise<ChatMessage[]> {
    const seed: ChatMessage[] = [];
    for (const call of calls) {
      const fakeId = `prime_${call.name}_${Date.now()}`;
      const result = await this.executeTool(
        { id: fakeId, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } },
      );
      // Skip failed tool calls — injecting error results causes the model to
      // hallucinate when the system prompt implies the data was loaded.
      try {
        const parsed = JSON.parse(result);
        if (parsed?.error) continue;
      } catch { /* non-JSON result is fine, include it */ }
      // Inject as a synthetic assistant tool_call + tool result pair
      seed.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: fakeId, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }],
      });
      seed.push({ role: "tool", content: result, tool_call_id: fakeId });
    }
    return seed;
  }

  /**
   * Non-streaming agentic loop. Creates a parent "chain" trace in
   * LangSmith, with each LLM call and tool execution as child runs.
   */
  async run(userMessages: ChatMessage[]): Promise<string> {
    const messages = this.buildMessages(userMessages);

    const parentRun = createRun({
      name: `agent:${this.config.modelId}`,
      runType: "chain",
      inputs: { messages },
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    return withRun(
      parentRun,
      async () => {
        let rounds = 0;

        while (rounds < this.config.maxToolRounds) {
          const response = await this.complete(messages, false, parentRun ?? undefined);
          const choice = response.choices?.[0];
          if (!choice) return "(no response)";

          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
          };
          messages.push(assistantMsg);

          if (!choice.message.tool_calls?.length) {
            return choice.message.content ?? "";
          }

          for (const call of choice.message.tool_calls) {
            const result = await this.executeTool(call, parentRun ?? undefined);
            messages.push({ role: "tool", content: result, tool_call_id: call.id });
          }

          rounds++;
        }

        return this.forceTextReply(messages);
      },
      (result) => ({ output: result }),
    );
  }

  /**
   * Streaming agentic loop. Tool rounds execute non-streaming. The
   * final reply streams as text deltas. The whole conversation is
   * traced as a parent chain run in LangSmith.
   *
   * Yields AgentYield events: tool_call events before each tool executes,
   * then text deltas for the final reply.
   */
  async *stream(userMessages: ChatMessage[]): AsyncGenerator<AgentYield> {
    const messages = this.buildMessages(userMessages);

    const parentRun = createRun({
      name: `agent:${this.config.modelId}`,
      runType: "chain",
      inputs: { messages },
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    if (parentRun) {
      try { await parentRun.postRun(); } catch { /* silent */ }
    }

    let fullOutput = "";
    let error: string | undefined;

    try {
      let rounds = 0;

      while (rounds < this.config.maxToolRounds) {
        const response = await this.complete(messages, false, parentRun ?? undefined);
        const choice = response.choices?.[0];
        if (!choice) return;

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: choice.message.content,
          tool_calls: choice.message.tool_calls,
        };
        messages.push(assistantMsg);

        if (!choice.message.tool_calls?.length) {
          // Model already gave a text reply during the probe — yield it
          if (choice.message.content) {
            fullOutput = choice.message.content;
            yield { type: "text", delta: choice.message.content };
          }
          return;
        }

        for (const call of choice.message.tool_calls) {
          let callArgs: Record<string, unknown>;
          try { callArgs = JSON.parse(call.function.arguments); } catch { callArgs = {}; }
          yield { type: "tool_call", name: call.function.name, args: callArgs };

          const result = await this.executeTool(call, parentRun ?? undefined);
          messages.push({ role: "tool", content: result, tool_call_id: call.id });
        }

        rounds++;
      }

      // Stream the final reply
      for await (const delta of this.streamCompletion(messages, parentRun ?? undefined)) {
        fullOutput += delta;
        yield { type: "text", delta };
      }
    } catch (err: any) {
      error = err?.message ?? "unknown error";
      throw err;
    } finally {
      if (parentRun) {
        try {
          await parentRun.end(
            error ? {} : { output: fullOutput },
            error,
          );
          await parentRun.patchRun();
        } catch { /* silent */ }
      }
    }
  }

  /* ---- internals -------------------------------------------------- */

  private buildMessages(userMessages: ChatMessage[]): ChatMessage[] {
    return [
      { role: "system", content: this.config.systemPrompt },
      ...userMessages,
    ];
  }

  private async complete(
    messages: ChatMessage[],
    stream: false,
    parentRun?: RunTree,
  ): Promise<CompletionResponse> {
    const llmRun = createRun({
      name: this.config.modelId,
      runType: "llm",
      inputs: { messages },
      parent: parentRun,
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    return withRun(
      llmRun,
      async () => {
        const body: Record<string, unknown> = {
          model: this.config.modelId,
          messages,
          max_completion_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          stream: false,
        };

        if (this.config.tools.length > 0) {
          body.tools = this.config.tools.map((t) => t.toJSON());
          body.tool_choice = "auto";
        }

        const res = await fetch(GRADIENT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Gradient ${res.status}: ${text}`);
        }

        return res.json() as Promise<CompletionResponse>;
      },
      (data) => ({
        generations: data.choices?.map((c) => ({ text: c.message.content ?? "" })) ?? [],
        llm_output: { token_usage: data.usage },
      }),
    );
  }

  private async executeTool(call: ToolCall, parentRun?: RunTree): Promise<string> {
    const tool = this.toolMap.get(call.function.name);
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      return JSON.stringify({ error: "Invalid tool arguments JSON" });
    }

    const toolRun = createRun({
      name: call.function.name,
      runType: "tool",
      inputs: args,
      parent: parentRun,
      tags: this.config.tracingTags,
    });

    return withRun(
      toolRun,
      async () => {
        try {
          return await tool.execute(args);
        } catch (err: any) {
          return JSON.stringify({ error: err.message ?? "Tool execution failed" });
        }
      },
      (output) => ({ output }),
    );
  }

  private async forceTextReply(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.modelId,
        messages,
        max_completion_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false,
      }),
    });

    if (!res.ok) return "(failed to generate reply)";
    const data = (await res.json()) as CompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async *streamCompletion(
    messages: ChatMessage[],
    parentRun?: RunTree,
  ): AsyncGenerator<string> {
    // Create an LLM child run for the streaming completion
    const llmRun = createRun({
      name: `${this.config.modelId}:stream`,
      runType: "llm",
      inputs: { messages },
      parent: parentRun,
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    if (llmRun) {
      try { await llmRun.postRun(); } catch { /* silent */ }
    }

    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.modelId,
        messages,
        max_completion_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      }),
    });

    if (!res.ok) {
      if (llmRun) {
        try {
          await llmRun.end({}, `Gradient ${res.status}`);
          await llmRun.patchRun();
        } catch { /* silent */ }
      }
      yield "(error generating response)";
      return;
    }

    const reader = res.body as any;
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    const processLines = function* (raw: string): Generator<string> {
      const lines = raw.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as StreamChunk;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* skip */ }
      }
    };

    try {
      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        for await (const chunk of reader) {
          const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
          buffer += text;
          const lastNewline = buffer.lastIndexOf("\n");
          if (lastNewline === -1) continue;
          const complete = buffer.slice(0, lastNewline + 1);
          buffer = buffer.slice(lastNewline + 1);
          for (const delta of Array.from(processLines(complete))) {
            fullText += delta;
            yield delta;
          }
        }
        if (buffer) {
          for (const delta of Array.from(processLines(buffer))) {
            fullText += delta;
            yield delta;
          }
        }
      } else if (reader && typeof reader.getReader === "function") {
        const r = reader.getReader();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          buffer += text;
          const lastNewline = buffer.lastIndexOf("\n");
          if (lastNewline === -1) continue;
          const complete = buffer.slice(0, lastNewline + 1);
          buffer = buffer.slice(lastNewline + 1);
          for (const delta of Array.from(processLines(complete))) {
            fullText += delta;
            yield delta;
          }
        }
        if (buffer) {
          for (const delta of Array.from(processLines(buffer))) {
            fullText += delta;
            yield delta;
          }
        }
      }

      if (llmRun) {
        try {
          await llmRun.end({ generations: [{ text: fullText }] });
          await llmRun.patchRun();
        } catch { /* silent */ }
      }
    } catch (err: any) {
      if (llmRun) {
        try {
          await llmRun.end({}, err?.message ?? "stream error");
          await llmRun.patchRun();
        } catch { /* silent */ }
      }
      throw err;
    }
  }
}
