import type { Tool } from "./tool";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  /** Max output tokens per completion (default 1024) */
  maxTokens?: number;
  /** Temperature (default 0.7) */
  temperature?: number;
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
      maxTokens: config.maxTokens ?? 1024,
      temperature: config.temperature ?? 0.7,
    };

    this.toolMap = new Map();
    for (const tool of this.config.tools) {
      this.toolMap.set(tool.name, tool);
    }
  }

  /* ---- public API ------------------------------------------------- */

  /**
   * Run a non-streaming agentic loop: send messages → if the model
   * requests tool calls, execute them and loop. Returns the final
   * assistant text message.
   */
  async run(userMessages: ChatMessage[]): Promise<string> {
    const messages = this.buildMessages(userMessages);
    let rounds = 0;

    while (rounds < this.config.maxToolRounds) {
      const response = await this.complete(messages, false) as CompletionResponse;
      const choice = response.choices?.[0];
      if (!choice) return "(no response)";

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      };
      messages.push(assistantMsg);

      // If no tool calls, we're done
      if (!choice.message.tool_calls?.length) {
        return choice.message.content ?? "";
      }

      // Execute each tool call and append results
      for (const call of choice.message.tool_calls) {
        const result = await this.executeTool(call);
        messages.push({
          role: "tool",
          content: result,
          tool_call_id: call.id,
        });
      }

      rounds++;
    }

    // Exhausted tool rounds — force a text-only completion
    return this.forceTextReply(messages);
  }

  /**
   * Run a streaming agentic loop. Yields text deltas for the FINAL
   * assistant reply. Tool rounds execute non-streaming internally,
   * then the last reply streams to the caller.
   */
  async *stream(userMessages: ChatMessage[]): AsyncGenerator<string> {
    const messages = this.buildMessages(userMessages);
    let rounds = 0;

    // Run tool rounds non-streaming until the model produces a text reply
    while (rounds < this.config.maxToolRounds) {
      const response = await this.complete(messages, false) as CompletionResponse;
      const choice = response.choices?.[0];
      if (!choice) return;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      };
      messages.push(assistantMsg);

      if (!choice.message.tool_calls?.length) {
        // Model gave a text reply during non-streaming probe — yield it
        if (choice.message.content) yield choice.message.content;
        return;
      }

      for (const call of choice.message.tool_calls) {
        const result = await this.executeTool(call);
        messages.push({
          role: "tool",
          content: result,
          tool_call_id: call.id,
        });
      }

      rounds++;
    }

    // All tool rounds done (or exhausted) — now stream the final reply
    yield* this.streamCompletion(messages);
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
  ): Promise<CompletionResponse>;
  private async complete(
    messages: ChatMessage[],
    stream: boolean,
  ): Promise<CompletionResponse | Response> {
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages,
      max_completion_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream,
    };

    if (this.config.tools.length > 0) {
      body.tools = this.config.tools.map((t) => t.toJSON());
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

    if (stream) return res;
    return res.json() as Promise<CompletionResponse>;
  }

  private async executeTool(call: ToolCall): Promise<string> {
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

    try {
      return await tool.execute(args);
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? "Tool execution failed" });
    }
  }

  private async forceTextReply(messages: ChatMessage[]): Promise<string> {
    // Strip tools so the model can only produce text
    const body = {
      model: this.config.modelId,
      messages,
      max_completion_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return "(failed to generate reply)";
    const data = (await res.json()) as CompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async *streamCompletion(messages: ChatMessage[]): AsyncGenerator<string> {
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages,
      max_completion_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    // No tools for the final streaming pass — we want pure text
    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield "(error generating response)";
      return;
    }

    const reader = res.body as any;
    const decoder = new TextDecoder();
    let buffer = "";

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
        } catch {
          // skip
        }
      }
    };

    if (reader && typeof reader[Symbol.asyncIterator] === "function") {
      for await (const chunk of reader) {
        const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        buffer += text;
        const lastNewline = buffer.lastIndexOf("\n");
        if (lastNewline === -1) continue;
        const complete = buffer.slice(0, lastNewline + 1);
        buffer = buffer.slice(lastNewline + 1);
        yield* processLines(complete);
      }
      if (buffer) yield* processLines(buffer);
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
        yield* processLines(complete);
      }
      if (buffer) yield* processLines(buffer);
    }
  }
}
