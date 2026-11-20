import { describe, expect, it } from "vitest";
import { EXTRACTION_MODEL, TRIAGE_MODEL, estimateCostUsd } from "./models.js";

describe("estimateCostUsd", () => {
  it("prices Opus 5.5 input, output, cache reads and cache writes", () => {
    const cost = estimateCostUsd(EXTRACTION_MODEL, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });
    // 4 + 20 + 0.20 + 4 * 1.25
    expect(cost).toBeCloseTo(29.2, 10);
  });

  it("prices Haiku 5.5", () => {
    expect(estimateCostUsd(TRIAGE_MODEL, { inputTokens: 2_000_000, outputTokens: 1_000_000 })).toBeCloseTo(
      0.7,
      10,
    );
  });

  it("returns null for a model it has no price for", () => {
    expect(estimateCostUsd("claude-unknown", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});
