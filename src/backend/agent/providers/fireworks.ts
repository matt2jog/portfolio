import { LLMProvider } from "./base";
import type { LLMCompletionParams, CompletionResponse } from "./base";
import { parseSseStream, extractOpenAiDelta } from "./gradient";

/* ------------------------------------------------------------------ */
/*  Fireworks.ai provider                                              */
/*                                                                     */
/*  Uses the OpenAI-compatible chat completions endpoint.              */
/*  Model IDs follow the format: accounts/fireworks/models/<name>      */
/* ------------------------------------------------------------------ */

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

export class FireworksApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, detail?: string) {
    super(`Fireworks ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "FireworksApiError";
    this.status = status;
    this.body = body;
  }
}

function parseFireworksErrorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as any;
    return parsed?.error?.message ?? parsed?.message ?? parsed?.detail ?? undefined;
  } catch {
    return body.trim() || undefined;
  }
}

export class FireworksProvider extends LLMProvider {
  readonly providerName = "fireworks";
  private readonly apiKey: string;

  constructor({ apiKey }: { apiKey: string }) {
    super();
    this.apiKey = apiKey;
  }

  isRateLimitError(err: unknown): boolean {
    if (err instanceof FireworksApiError) return err.status === 429;
    if (!err || typeof err !== "object") return false;
    const e = err as { status?: unknown; message?: unknown };
    return (
      e.status === 429 ||
      (typeof e.message === "string" && (
        e.message.includes("Fireworks 429") ||
        e.message.toLowerCase().includes("rate limit")
      ))
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

    const res = await fetch(FIREWORKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new FireworksApiError(res.status, text, parseFireworksErrorDetail(text));
    }

    return res.json() as Promise<CompletionResponse>;
  }

  async *streamCompletion(params: LLMCompletionParams): AsyncGenerator<string> {
    const res = await fetch(FIREWORKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
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
      throw new FireworksApiError(res.status, text, parseFireworksErrorDetail(text));
    }

    yield* parseSseStream(res.body as any, extractOpenAiDelta);
  }
}
