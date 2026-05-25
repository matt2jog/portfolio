// Fixed 1-hour sliding window for output tokens across all project-chat requests.
// In-memory only — resets on restart, which is an acceptable trade-off for a soft limit.

const LIMIT_TOKENS = 1_000_000;
const WINDOW_MS = 60 * 60 * 1_000; // 1 hour

let windowStart = Date.now();
let usedTokens = 0;

function tickWindow(): void {
  if (Date.now() - windowStart >= WINDOW_MS) {
    windowStart = Date.now();
    usedTokens = 0;
  }
}

export interface TokenCapacityCheck {
  ok: boolean;
  usedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  resetsAt: Date;
}

export function checkOutputTokenCapacity(): TokenCapacityCheck {
  tickWindow();
  return {
    ok: usedTokens < LIMIT_TOKENS,
    usedTokens,
    limitTokens: LIMIT_TOKENS,
    remainingTokens: Math.max(0, LIMIT_TOKENS - usedTokens),
    resetsAt: new Date(windowStart + WINDOW_MS),
  };
}

// Call after a chat response is fully sent.
// Estimate from character count when the provider doesn't return usage data
// (streaming path). Rule of thumb: ~3.5 chars per output token.
export function recordOutputTokens(n: number): void {
  tickWindow();
  usedTokens += Math.max(0, n);
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 3.5);
}
