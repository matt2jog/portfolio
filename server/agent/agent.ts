import type { Tool } from "./tool";
import { createRun, withRun } from "./tracing";
import type { RunTree } from "langsmith/run_trees";
import type { LLMProvider, ChatMessage, CompletionResponse, ToolCall, LLMCompletionParams } from "./providers/base";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AgentYield =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> };

export interface AgentConfig {
  /** Optional custom run name (defaults to agent:{modelId}) */
  name?: string;
  /** LLM provider instance (e.g. new GradientProvider({ token }) */
  provider: LLMProvider;
  /** Model ID passed to the provider on every completion call */
  modelId: string;
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

// Re-export ChatMessage so callers don't need two import paths
export type { ChatMessage };

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

export class Agent {
  private readonly config: Required<AgentConfig>;
  private readonly toolMap: Map<string, Tool>;

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
      name: config.name ?? `agent:${config.modelId}`,
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

  /** Delegate rate-limit detection to the underlying provider. */
  isRateLimitError(err: unknown): boolean {
    return this.config.provider.isRateLimitError(err);
  }

  /** Provider-specific user-facing rate-limit message. */
  get rateLimitMessage(): string {
    return this.config.provider.rateLimitMessage;
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
      const result = await this.executeTool({
        id: fakeId,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      });
      // Skip failed tool calls — injecting error results causes the model to
      // hallucinate when the system prompt implies the data was loaded.
      try {
        const parsed = JSON.parse(result);
        if (parsed?.error) continue;
      } catch { /* non-JSON result is fine, include it */ }
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
  async run(userMessages: ChatMessage[], parentRun?: RunTree): Promise<string> {
    const messages = this.buildMessages(userMessages);

    const run = createRun({
      name: `agent:${this.config.modelId}`,
      runType: "chain",
      inputs: { messages },
      parent: parentRun,
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    return withRun(
      run,
      async () => {
        let rounds = 0;

        while (rounds < this.config.maxToolRounds) {
          const response = await this.complete(messages, run ?? undefined);
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
            const result = await this.executeTool(call, run ?? undefined);
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
  async *stream(userMessages: ChatMessage[], parentRun?: RunTree): AsyncGenerator<AgentYield> {
    const messages = this.buildMessages(userMessages);

    const run = createRun({
      name: `agent:${this.config.modelId}`,
      runType: "chain",
      inputs: { messages },
      parent: parentRun,
      tags: this.config.tracingTags,
      metadata: this.config.tracingMeta,
    });

    if (run) {
      try { await run.postRun(); } catch { /* silent */ }
    }

    let fullOutput = "";
    let error: string | undefined;

    try {
      let rounds = 0;

      while (rounds < this.config.maxToolRounds) {
        const response = await this.complete(messages, run ?? undefined);
        const choice = response.choices?.[0];
        if (!choice) return;

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: choice.message.content,
          tool_calls: choice.message.tool_calls,
        };
        messages.push(assistantMsg);

        if (!choice.message.tool_calls?.length) {
          if (choice.message.content) {
            fullOutput = choice.message.content;
            yield { type: "text", delta: choice.message.content };
          }
          return;
        }

        for (const call of choice.message.tool_calls) {
          let callArgs: Record<string, unknown>;
          try {
            callArgs = typeof call.function.arguments === "string"
              ? JSON.parse(call.function.arguments)
              : call.function.arguments;
          } catch { callArgs = {}; }
          yield { type: "tool_call", name: call.function.name, args: callArgs };

          const result = await this.executeTool(call, run ?? undefined);
          messages.push({ role: "tool", content: result, tool_call_id: call.id });
        }

        rounds++;
      }

      // Stream the final reply
      for await (const delta of this.streamCompletion(messages, run ?? undefined)) {
        fullOutput += delta;
        yield { type: "text", delta };
      }
    } catch (err: any) {
      error = err?.message ?? "unknown error";
      throw err;
    } finally {
      if (run) {
        try {
          await run.end(
            error ? {} : { output: fullOutput },
            error,
          );
          await run.patchRun();
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
        const tools = this.config.tools.length > 0
          ? (this.config.tools.map((t) => t.toJSON()) as LLMCompletionParams["tools"])
          : undefined;

        return this.config.provider.complete({
          messages,
          modelId: this.config.modelId,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools,
          toolChoice: tools ? "auto" : undefined,
        });
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
    const response = await this.config.provider.complete({
      messages,
      modelId: this.config.modelId,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });
    return response.choices?.[0]?.message?.content ?? "";
  }

  private async *streamCompletion(
    messages: ChatMessage[],
    parentRun?: RunTree,
  ): AsyncGenerator<string> {
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

    let fullText = "";

    try {
      for await (const delta of this.config.provider.streamCompletion({
        messages,
        modelId: this.config.modelId,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      })) {
        fullText += delta;
        yield delta;
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
