// Rates checked in the slice-3a decision log on 2026-09-16 (USD / million tokens).
// Hardcoded intentionally; review these when changing models or provider prices.
const rates: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export function estimateCost(model: string, usage: {
  inputTokens: number; outputTokens: number; cachedTokens: number;
}): number {
  const rate = Object.hasOwn(rates, model) ? rates[model] : undefined;
  if (!rate) throw new Error("No cost rates configured for the selected model.");
  for (const value of Object.values(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid model token usage.");
  }
  // Anthropic input_tokens excludes cache reads; do not subtract them again.
  return (usage.inputTokens * rate.input + usage.outputTokens * rate.output
    + usage.cachedTokens * rate.input * 0.1) / 1_000_000;
}
