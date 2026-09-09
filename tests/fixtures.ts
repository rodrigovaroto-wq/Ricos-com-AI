import type { BusinessConfig } from "@/config/business.js";

/** Test config: same shape as config/business.json, with the values already decided. */
export const config: BusinessConfig = {
  brand: "Encorpa",
  product: "Colete Cinta Modeladora",
  site: "encorpa-fashion.com.br",
  agentName: "Malu",
  prices: { codBrl: 129.9, prepayBrl: 110.41, prepayDiscountPercent: 15, anchorBrl: 216.5 },
  delivery: {
    codDaysMin: 1,
    codDaysMax: 3,
    prepayDaysMin: 5,
    prepayDaysMax: 10,
    codScheduled: true,
    prepayVariesByRegion: true,
    warrantyDays: 7,
  },
  sizes: ["P", "M", "G", "GG", "XGG"],
  hours: { openHour: 6, closeHour: 24 },
  cost: { conversationCapBrl: 0.8, overrunTolerance: 0.25 },
  coupon: { code: "SUPER20", percent: 20, active: false },
  cod: { physicalOnDeliveryActive: true },
  checkout: { baseUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-na-entrega-0" },
  handoff: { email: "operador@example.com" },
  testimonials: ["vesti pra festa e não tirei mais, o vestido caiu diferente"],
};

export const ctx = (over: Partial<import("@/agent/guardrails.js").GateContext> = {}) => ({
  config,
  layer: "agent" as const,
  optedOut: false,
  now: new Date("2026-09-06T14:00:00"),
  paymentPath: "cod" as const,
  ...over,
});
