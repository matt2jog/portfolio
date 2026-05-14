import { LLMProvider } from "./base";
import type {
  LLMCompletionParams,
  CompletionResponse,
  ChatMessage,
  ToolCall,
} from "./base";

/* ------------------------------------------------------------------ */
/*  Anthropic Messages API provider                                    */
/*                                                                     */
/*  Adapts Anthropic's format (separate system field, content blocks,  */
/*  tool_use/tool_result types) to the OpenAI-compatible interface     */
/*  used by the rest of the agent.                                     */
/* ------------------------------------------------------------------ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, detail?: string) {
    super(`Anthropic ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "AnthropicApiError";
    this.status = status;
    this.body = body;
  }
}

function parseAnthropicErrorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as any;
    return parsed?.error?.message ?? parsed?.message ?? undefined;
  } catch {
    return body.trim() || undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Request adaptation: OpenAI-format → Anthropic                      */
/* ------------------------------------------------------------------ */

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  temperature: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  stream?: boolean;
}

function toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: AnthropicMessage[] } {
  let system: string | undefined;
  const out: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content ?? "";
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.tool_calls?.length) {
        out.push({
          role: "assistant",
          content: msg.tool_calls.map((tc) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.function.name,
            input: (() => {
              try { return JSON.parse(tc.function.arguments) as Record<string, unknown>; }
              catch { return {}; }
            })(),
          })),
        });
      } else {
        out.push({ role: "assistant", content: msg.content ?? "" });
      }
      continue;
    }

    if (msg.role === "tool") {
      const toolResult: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? "",
        content: msg.content ?? "",
      };
      // Anthropic requires tool results inside a user turn. Merge with the
      // previous user turn if it already contains tool_result blocks,
      // otherwise open a new user turn.
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) {
        last.content.push(toolResult);
      } else {
        out.push({ role: "user", content: [toolResult] });
      }
      continue;
    }

    // role === "user"
    out.push({ role: "user", content: msg.content ?? "" });
  }

  // Anthropic requires messages to start with a user turn.
  if (out.length > 0 && out[0].role !== "user") {
    out.unshift({ role: "user", content: "(start)" });
  }

  return { system, messages: out };
}

function toAnthropicTools(
  tools: LLMCompletionParams["tools"],
): AnthropicTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name as string,
    description: t.function.description as string | undefined,
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>,
  }));
}

/* ------------------------------------------------------------------ */
/*  Response adaptation: Anthropic → OpenAI-format                     */
/* ------------------------------------------------------------------ */

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | string;
  usage: { input_tokens: number; output_tokens: number };
}

function fromAnthropicResponse(response: AnthropicResponse): CompletionResponse {
  const text = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  const toolCalls: ToolCall[] = response.content
    .filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use",
    )
    .map((b) => ({
      id: b.id,
      type: "function" as const,
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
        finish_reason: response.stop_reason === "tool_use" ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: response.usage?.input_tokens,
      completion_tokens: response.usage?.output_tokens,
      total_tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Provider class                                                      */
/* ------------------------------------------------------------------ */

export class AnthropicProvider extends LLMProvider {
  readonly providerName = "anthropic";
  private readonly apiKey: string;

  constructor({ apiKey }: { apiKey: string }) {
    super();
    this.apiKey = apiKey;
  }

  isRateLimitError(err: unknown): boolean {
    if (err instanceof AnthropicApiError) return err.status === 429;
    if (!err || typeof err !== "object") return false;
    const e = err as { status?: unknown; message?: unknown };
    return (
      e.status === 429 ||
      (typeof e.message === "string" && e.message.toLowerCase().includes("rate limit"))
    );
  }

  async complete(params: LLMCompletionParams): Promise<CompletionResponse> {
    const { system, messages } = toAnthropicMessages(params.messages);

    const body: AnthropicRequest = {
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages,
    };

    if (system) body.system = system;

    const anthropicTools = toAnthropicTools(params.tools);
    if (anthropicTools) body.tools = anthropicTools;

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new AnthropicApiError(res.status, text, parseAnthropicErrorDetail(text));
    }

    const raw = (await res.json()) as AnthropicResponse;
    return fromAnthropicResponse(raw);
  }

  async *streamCompletion(params: LLMCompletionParams): AsyncGenerator<string> {
    const { system, messages } = toAnthropicMessages(params.messages);

    const body: AnthropicRequest = {
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages,
      stream: true,
    };

    if (system) body.system = system;

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new AnthropicApiError(res.status, text, parseAnthropicErrorDetail(text));
    }

    yield* this.parseAnthropicStream(res.body as any);
  }

  private async *parseAnthropicStream(body: any): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = "";

    function* extractDeltas(raw: string): Generator<string> {
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        try {
          const event = JSON.parse(data) as any;
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta?.text
          ) {
            yield event.delta.text as string;
          }
        } catch { /* skip */ }
      }
    }

    function flushBuffer(buf: string): [string[], string] {
      const lastNewline = buf.lastIndexOf("\n");
      if (lastNewline === -1) return [[], buf];
      const complete = buf.slice(0, lastNewline + 1);
      const remaining = buf.slice(lastNewline + 1);
      return [Array.from(extractDeltas(complete)), remaining];
    }

    if (body && typeof body[Symbol.asyncIterator] === "function") {
      for await (const chunk of body) {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        const [deltas, remaining] = flushBuffer(buffer);
        buffer = remaining;
        for (const d of deltas) yield d;
      }
    } else if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const [deltas, remaining] = flushBuffer(buffer);
        buffer = remaining;
        for (const d of deltas) yield d;
      }
    }

    if (buffer) {
      for (const d of Array.from(extractDeltas(buffer))) yield d;
    }
  }
}
