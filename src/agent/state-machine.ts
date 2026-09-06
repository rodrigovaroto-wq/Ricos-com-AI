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
