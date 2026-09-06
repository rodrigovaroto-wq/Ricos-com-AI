import { costBrl, type Usage } from "./pricing.js";

/**
 * The single seam every model call passes through.
 *
 * Two things happen here and nowhere else: the budget is checked **before** a byte
 * leaves for the provider, and the cost is recorded after. A conversation that would
 * cross the ceiling becomes a human handoff instead of degrading in silence.
 */
export type Role = "conversation" | "cheap";

export interface LlmRequest {
  /** What this call is for — stored, so cost can be read per purpose later. */
  purpose: string;
  system: string;
  messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens?: number;
}

export interface ProviderResult {
  text: string;
  usage: Usage;
}

export interface Provider {
  model: string;
  complete: (request: LlmRequest) => Promise<ProviderResult>;
}

export interface CallRecord {
  purpose: string;
  model: string;
  usage: Usage;
  costBrl: number;
  latencyMs: number;
}

export class BudgetExceededError extends Error {
  constructor(readonly spentBrl: number, readonly ceilingBrl: number) {
    super(`teto de custo da conversa atingido: R$ ${spentBrl.toFixed(4)} de R$ ${ceilingBrl.toFixed(2)}`);
    this.name = "BudgetExceededError";
  }
}

export interface SeamOptions {
  providers: Readonly<Record<Role, Provider>>;
  usdToBrl: number;
  /** Cap plus tolerance — see costCeilingBrl in config/business. */
  ceilingBrl: number;
  record: (call: CallRecord) => Promise<void> | void;
  now?: () => number;
}

export interface Seam {
  call: (role: Role, request: LlmRequest, spentSoFarBrl: number) => Promise<{ text: string; costBrl: number }>;
}

export const createSeam = (options: SeamOptions): Seam => {
  const now = options.now ?? (() => Date.now());

  return {
    async call(role, request, spentSoFarBrl) {
      if (spentSoFarBrl >= options.ceilingBrl) {
        throw new BudgetExceededError(spentSoFarBrl, options.ceilingBrl);
      }

      const provider = options.providers[role];
      const started = now();
      const result = await provider.complete(request);
      const cost = costBrl(provider.model, result.usage, options.usdToBrl);

      await options.record({
        purpose: request.purpose,
        model: provider.model,
        usage: result.usage,
        costBrl: cost,
        latencyMs: now() - started,
      });

      return { text: result.text, costBrl: cost };
    },
  };
};
