/**
 * Price table, in USD per 1M tokens. Checked 2026-09-06 against each provider's
 * pricing page. Cost is computed here and nowhere else, so a price change is one
 * edit and every stored cost stays comparable.
 */
export interface ModelPrice {
  provider: "google" | "openai";
  inputUsdPerM: number;
  outputUsdPerM: number;
  cachedInputUsdPerM?: number;
  /** True while the model is being used through a provider free tier. */
  freeTier?: boolean;
}

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  // Round 7: the cheap work, and everything during development.
  "gemini-3.5-flash-lite": { provider: "google", inputUsdPerM: 0.3, outputUsdPerM: 2.5 },
  // Round 7: the conversation that converts.
  "gpt-5.6-luna": { provider: "openai", inputUsdPerM: 0.2, outputUsdPerM: 1.2, cachedInputUsdPerM: 0.02 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export const costBrl = (model: string, usage: Usage, usdToBrl: number): number => {
  const price = PRICES[model];
  if (!price) throw new Error(`modelo sem preço configurado: ${model}`);
  if (price.freeTier) return 0;

  const cached = usage.cachedTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const cachedRate = price.cachedInputUsdPerM ?? price.inputUsdPerM;

  const usd =
    (fresh * price.inputUsdPerM + cached * cachedRate + usage.outputTokens * price.outputUsdPerM) /
    1_000_000;
  return +(usd * usdToBrl).toFixed(6);
};
