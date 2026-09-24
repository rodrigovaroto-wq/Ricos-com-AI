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
 * Two rewrites, since 2026-09-24 (R13.4). One was the rule from 2026-09-08 to 2026-09-24,
 * and the personas showed its price: a false veto on the first draft and a second false
 * veto on the rewrite sent the canned fallback, which ignores what she asked. A third
 * draft is ~R$ 0,001; a fallback is a customer who stops answering. The gates that keep
 * firing across attempts are still a prompt problem — Hermes' material, read from
 * `gate_traces`.
 *
 * Handoff still exists, for reasons that are not about wording: she asked for a person
 * or wants to cancel or asks about an order (R13.2), the conversation hit its cost
 * ceiling, or the provider stayed down through every retry.
 */

/**
 * Structurally the same as the guardrail chain's `Remedy`, declared here instead of
 * imported so this file has zero imports and runs byte-identical in Deno and in
 * vitest — the rule `guardrails.ts` and `followups.ts` already follow. A test asserts
 * the two stay assignable, so a class added on one side cannot be forgotten here.
 */
export type Remedy = "rewrite" | "defer" | "stop";

/**
 * Two shots at correcting itself (operator, 2026-09-24 — was one since 2026-09-08). Each
 * attempt is a paid model call (~R$ 0,001) the customer never sees; the fallback it
 * replaces is a reply that ignores her question, which cost more in the persona runs.
 */
export const MAX_REWRITES = 2;

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
      reason: `${maxRewrites} reescrita(s) e nenhuma passou na cadeia: ${reasons.join("; ")}`,
    };
  }
  return { kind: "rewrite", instruction: rewriteInstruction(reasons, vetoedText) };
};

/**
 * What she hears when the rewrite did not pass — and it is a real reply, not a stall.
 *
 * The conversation stays with the agent, so this has to move it forward: it hands the
 * turn back to her with a live question, which is the one thing that keeps a WhatsApp
 * thread alive. Since 2026-09-24 the question is about HER question: the old line
 * ("acertar o tamanho, ou entender como o colete funciona?") ignored what she had asked,
 * which the persona runs showed is where she stops answering. It names no price, no deadline, no warranty and no number, so it cannot
 * trip the chain it is standing in for — a fallback that can itself be vetoed is not a
 * fallback. A test asserts it passes every gate.
 */
export const SAFE_FALLBACK_REPLY =
  "Deixa eu te responder isso direitinho: me fala de novo o que você quer saber?";

/**
 * What the customer hears when the turn hits a wall that is not about wording: the cost
 * ceiling, or a provider that failed. She gets an answer — that is the point — and it
 * promises only what a human can actually deliver: a reply, not a deadline. Deliberately
 * free of price, delivery window and coupon, so it cannot itself trip the chain.
 */
export const HOLDING_REPLY =
  "Deixa eu confirmar isso certinho pra você e já te respondo por aqui 💛";

/**
 * When she asks for a person (§Q12, R13.2). It confirms without pretending: nobody is on
 * the line yet, so it says the team was told — true the moment this goes out, because the
 * notification rides in the same response — and leaves the door open rather than closing
 * the conversation. Same constraint as the holding reply — no price, deadline or coupon —
 * so the one message the agent must always be able to send can never be vetoed. Wording
 * from the operator, 2026-09-24.
 */
export const HUMAN_HANDOFF_REPLY = "Claro! Já avisei o time e alguém te chama por aqui 💛";

/**
 * When she wants to cancel, or asks about an order that already exists (R13.2). The
 * agent has no access to orders, and on 2026-09-24 it pretended to check one and invented
 * an "área do pedido" (Lu). A person checks; this says so. Operator's wording.
 */
export const ORDER_HANDOFF_REPLY = "Vou checar pra você e já te retorno 💛";

/**
 * "Vou pensar" (R13.4). No pressure and no second pitch: this, then the checkout link in
 * a bubble of its own, so the door she comes back through is already in the chat.
 * Operator's wording.
 */
export const THINK_REPLY = "Sem problemas, estou aqui se tiver mais alguma dúvida";

