/**
 * What the turn does after the guardrail chain says no.
 *
 * A veto is information, not a dead end: the chain knows exactly what was wrong,
 * and that reason plus the conversation is enough for the agent to write the message
 * again, correctly, without anyone being told to step in. So a block becomes a
 * rewrite by default — never silence, and never the operator's inbox by default.
 *
 * The limits exist because a loop that never gives up is worse than one that does.
 * Each rewrite is another model call, so the conversation's cost ceiling applies to
 * it, and after a couple of failed attempts the problem is no longer this reply — it
 * is the prompt behind it, which is Hermes' job to spot in the gate traces, not
 * something a third attempt will fix.
 */
/**
 * Structurally the same as the guardrail chain's `Remedy`, declared here instead of
 * imported so this file has zero imports and runs byte-identical in Deno and in
 * vitest — the rule `guardrails.ts` and `followups.ts` already follow. A test asserts
 * the two stay assignable, so a class added on one side cannot be forgotten here.
 */
export type Remedy = "rewrite" | "defer" | "stop";

/** Two shots at correcting itself. Measured cost per attempt is ~R$ 0,001. */
export const MAX_REWRITES = 2;

export type NextAction =
  | { kind: "send" }
  | { kind: "rewrite"; instruction: string }
  | { kind: "defer" }
  | { kind: "stop" }
  | { kind: "handoff"; reason: string };

export interface TurnState {
  /** The strictest remedy among the gates that blocked, or null if none did. */
  remedy: Remedy | null;
  /** Rewrites already spent on this turn. */
  rewritesUsed: number;
  spentBrl: number;
  ceilingBrl: number;
  /** Gate details, to hand back to the model as the thing to fix. */
  reasons: readonly string[];
  /** The reply that was vetoed, so the rewrite corrects it instead of starting over. */
  vetoedText: string;
  maxRewrites?: number;
}

/**
 * The instruction that goes back to the model. It carries the veto and the text that
 * earned it, and it forbids the two ways a rewrite goes wrong: telling the customer
 * that something was blocked, and apologising instead of answering.
 */
export const rewriteInstruction = (reasons: readonly string[], vetoedText: string): string =>
  [
    `A sua resposta anterior foi vetada pela verificação da loja e NÃO foi enviada.`,
    `Texto vetado: "${vetoedText}".`,
    `Motivo: ${reasons.join("; ")}.`,
    `Escreva a resposta de novo, respondendo a mesma coisa à cliente, corrigindo exatamente`,
    `esse ponto. Não mencione a verificação, não peça desculpas e não repita o trecho vetado.`,
  ].join(" ");

/**
 * The whole decision, in one place: what happens next given what the chain said, how
 * many rewrites are already spent and what is left of the budget.
 */
export const decideNext = (state: TurnState): NextAction => {
  const { remedy, rewritesUsed, spentBrl, ceilingBrl, reasons, vetoedText } = state;
  const maxRewrites = state.maxRewrites ?? MAX_REWRITES;

  if (remedy === null) return { kind: "send" };
  if (remedy === "stop") return { kind: "stop" };
  if (remedy === "defer") return { kind: "defer" };

  // A rewrite is another model call. No budget for it means there is no rewrite,
  // whatever the attempt count says.
  if (spentBrl >= ceilingBrl) {
    return { kind: "handoff", reason: "teto de custo da conversa antes da reescrita" };
  }
  if (rewritesUsed >= maxRewrites) {
    return {
      kind: "handoff",
      reason: `${maxRewrites} reescritas não passaram na cadeia: ${reasons.join("; ")}`,
    };
  }
  return { kind: "rewrite", instruction: rewriteInstruction(reasons, vetoedText) };
};

/**
 * What the customer hears when the agent runs out of attempts. She gets an answer —
 * that is the point — and it promises only what a human can actually deliver: a reply,
 * not a deadline. Deliberately free of price, delivery window and coupon, so it cannot
 * itself trip the chain it is standing in for.
 */
export const HOLDING_REPLY =
  "Deixa eu confirmar isso certinho pra você e já te respondo por aqui 💛";
