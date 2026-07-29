import { LLMProvider } from "./base";
import type { LLMCompletionParams, CompletionResponse } from "./base";

/* ------------------------------------------------------------------ */
/*  FallbackProvider                                                    */
/*                                                                     */
/*  Tries the primary provider first. On a rate-limit error, puts that */
/*  specific model on a cooldown and transparently routes to the       */
/*  fallback provider for the remainder of the cooldown window.        */
/*                                                                     */
/*  Rate limits are tracked per-model — a 429 on model A does not      */
/*  affect model B.                                                     */
/* ------------------------------------------------------------------ */

export interface FallbackConfig {
  primary: LLMProvider;
  fallback: LLMProvider;
  /**
   * Maps primary-provider model IDs to fallback-provider model IDs.
   * Required for any model that may be rate-limited.
   */
  modelMap: Record<string, string>;
  /**
   * How long (ms) to avoid the primary for a rate-limited model.
   * Default: 1 hour (3_600_000 ms).
   */
  cooldownMs?: number;
}

export class FallbackProvider extends LLMProvider {
  readonly providerName: string;
  private readonly primary: LLMProvider;
  private readonly fallback: LLMProvider;
  private readonly modelMap: Record<string, string>;
  private readonly cooldownMs: number;
  /** modelId → timestamp at which the cooldown expires */
  private readonly cooldowns = new Map<string, number>();

  constructor(config: FallbackConfig) {
    super();
    this.primary = config.primary;
    this.fallback = config.fallback;
    this.modelMap = config.modelMap;
    this.cooldownMs = config.cooldownMs ?? 3_600_000;
    this.providerName = `${config.primary.providerName}→${config.fallback.providerName}`;
  }

  isRateLimitError(err: unknown): boolean {
    return this.primary.isRateLimitError(err) || this.fallback.isRateLimitError(err);
  }

  /* ---- cooldown helpers ------------------------------------------- */

  private isCoolingDown(modelId: string): boolean {
    const expiry = this.cooldowns.get(modelId);
    if (expiry === undefined) return false;
    if (Date.now() >= expiry) {
      this.cooldowns.delete(modelId);
      return false;
    }
    return true;
  }

  private setCooldown(modelId: string): void {
    const expiry = Date.now() + this.cooldownMs;
    this.cooldowns.set(modelId, expiry);
    const minutes = Math.round(this.cooldownMs / 60_000);
    console.warn(JSON.stringify({
      event: "portfolio.ai.provider_cooldown",
      failure_code: "provider_rate_limited",
      primary_provider: this.primary.providerName,
      fallback_provider: this.fallback.providerName,
      model_id: modelId,
      cooldown_minutes: minutes,
    }));
  }

  private asFallbackParams(params: LLMCompletionParams): LLMCompletionParams {
    const mapped = this.modelMap[params.modelId];
    if (!mapped) {
      throw new Error(
        `[FallbackProvider] No fallback model mapped for "${params.modelId}". ` +
        `Add an entry to GRADIENT_TO_FIREWORKS_MODEL_MAP in routes.ts.`,
      );
    }
    return { ...params, modelId: mapped };
  }

  /* ---- LLMProvider interface -------------------------------------- */

  async complete(params: LLMCompletionParams): Promise<CompletionResponse> {
    if (!this.isCoolingDown(params.modelId)) {
      try {
        return await this.primary.complete(params);
      } catch (err) {
        if (this.primary.isRateLimitError(err)) {
          this.setCooldown(params.modelId);
          // fall through to fallback
        } else {
          throw err;
        }
      }
    }
    return this.fallback.complete(this.asFallbackParams(params));
  }

  async *streamCompletion(params: LLMCompletionParams): AsyncGenerator<string> {
    if (!this.isCoolingDown(params.modelId)) {
      let yieldedAny = false;
      try {
        for await (const delta of this.primary.streamCompletion(params)) {
          yieldedAny = true;
          yield delta;
        }
        return;
      } catch (err) {
        // Only fall through to fallback if nothing was streamed yet (rate
        // limit errors always arrive before the first token).
        if (!yieldedAny && this.primary.isRateLimitError(err)) {
          this.setCooldown(params.modelId);
        } else {
          throw err;
        }
      }
    }
    yield* this.fallback.streamCompletion(this.asFallbackParams(params));
  }
}
