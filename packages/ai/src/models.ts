/** Model used to turn free text (queues, emails) into structured tasks. */
export const EXTRACTION_MODEL = "claude-opus-5-5";
/** Cheap model for high-volume yes/no style decisions. */
export const TRIAGE_MODEL = "claude-haiku-5-5";

export type AiModel = typeof EXTRACTION_MODEL | typeof TRIAGE_MODEL;

export interface ModelPrice {
  /** USD per million tokens. Cache writes are billed at 1.25x input. */
  input: number;
  output: number;
  cacheRead: number;
}

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  [EXTRACTION_MODEL]: { input: 4, output: 20, cacheRead: 0.2 },
  [TRIAGE_MODEL]: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // A server-side fallback can answer a refused Opus 5.5 request with one of these.
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/** Estimated cost in USD, or `null` when the model is not in the price table. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const perToken =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    (usage.cacheReadTokens ?? 0) * price.cacheRead +
    (usage.cacheCreationTokens ?? 0) * price.input * CACHE_WRITE_MULTIPLIER;
  return perToken / 1_000_000;
}
