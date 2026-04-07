import { LLMProvider } from "./base";
import type { LLMCompletionParams, CompletionResponse, StreamChunk } from "./base";

/* ------------------------------------------------------------------ */
/*  Gradient (DigitalOcean AI) provider                                */
/* ------------------------------------------------------------------ */

const GRADIENT_URL = "https://inference.do-ai.run/v1/chat/completions";

export class GradientApiError extends Error {
  readonly status: number;
  readonly errcode?: number | string;
  readonly body: string;

  constructor(status: number, body: string, errcode?: number | string, detail?: string) {
    super(`Gradient ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "GradientApiError";
    this.status = status;
    this.errcode = errcode;
    this.body = body;
  }
}

function parseGradientErrorPayload(body: string): { errcode?: number | string; detail?: string } {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as any;
    const errcode =
      parsed?.errcode ?? parsed?.code ?? parsed?.error?.errcode ?? parsed?.error?.code;
    const detail =
      parsed?.error?.message ??
      parsed?.message ??
      parsed?.detail ??
      (typeof parsed?.error === "string" ? parsed.error : undefined);
    return { errcode, detail: typeof detail === "string" ? detail : undefined };
  } catch {
    return { detail: body.trim() || undefined };
  }
}

export class GradientProvider extends LLMProvider {
  readonly providerName = "gradient";
  private readonly token: string;

  constructor({ token }: { token: string }) {
    super();
    this.token = token;
  }

  isRateLimitError(err: unknown): boolean {
    if (err instanceof GradientApiError) {
      return err.status === 429 || err.errcode === 429 || err.errcode === "429";
    }
    if (!err || typeof err !== "object") return false;
    const e = err as { status?: unknown; errcode?: unknown; message?: unknown };
    return (
      e.status === 429 ||
      e.errcode === 429 ||
      e.errcode === "429" ||
      (typeof e.message === "string" && e.message.includes("Gradient 429"))
    );
  }

  async complete(params: LLMCompletionParams): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: params.modelId,
      messages: params.messages,
      max_completion_tokens: params.maxTokens,
      temperature: params.temperature,
      stream: false,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = params.toolChoice ?? "auto";
    }

    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const { errcode, detail } = parseGradientErrorPayload(text);
      throw new GradientApiError(res.status, text, errcode, detail);
    }

    return res.json() as Promise<CompletionResponse>;
  }

  async *streamCompletion(params: LLMCompletionParams): AsyncGenerator<string> {
    const res = await fetch(GRADIENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.modelId,
        messages: params.messages,
        max_completion_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const { errcode, detail } = parseGradientErrorPayload(text);
      throw new GradientApiError(res.status, text, errcode, detail);
    }

    yield* parseSseStream(res.body as any, extractOpenAiDelta);
  }
}

/* ------------------------------------------------------------------ */
/*  SSE parsing helpers (also used by OpenAIProvider)                  */
/* ------------------------------------------------------------------ */

export function extractOpenAiDelta(data: string): string | null {
  if (data === "[DONE]") return null;
  try {
    const chunk = JSON.parse(data) as StreamChunk;
    return chunk.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export async function* parseSseStream(
  body: any,
  extractDelta: (data: string) => string | null,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  function* processLines(raw: string): Generator<string> {
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      const delta = extractDelta(data);
      if (delta) yield delta;
    }
  }

  function flushBuffer(buf: string): [string[], string] {
    const lastNewline = buf.lastIndexOf("\n");
    if (lastNewline === -1) return [[], buf];
    const complete = buf.slice(0, lastNewline + 1);
    const remaining = buf.slice(lastNewline + 1);
    return [Array.from(processLines(complete)), remaining];
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
    for (const d of Array.from(processLines(buffer))) yield d;
  }
}
