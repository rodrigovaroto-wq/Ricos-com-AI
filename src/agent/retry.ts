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
 * The reply to a size exchange on an order (R17.1): the exchange's freight is hers, paid through a
 * Mercado Pago link outside the Coinzz and Logzz checkouts, and a person takes the exchange from
 * there. Null until the operator writes both the amount and the link in `exchange`; the exchange
 * then goes to a person with `ORDER_HANDOFF_REPLY`, as every post-sale question did before.
 */
export const exchangeReply = (exchange: { feeBrl?: number; checkoutUrl?: string } | undefined): string | null =>
  // Read from the BUSINESS_CONFIG secret, typed by hand: a "20" string or a link that is not https
  // stays null instead of throwing in the turn or sending a broken link.
  typeof exchange?.feeBrl === "number" &&
  Number.isFinite(exchange.feeBrl) &&
  exchange.feeBrl > 0 &&
  typeof exchange.checkoutUrl === "string" &&
  /^https:\/\/\S+$/.test(exchange.checkoutUrl)
    ? `Dá pra trocar de tamanho, sim 💛 O envio da troca fica por sua conta: R$ ${exchange.feeBrl.toFixed(2).replace(".", ",")}. ` +
      `É só pagar por este link: ${exchange.checkoutUrl}\nAssim que pagar, uma pessoa do time te chama pra combinar a troca.`
    : null;

/**
 * The reply when she wants to cancel an order that already left for delivery (operator,
 * 2026-10-06): it cannot be cancelled any more, and the return is asked for once it arrives. A
 * person still takes the conversation. Nothing here says the agent did or will do anything to the
 * order (`order_action_claim`), and the days are the config's (`warranty_promise`). The heart is
 * not after the count: `delivery_promise` reads anything left in the count's sentence as a deadline.
 */
export const shippedCancelReply = (warrantyDays: number): string =>
  `Seu pedido já saiu para entrega 🚚, então não dá mais pra cancelar. Quando ele chegar aí, é só me ` +
  `chamar aqui pra pedir a devolução 💛 Você tem ${warrantyDays} dias pra devolver depois que receber.`;

/**
 * The reply when she wants to cancel an order paid at the door (operator, 2026-10-06), shipped or
 * not: she refuses it at the door and pays nothing. A person still takes the conversation.
 */
export const COD_CANCEL_REPLY =
  "Como o seu pedido é pago na entrega, é só esperar ele chegar aí. Se não quiser receber, é só dizer isso pro entregador na hora 💛";

/**
 * The reply when she wants to cancel a prepaid order already paid and not yet on its way (operator,
 * 2026-10-06, his words). The agent cancels nothing: the handoff tells a person to cancel it.
 */
export const PREPAID_CANCEL_REPLY = "Conferi que seu pedido ainda não saiu para a entrega, irei dar início no cancelamento.";

/**
 * "Vou pensar" (R13.4): the operator's opening line. Since 2026-09-29 (R16.5) it is only the
 * opening of `thinkReply`, which the turn sends.
 */
export const THINK_REPLY = "Sem problemas, estou aqui se tiver mais alguma dúvida";

/** What `thinkReply` reads of the config: the stock, the prices and the deadlines. */
export interface ThinkConfig {
  prices: { prepayBrl: number; prepayDiscountPercent: number };
  delivery: { warrantyDays: number; prepayAvgDays?: number; prepayVariesByRegion?: boolean };
  scarcity?: { unitsLeft?: number | null } | null;
  kits?: ReadonlyArray<{ path: "cod" | "prepay"; units: number; priceBrl: number; discountPercent: number }>;
}

const reais = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * The link, said the operator's way (2026-10-07, grafo §66): no "quer que eu te mande o link?" — it is
 * sent, in three bubbles: the line, the link alone, and what is left there, once. Fixed text: the model
 * asked permission five times and never sent it.
 */
export const linkMessage = (
  url: string,
  path: "cod" | "prepay",
  size: string | null,
  brand: string,
  pieces = 1,
): string => {
  const choose = pieces > 1 ? "escolhe o tamanho de cada peça" : `escolhe o ${size ?? "seu tamanho"}`;
  const there =
    path === "cod"
      ? `Lá você completa o endereço, ${choose} e o dia da entrega.`
      : `Lá você completa o endereço, ${choose}, confere o frete da sua região e paga no pix ou no cartão.`;
  return (
    `Perfeito! É só clicar no link do checkout a seguir e concluir sua compra, obrigada por escolher a ${brand}.` +
    `\n\n${url}\n\n${there} Se precisar de alguma ajuda, estarei aqui.`
  );
};