/**
 * Network failures calling the model (R13.4). Only failures that say nothing about the
 * request — the connection died, the call timed out, the server answered 5xx or 429 (rate
 * limit, which clears by waiting) — are retried; any other 4xx is the request itself and a
 * retry sends the same mistake again.
 *
 * The operator asked for up to five minutes before any handoff. One invocation cannot
 * hold that: a Supabase Edge Function that has not answered in 150 s is cut with a 504
 * (request idle timeout), and the turn also spends time on the interpreter and the
 * database. So the turn retries in-call inside `IN_CALL_RETRY_BUDGET_MS`, and when that
 * runs out it schedules one more attempt on the n8n cron (every 5 minutes) instead of
 * handing off — `DEFERRED_RETRY_DELAY_SECONDS` from now, picked up by the next sweep.
 * Only that deferred attempt, failing too, hands off — unless it failed because OUR budget
 * cut a call that was merely slow, which says nothing about the provider: then it is
 * rescheduled once (`MAX_DEFERRED_RETRIES`), then it hands off.
 */
export const NETWORK_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const;
/**
 * Wall-clock the reply calls of one turn may spend, retries included, counted from the end
 * of the interpreter call — which has its own 20 s cap — so the whole turn stays under
 * the 150 s cut.
 */
export const IN_CALL_RETRY_BUDGET_MS = 90_000;
/** One model call never waits longer than this before it counts as a network failure. */
export const MODEL_CALL_TIMEOUT_MS = 40_000;
/** The shortest attempt worth starting: less than this left, and it would only time out. */
export const MIN_ATTEMPT_MS = 10_000;
export const DEFERRED_RETRY_DELAY_SECONDS = 60;
export const MAX_DEFERRED_RETRIES = 1;

/**
 * What a retried turn does when the network failed again: reschedule only when our own
 * timeout cut it and the reschedules are not used up; otherwise hand off.
 */
export const afterRetryFailure = (timedOut: boolean, retriesSoFar: number): "reschedule" | "handoff" =>
  timedOut && retriesSoFar < MAX_DEFERRED_RETRIES ? "reschedule" : "handoff";

/**
 * How long to wait before the next try after `failures` consecutive network failures,
 * or null when the in-call budget cannot hold another attempt.
 */
export const networkRetryDelay = (
  failures: number,
  elapsedMs: number,
  budgetMs = IN_CALL_RETRY_BUDGET_MS,
): number | null => {
  const delay = NETWORK_RETRY_DELAYS_MS[failures - 1];
  if (delay === undefined) return null;
  return elapsedMs + delay + MIN_ATTEMPT_MS <= budgetMs ? delay : null;
};

/**
 * Estágio 0 — the receipt every brand-new lead gets, 24/7, before the agent has said a
 * word. Same class as the two replies above: fixed text, never the model, layer "auto"
 * so the hours gate does not apply (R4.4). Approved by the operator on 2026-09-21,
 * spacing included — the paragraph breaks are the approved text, not formatting. The
 * second line changed on 2026-09-24 (R13.5): "fará seu atendimento" became "esclarecerá
 * todas as suas dúvidas".
 *
 * It answers nothing about her message; it exists to be honest that a person has not
 * replied yet, in a channel where silence reads as ignored. Sent once per lead, never
 * repeated — a lead that already has a conversation is not new, and does not see it
 * again on her second message.
 */
export const WELCOME_AUTO_REPLY =
  "Oii, tudo bem?\n\n" +
  "Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas.\n\n" +
  "Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site:\n" +
  "encorpa-fashion.com.br";

/**
 * The wait between the Estágio 0 receipt and Malu's real reply — the operator's call
 * on 2026-09-21, opção (a): n8n sends `WELCOME_AUTO_REPLY`, waits this many seconds with
 * a `Wait` node, then calls the turn endpoint again with `resume: true` for the real
 * answer. The Edge Function does not schedule this itself — it only tells n8n how long
 * to wait, so the number lives in one place instead of being copied into the workflow.
 */
export const WELCOME_RESUME_DELAY_SECONDS = 120;
