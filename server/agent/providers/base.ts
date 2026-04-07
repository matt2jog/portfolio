/* ------------------------------------------------------------------ */
/*  Shared LLM protocol types                                          */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface CompletionChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

export interface CompletionResponse {
  choices: CompletionChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface StreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

export interface StreamChoice {
  delta: StreamDelta;
  finish_reason: string | null;
}

export interface StreamChunk {
  choices: StreamChoice[];
}

export interface ToolDefinitionShape {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMCompletionParams {
  messages: ChatMessage[];
  modelId: string;
  maxTokens: number;
  temperature: number;
  /** Pre-serialised tool definitions in OpenAI function format */
  tools?: Array<{ type: "function"; function: ToolDefinitionShape }>;
  toolChoice?: "auto" | "none";
}

/* ------------------------------------------------------------------ */
/*  Abstract provider                                                   */
/* ------------------------------------------------------------------ */

export abstract class LLMProvider {
  abstract readonly providerName: string;

  readonly rateLimitMessage = "AI is temporarily rate limited. Please try again later.";

  /** Non-streaming single completion. */
  abstract complete(params: LLMCompletionParams): Promise<CompletionResponse>;

  /** Streaming completion — yields raw text deltas. */
  abstract streamCompletion(params: LLMCompletionParams): AsyncGenerator<string>;

  /** Returns true if the thrown error represents a provider rate-limit. */
  abstract isRateLimitError(err: unknown): boolean;
}