/**
 * The reply when she puts the purchase off — "vou pensar", "depois eu compro" (operator,
 * 2026-09-29, R16.5). It used to be the opening line alone: no pressure and no reason to come
 * back. Now it is the one place the declared stock is said, with the strongest argument of her
 * path, and it ends pointing at the link — only when every datum the link waits for is in
 * (operator, 2026-10-06); otherwise at the conversation, warmly:
 *
 * - on delivery: nothing paid now, and the days to return at no cost to her (R16.3);
 * - prepaid (she chose it, or delivery does not reach her): the discount and the average
 *   deadline, said as varying (R16.2).
 *
 * Every number comes from the config; an absent one drops its sentence. The turn sends it
 * through the whole gate chain with `postponing: true` — the only context where
 * `scarcity_claim` lets the stock through.
 */
export const thinkReply = (c: ThinkConfig, path: "cod" | "prepay", withLink: boolean, pieces = 1): string => {
  const units = c.scarcity?.unitsLeft;
  // A kit's own price and discount: the link is the kit's, and the 1-piece R$ 116,91 next to it is a
  // price the checkout does not show (independent review, finding 9). A kit the config lacks says
  // no price at all rather than the wrong one.
  const kit = pieces > 1 ? c.kits?.find((k) => k.path === "prepay" && k.units === pieces) : undefined;
  const pct = pieces > 1 ? (kit?.discountPercent ?? 0) : c.prices.prepayDiscountPercent;
  const price = pieces > 1 ? (kit?.priceBrl ?? 0) : c.prices.prepayBrl;
  // The average only while the deadline varies by region — the gate's reading (`prepayAverage`).
  const avg = c.delivery.prepayVariesByRegion ? c.delivery.prepayAvgDays : undefined;
  const parts = [
    `${THINK_REPLY} 💛`,
    ...(units != null && units > 0
      ? [`Só te aviso que restam ${units} unidades desse lote, então se fizer sentido pra você, vale garantir o seu logo.`]
      : []),
    path === "cod"
      ? `Pagando na entrega você não paga nada agora, e depois de receber ainda tem ${c.delivery.warrantyDays} dias pra devolver sem custo nenhum.`
      : pct > 0
        ? `No antecipado você ganha ${pct}% de desconto: ${reais(price)}` +
          (avg != null ? `, e o prazo varia por região, em média ${avg} dias úteis.` : `.`)
        : avg != null
          ? `No antecipado o prazo varia por região, em média ${avg} dias úteis.`
          : ``,
    // Without every datum there is no link (operator, 2026-10-06), and no promise of one either.
    withLink ? `O link pra garantir o seu está aqui embaixo.` : `Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.`,
  ];
  return parts.filter((p) => p !== ``).join(" ");
};

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
/**
 * Whether a retried turn must give up instead of answering (code review, 2026-09-24). It
 * answers exactly the message its ticket names, and only while that is still her latest
 * and nothing went out after it — otherwise a newer turn owns the reply and answering too
 * is a duplicate. Checked when the retry starts AND again right before it sends, because
 * the retry spends seconds on model calls while she may write again.
 */
export const retryIsMoot = (
  ticketInboundId: string,
  latestInbound: { id: string; created_at: string } | null,
  lastOutboundAt: string | null,
): boolean =>
  latestInbound === null ||
  latestInbound.id !== ticketInboundId ||
  (lastOutboundAt !== null && new Date(lastOutboundAt).getTime() > new Date(latestInbound.created_at).getTime());

/**
 * Whether the second look lets the draft go (grafo §61, §65): nothing she sent arrived after the
 * message it answers (`moot` false) — or the read failed on a first turn, which never silences her.
 * A revision or a sweep retry whose read failed does not know what its draft answered: never sent.
 */
export const draftMayGo = (readFailed: boolean, moot: boolean, mode: { isRetry: boolean; isRevise: boolean }): boolean =>
  readFailed ? !mode.isRetry && !mode.isRevise : !moot;

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
 * todas as suas dúvidas". On 2026-10-07 the opening "Oii, tudo bem?" left it (operator, grafo §66):
 * the greeting is Malu's, in her first real reply.
 *
 * It answers nothing about her message; it exists to be honest that a person has not
 * replied yet, in a channel where silence reads as ignored. Sent once per lead, never
 * repeated — a lead that already has a conversation is not new, and does not see it
 * again on her second message.
 */
export const WELCOME_AUTO_REPLY =
  "Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas.\n\n" +
  "Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site:\n" +
  "encorpa-fashion.com.br";

/**
 * Malu's first real reply opens with the greeting of the hour (operator, 2026-10-07, grafo §66):
 * "bom dia" from 06:00 to 12:00, "boa tarde" to 19:00, "boa noite" to midnight, São Paulo time.
 * Before 06:00 the reply waits for the opening, so it is "bom dia" too.
 */
