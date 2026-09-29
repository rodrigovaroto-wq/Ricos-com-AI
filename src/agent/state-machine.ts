/**
 * Conversation stages (spec 03-maquina-de-estados.md). Four rules the structure has
 * to guarantee, and all four are here rather than scattered through ifs:
 *
 *  1. No regression — a lead at `pedido_criado` does not fall back to `conversando`
 *     because she said "oi" again.
 *  2. Transitions are data, not code.
 *  3. Advancing requires evidence, recorded with the transition.
 *  4. `bloqueado` is terminal for the agent; only a person undoes it.
 */
export const STAGES = [
  "novo",
  "conversando",
  "tamanho_definido",
  "endereco_coletado",
  "pedido_criado",
  "em_rota",
  "entregue_pago",
  "recusado",
  "perdido",
  "bloqueado",
] as const;

export type Stage = (typeof STAGES)[number];

const TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  novo: ["conversando", "perdido", "bloqueado"],
  conversando: ["tamanho_definido", "perdido", "bloqueado"],
  tamanho_definido: ["endereco_coletado", "perdido", "bloqueado"],
  endereco_coletado: ["pedido_criado", "perdido", "bloqueado"],
  pedido_criado: ["em_rota", "recusado", "bloqueado"],
  em_rota: ["entregue_pago", "recusado", "bloqueado"],
  entregue_pago: [],
  recusado: [],
  perdido: ["conversando", "bloqueado"], // she can come back on her own
  bloqueado: [],
};

export const canTransition = (from: Stage, to: Stage): boolean =>
  TRANSITIONS[from].includes(to);

export interface Transition {
  from: Stage;
  to: Stage;
  /** Why we advanced — a quote from the conversation or an external event id. */
  evidence: string;
  at: Date;
}

export class InvalidTransitionError extends Error {
  constructor(from: Stage, to: Stage) {
    super(`transição inválida: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export const transition = (from: Stage, to: Stage, evidence: string, at = new Date()): Transition => {
  if (!evidence.trim()) throw new Error("transição sem evidência");
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return { from, to, evidence, at };
};

/** Stages where spending more model tokens still has a chance of producing an order. */
export const isLive = (stage: Stage): boolean =>
  ["novo", "conversando", "tamanho_definido", "endereco_coletado"].includes(stage);

/**
 * The linear part of the funnel, in order. The terminal stages — `recusado`, `perdido`,
 * `bloqueado` — are deliberately absent: they are not further along anything, they are
 * where a conversation stops, and they are set explicitly rather than by comparison.
 */
const LADDER: readonly Stage[] = [
  "novo",
  "conversando",
  "tamanho_definido",
  "endereco_coletado",
  "pedido_criado",
  "em_rota",
  "entregue_pago",
] as const;

/** Where a stage sits on the ladder, or -1 for the terminal ones. */
export const rankOf = (stage: Stage): number => LADDER.indexOf(stage);

/**
 * The stage to persist, given what is stored and what this turn reached.
 *
 * `canTransition` answers whether ONE step is legal, which is the right question for a
 * state machine driven by events. A conversation is not driven by events: a customer who
 * opens with "oi, uso 42, meu CEP é 13010-100" jumps three rungs in one message, and
 * asking `canTransition` about that returns false for a advance that actually happened.
 *
 * So the rule the spec actually states — *"sem regressão: o estágio só avança"* — is
 * enforced here by rank, not by edge, on the linear part. Terminal stages follow
 * `TRANSITIONS`: one arriving is accepted only where it is a legal edge (so
 * `pedido_criado` never becomes `perdido`); a stored `perdido` gives way to any linear
 * stage, because she came back; `bloqueado`, `recusado` and `entregue_pago` stay.
 *
 * `recusado` only ever comes from the sale webhook, which is itself the evidence that an
 * order existed — so it is judged from where that order put her, `pedido_criado` or beyond.
 * Judged from `stored`, a "Cancelado" arriving first (no "created" before it, or a sale by
 * the link, where the turn never writes `pedido_criado`) left her at `endereco_coletado` or
 * `perdido`, and the refusal never reached the funnel (grafo §27, N3c/N3e).
 */
export const furthest = (stored: Stage, reached: Stage): Stage => {
  const from = reached === "recusado" ? furthest(stored, "pedido_criado") : stored;
  if (rankOf(reached) === -1) return canTransition(from, reached) ? reached : stored;
  if (stored === "perdido") return reached;
  if (rankOf(stored) === -1) return stored;
  return rankOf(reached) > rankOf(stored) ? reached : stored;
};

/**
 * The stored stages that `next` may replace — the condition the PATCH puts on the row,
 * so the rule holds against the database and not only against the value this turn read
 * at its start. Two overlapping turns otherwise race: the one that read an older stage
 * writes it over the one that advanced.
 */
export const overwritableBy = (next: Stage): Stage[] =>
  STAGES.filter((s) => s !== next && furthest(s, next) === next);

/** The facts a turn has established, as far as the funnel is concerned. */
export interface ReachedFacts {
  size: string | null;
  addressConfirmed: boolean;
  addressComplete: boolean;
  /** The order body actually built — not identity complete, not "she wants to buy". */
  orderBuilt: boolean;
}

/**
 * The highest rung the facts support, in funnel order. Every exit of the turn calls
 * this, so a conversation that got far and then handed off is counted where it got.
 *
 * `pedido_criado` takes the built order and nothing less: identity can pass
 * `isIdentityComplete` with a short CPF, and the config can lack `offerHash`, and in
 * both the order comes out null. A stage that lies about the order poisons exactly the
 * metric that justifies having stages — and `furthest` would keep the lie forever.
 */
export const reachedStage = (facts: ReachedFacts): Stage =>
  facts.orderBuilt
    ? "pedido_criado"
    : facts.addressConfirmed && facts.addressComplete
      ? "endereco_coletado"
      : facts.size
        ? "tamanho_definido"
        : "conversando";
