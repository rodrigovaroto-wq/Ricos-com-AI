/**
 * Price table, in USD per 1M tokens. Checked 2026-09-06 against each provider's
 * pricing page. Cost is computed here and nowhere else, so a price change is one
 * edit and every stored cost stays comparable.
 */
export interface ModelPrice {
  provider: "google" | "openai" | "meta";
  inputUsdPerM: number;
  outputUsdPerM: number;
  cachedInputUsdPerM?: number;
  /** True while the model is being used through a provider free tier. */
  freeTier?: boolean;
}

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  // Round 7: the cheap work, and everything during development.
  "gemini-3.5-flash-lite": { provider: "google", inputUsdPerM: 0.3, outputUsdPerM: 2.5 },
  // Round 7 priced gpt-5.6-luna here for the conversation that converts. Replaced
  // 2026-09-10 by muse-spark-1.3 — see HANDOFF.md §Frente 5. The old entry is gone, not
  // kept alongside: this table mirrors what the dev tooling (`src/dev/smoke.ts`) and the
  // Edge Function actually call today, not what either used to call.
  "muse-spark-1.3": { provider: "meta", inputUsdPerM: 1.25, outputUsdPerM: 4.25 },
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
  const brl = +(usd * usdToBrl).toFixed(6);
  // A non-finite cost is worse than a wrong one, and the failure mode is the opposite of
  // the intuitive one: `JSON.stringify` writes Infinity and NaN as `null`, the column
  // stores NULL, the next turn reads `Number(null ?? 0)` — zero — and the conversation
  // cap is rearmed at zero and never fires again. Unlimited spend with no audit trail.
  // `usdToBrl` reaches here from an environment variable (`Number(Deno.env.get(...))`),
  // so a typo is enough to produce NaN. Throw instead: the turn goes to handoff, loudly.
  if (!Number.isFinite(brl)) {
    throw new Error(
      `custo não finito para ${model}: usdToBrl=${usdToBrl}, ` +
        `entrada=${usage.inputTokens}, saída=${usage.outputTokens}`,
    );
  }
  return brl;
};