export const greetingFor = (at: Date, agentName: string): string => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(at),
  );
  const part = hour >= 19 ? "boa noite" : hour >= 12 ? "boa tarde" : "bom dia";
  return `Oii, ${part}, tudo bem?! Sou a ${agentName} e darei início ao seu atendimento.`;
};

/** The second bubble when all she wrote was a greeting; with a question, the answer takes its place. */
export const GREETING_ASK = "Em que posso te ajudar?";

/** The receipt, as sent now or before 2026-10-07 — never a reply of Malu's. */
export const isReceipt = (body: string): boolean =>
  body === WELCOME_AUTO_REPLY || body === `Oii, tudo bem?\n\n${WELCOME_AUTO_REPLY}`;

/**
 * Every message of hers is a greeting and nothing else ("oi", "Boa tarde, tudo bem?", "olá 😊"): then
 * the first reply is the greeting and "Em que posso te ajudar?", with no model call.
 */
export const onlyGreets = (parts: readonly string[]): boolean =>
  parts.length > 0 &&
  parts.every((p) =>
    /^(?:(?:oi+e?|ol[aá]|opa|e\s*a[ií]|eae|hey|hello|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+(?:bem|bom|certo|joia|j[oó]ia)|td\s+(?:bem|bom)|tudo\s+bem\s+com\s+voc[eê]|como\s+vai|malu|gente|amiga|moça|moca|[\s,.!?;:]+|[\p{Extended_Pictographic}‍️]+)\s*)+$/iu.test(p.trim()),
  );

/**
 * The wait between the Estágio 0 receipt and Malu's real reply — the operator's call
 * on 2026-09-21, opção (a): n8n sends `WELCOME_AUTO_REPLY`, waits this many seconds with
 * a `Wait` node, then calls the turn endpoint again with `resume: true` for the real
 * answer. The Edge Function does not schedule this itself — it only tells n8n how long
 * to wait, so the number lives in one place instead of being copied into the workflow.
 * One minute since 2026-10-02 (operator, R18.1); it was 120 s, against a spec that said 3 min.
 */
export const WELCOME_RESUME_DELAY_SECONDS = 60;

/**
 * One answer per burst (grafo §59, first real WhatsApp test, 2026-10-06): a person waits until
 * she stops typing, reads everything and answers once. The turn of a new message waits this
 * long after storing it; if a newer one of hers arrived meanwhile, that one's turn answers.
 * 5 s since grafo §61 (operator, 2026-10-06): what arrives later is folded into the reply.
 */
export const QUIET_WINDOW_MS = 5_000;

/**
 * Grafo §61 (operator, 2026-10-06): one turn answers a conversation at a time, and a message she
 * sends while it writes is folded into its reply instead of throwing the reply away. The turn
 * that writes revises its draft with the whole burst at most this many times.
 */
export const MAX_REVISIONS = 2;
/**
 * From the turn's start, the deadline a revision's reply calls aim for. A revision starts only
 * with `REVISE_MIN_MS` left (interpreter 8 s + region 2 × 5 s + one 10 s attempt), and each of its
 * `MAX_REWRITES` past the deadline is one `MIN_ATTEMPT_MS` call: 110 + 2 × 10 + database < 150 s.
 */
export const REVISE_DEADLINE_MS = 110_000;
export const REVISE_MIN_MS = 30_000;
/** A turn's "replying" mark older than this belongs to a turn the platform already cut (150 s). */
export const REPLYING_STALE_MS = 150_000;

/** Whether the writing turn may revise once more: revisions left and time for one. */
export const revisionAllowed = (revisions: number, now: number, deadline: number): boolean =>
  revisions < MAX_REVISIONS && now + REVISE_MIN_MS <= deadline;

/**
 * Rides in the system prompt like the rewrite's correction, so the draft never enters the
 * history. The burst itself is already in the history, in order.
 */
export const reviseInstruction = (draft: string): string =>
  `Você estava escrevendo esta resposta: "${draft}". Ela mandou mais mensagens enquanto você escrevia.` +
  ` Reescreva uma resposta só, natural, que responda tudo na ordem em que ela mandou, sem virar lista.`;

/**
 * Her messages the agent has not answered yet, oldest first: the run of inbound rows at the
 * end of the conversation (`newestFirst`, as the turn reads it). Any outbound row — a reply,
 * a ruler touch, a person's reply — ends the run, except the fixed welcome, which answers
 * nothing she asked: the resume after it answers the message that triggered it.
 */
export const unansweredInbound = <M extends { direction: string; body?: string | null }>(newestFirst: readonly M[]): M[] => {
  const run: M[] = [];
  for (const m of newestFirst) {
    if (m.direction === "inbound") run.unshift(m);
    // The receipt sent before 2026-10-07 opened with "Oii, tudo bem?" — still the receipt.
    else if (!isReceipt(m.body ?? "")) break;
  }
  return run;
};
