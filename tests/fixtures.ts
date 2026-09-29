import type { BusinessConfig } from "@/config/business.js";

/** Test config: same shape as config/business.json, with the values already decided. */
export const config: BusinessConfig = {
  brand: "Encorpa",
  product: "Colete Cinta Modeladora",
  site: "encorpa-fashion.com.br",
  agentName: "Malu",
  prices: { codBrl: 129.9, prepayBrl: 129.9, prepayDiscountPercent: 0, anchorBrl: 216.5 },
  delivery: {
    codDaysMin: 1,
    codDaysMax: 3,
    prepayAvgDays: 5,
    codScheduled: true,
    prepayVariesByRegion: true,
    warrantyDays: 7,
    freeShipping: false,
  },
  sizes: ["P", "M", "G", "GG", "XGG"],
  hours: { openHour: 6, closeHour: 24 },
  cost: { conversationCapBrl: 0.5, overrunTolerance: 0.25 },
  coupon: { code: "SUPER20", percent: 20, active: false },
  cod: { physicalOnDeliveryActive: true },
  checkout: {
    codUrl: "https://entrega.logzz.com.br/pay/encorpa-pa",
    prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0",
  },
  handoff: { email: "operador@example.com" },
  testimonials: ["vesti pra festa e não tirei mais, o vestido caiu diferente"],
};

/**
 * O config acima roda com `freeShipping: false` (não grátis nos DOIS caminhos, 2026-09-22) e
 * sem a chave `codFreeShipping`, como o secret de produção: ausente lê como grátis no
 * pagamento na entrega (R15.3, 2026-09-28). Este aqui é o ramo oposto — mantido
 * porque o gate tem duas metades e as duas precisam de teste. Sem ele, o dia em que o
 * frete voltar a ser grátis chega sem nenhuma cobertura do lado que passa a valer.
 */
export const configGratis: BusinessConfig = {
  ...config,
  delivery: { ...config.delivery, freeShipping: true },
};

export const ctx = (over: Partial<import("@/agent/guardrails.js").GateContext> = {}) => ({
  config,
  layer: "agent" as const,
  optedOut: false,
  now: new Date("2026-09-06T14:00:00"),
  paymentPath: "cod" as const,
  ...over,
});

/** O mesmo contexto, no ramo em que o frete é grátis. */
export const ctxGratis = (over: Partial<import("@/agent/guardrails.js").GateContext> = {}) => ({
  ...ctx(),
  config: configGratis,
  ...over,
});
