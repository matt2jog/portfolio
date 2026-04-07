import { LLMProvider } from "./base";
import type { LLMCompletionParams, CompletionResponse } from "./base";
import { parseSseStream, extractOpenAiDelta } from "./gradient";

/* ------------------------------------------------------------------ */
/*  OpenAI (and OpenAI-compatible) provider                            */
/*                                                                     */
/*  Also works with any OpenAI-compatible endpoint by passing baseUrl. */
/* ------------------------------------------------------------------ */

export class OpenAIApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, detail?: string) {
    super(`OpenAI ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "OpenAIApiError";
    this.status = status;
    this.body = body;
  }
}

function parseOpenAIErrorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as any;
    return parsed?.error?.message ?? parsed?.message ?? undefined;
  } catch {
    return body.trim() || undefined;
  }
}

export class OpenAIProvider extends LLMProvider {
  readonly providerName = "openai";
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * @param apiKey  OpenAI API key (sk-...)
   * @param baseUrl Override to use any OpenAI-compatible endpoint.
   *                Defaults to "https://api.openai.com/v1".
   */
  constructor({
    apiKey,
    baseUrl = "https://api.openai.com/v1",
  }: {
    apiKey: string;
    baseUrl?: string;
  }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  isRateLimitError(err: unknown): boolean {
    if (err instanceof OpenAIApiError) return err.status === 429;
    if (!err || typeof err !== "object") return false;
    const e = err as { status?: unknown; message?: unknown };
    return (
      e.status === 429 ||
      (typeof e.message === "string" && e.message.toLowerCase().includes("rate limit"))
    );
  }

  async complete(params: LLMCompletionParams): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: params.modelId,
      messages: params.messages,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      stream: false,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = params.toolChoice ?? "auto";
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new OpenAIApiError(res.status, text, parseOpenAIErrorDetail(text));
    }

    return res.json() as Promise<CompletionResponse>;
  }

  async *streamCompletion(params: LLMCompletionParams): AsyncGenerator<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.modelId,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new OpenAIApiError(res.status, text, parseOpenAIErrorDetail(text));
    }

    yield* parseSseStream(res.body as any, extractOpenAiDelta);
  }
}
