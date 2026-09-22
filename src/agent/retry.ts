/**
 * What the turn does after the guardrail chain says no.
 *
 * A veto is information, not a dead end: the chain knows exactly what was wrong, and
 * that reason plus the conversation is enough for the agent to write the message again,
 * correctly, without anyone being told to step in. So a block becomes a rewrite — never
 * silence, and never the operator's inbox.
 *
 * **A veto never ends in handoff any more** (operator, 2026-09-08). Two things were
 * wrong with that. It spent model calls guessing its way past a rule the agent was
 * never told — the rules now travel in the system prompt, as `gateBriefing`, so the
 * agent writes inside them instead of discovering them by refusal. And it handed a
 * person a conversation for a reason that was never the customer's problem: she asked
 * something ordinary and the agent phrased its answer badly. She gets an answer either
 * way, so the exhausted case sends `SAFE_FALLBACK_REPLY` — a real reply that keeps the
 * conversation alive — and the conversation stays with the agent.
 *
 * One rewrite remains, and only one. With the brief in the prompt a veto is the rare
 * case, not the loop, and a second correction attempt buys far less than it costs. The
 * gates that keep firing across attempts are a prompt problem — Hermes' material, read
 * from `gate_traces` — and never something a third try fixes.
 *
 * Handoff still exists, for the three reasons that are not about wording: she asked for
 * a person in so many words, the conversation hit its cost ceiling, or the provider
 * failed.
 */

/**
 * Structurally the same as the guardrail chain's `Remedy`, declared here instead of
 * imported so this file has zero imports and runs byte-identical in Deno and in
 * vitest — the rule `guardrails.ts` and `followups.ts` already follow. A test asserts
 * the two stay assignable, so a class added on one side cannot be forgotten here.
 */
export type Remedy = "rewrite" | "defer" | "stop";

/**
 * One shot at correcting itself, down from two. The brief is in the prompt now: a gate
 * that still blocks after the agent was told the rule is not a wording accident a third
 * draft resolves, and each attempt is a paid model call (~R$ 0,001) spent on a reply
 * the customer never sees.
 */
export const MAX_REWRITES = 1;

export type NextAction =
  | { kind: "send" }
  | { kind: "rewrite"; instruction: string }
  | { kind: "defer" }
  | { kind: "stop" }
  /** The rewrite did not pass. She still gets answered, and nobody is called. */
  | { kind: "fallback"; reason: string }
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
    // Not a handoff: a badly phrased answer is the agent's problem to route around, not
    // a person's to inherit. The trace carries the gate, which is what Hermes reads.
    return {
      kind: "fallback",
      reason: `${maxRewrites} reescrita não passou na cadeia: ${reasons.join("; ")}`,
    };
  }
  return { kind: "rewrite", instruction: rewriteInstruction(reasons, vetoedText) };
};

/**
 * What she hears when the rewrite did not pass — and it is a real reply, not a stall.
 *
 * The conversation stays with the agent, so this has to move it forward: it hands the
 * turn back to her with a live question, which is the one thing that keeps a WhatsApp
 * thread alive. It names no price, no deadline, no warranty and no number, so it cannot
 * trip the chain it is standing in for — a fallback that can itself be vetoed is not a
 * fallback. A test asserts it passes every gate.
 */
export const SAFE_FALLBACK_REPLY =
  "Deixa eu te ajudar do jeito certo: me conta o que é mais importante pra você agora — " +
  "acertar o tamanho, ou entender como o colete funciona no dia a dia? 💛";

/**
 * What the customer hears when the turn hits a wall that is not about wording: the cost
 * ceiling, or a provider that failed. She gets an answer — that is the point — and it
 * promises only what a human can actually deliver: a reply, not a deadline. Deliberately
 * free of price, delivery window and coupon, so it cannot itself trip the chain.
 */
export const HOLDING_REPLY =
  "Deixa eu confirmar isso certinho pra você e já te respondo por aqui 💛";

/**
 * When she asks for a person (§Q12). It confirms without pretending: nobody is on the
 * line yet, so it promises a callback rather than a transfer that has no one at the
 * other end. Same constraint as the holding reply — no price, deadline or coupon — so
 * the one message the agent must always be able to send can never be vetoed.
 */
export const HUMAN_HANDOFF_REPLY =
  "Claro! Já estou chamando alguém do time pra falar com você por aqui 💛";

/**
 * Estágio 0 — the receipt every brand-new lead gets, 24/7, before the agent has said a
 * word. Same class as the two replies above: fixed text, never the model, layer "auto"
 * so the hours gate does not apply (R4.4). Approved by the operator on 2026-09-21,
 * spacing included — the paragraph breaks are the approved text, not formatting.
 *
 * It answers nothing about her message; it exists to be honest that a person has not
 * replied yet, in a channel where silence reads as ignored. Sent once per lead, never
 * repeated — a lead that already has a conversation is not new, and does not see it
 * again on her second message.
 */
export const WELCOME_AUTO_REPLY =
  "Oii, tudo bem?\n\n" +
  "Recebemos sua mensagem, em poucos minutos uma de nossas atendentes fará seu atendimento.\n\n" +
  "Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site:\n" +
  "encorpa-fashion.com.br";

/**
 * The wait between the Estágio 0 receipt and Valen's real reply — the operator's call
 * on 2026-09-21, opção (a): n8n sends `WELCOME_AUTO_REPLY`, waits this many seconds with
 * a `Wait` node, then calls the turn endpoint again with `resume: true` for the real
 * answer. The Edge Function does not schedule this itself — it only tells n8n how long
 * to wait, so the number lives in one place instead of being copied into the workflow.
 */
export const WELCOME_RESUME_DELAY_SECONDS = 120;
