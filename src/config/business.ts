import { readFileSync } from "node:fs";

/**
 * Every real business value lives in config/business.json, never in code.
 * The file is gitignored; config/business.example.json is its mirror.
 */
export interface BusinessConfig {
  brand: string;
  product: string;
  site: string;
  agentName: string;
  prices: {
    codBrl: number;
    prepayBrl: number;
    prepayDiscountPercent: number;
    anchorBrl: number;
    /** Up to how many card installments the prepaid checkout allows (R13.3). Absent: never cited. */
    prepayMaxInstallments?: number;
  };
  delivery: {
    codDaysMin: number;
    codDaysMax: number;
    /**
     * O prazo do antecipado deixou de ser faixa em 2026-09-09: a Logzz varia por região e
     * o único número honesto é a média. Ausente, a agente não diz prazo nenhum ali.
     */
    prepayAvgDays?: number;
    codScheduled: boolean;
    prepayVariesByRegion: boolean;
    warrantyDays: number;
    /**
     * Free shipping on both paths only when explicitly `true`. The operator decided on
     * 2026-09-22 that the operation does not offer free shipping, so an absent key reads
     * as not free — the gates and the prompt test `=== true`. (From 2026-09-09 to
     * 2026-09-22 it was the reverse: absent meant free, tested as `!== false`.)
     */
    freeShipping?: boolean;
    /**
     * Free shipping on cash on delivery only (operator, 2026-09-28): the Logzz offer charges
     * her R$ 0,00 of freight, the prepaid checkout charges it by region. Absent reads as free
     * on delivery (`!== false`), because production's secret does not carry the key; `false`
     * brings back "not free on either path". `freeShipping: true` overrides it.
     */
    codFreeShipping?: boolean;
    /** Only an explicit `true` lets her name the Express delivery (R13.5). Absent: off. */
    expressActive?: boolean;
  };
  sizes: readonly string[];
  hours: { openHour: number; closeHour: number };
  /** Cap per conversation, plus how far a long chat may overrun before handoff. */
  cost: { conversationCapBrl: number; overrunTolerance: number };
  coupon: { code: string; percent: number; active: boolean };
  /** When `Físico na entrega` is off, the courier does not collect: no "pay on delivery" promise. */
  cod: { physicalOnDeliveryActive: boolean };
  /**
   * Os dois checkouts, em duas plataformas desde 2026-09-09: a entrega agendada é da
   * Logzz, o antecipado é da Coinzz. Era `baseUrl` — um só —, o que já não descrevia a
   * operação e divergia do tipo que a Edge Function usa de verdade.
   */
  checkout: { codUrl: string; prepayUrl?: string };
  /**
   * Kits of 2 and 3 pieces, one Coinzz checkout per quantity (operator, 2026-09-25).
   * OPTIONAL: absent, one piece only — every kit price is refused by the gate.
   */
  kits?: ReadonlyArray<{ path: "cod" | "prepay"; units: number; priceBrl: number; discountPercent: number; checkoutUrl: string }>;
  handoff: { email: string };
  /**
   * Urgency the operation can actually back. Absent means the agent may not cite stock
   * or a deadline at all — invented urgency is a promise nobody can keep and, under
   * CDC art. 37, misleading advertising. Filled in, it becomes a tool she can use.
   */
  scarcity?: {
    unitsLeft?: number | null;
    offerEndsAt?: string | null;
    /** Operator's switch: urgency without a counted number behind it. Off by default. */
    allowUnverified?: boolean;
  };
  /** Real reviews, word for word. Anything she quotes has to be in here. */
  testimonials?: readonly string[];
  /**
   * Facts the operator declared on 2026-09-24 (R13.5). OPTIONAL, all of them: production
   * reads the whole config from the `BUSINESS_CONFIG` secret, so a key added here is absent
   * there until the operator writes it — and absent reads as off: no support address, no
   * customer count, no store plan is cited. They may only be filled with what is true.
   */
  support?: { email?: string };
  socialProof?: { satisfiedCustomers?: number };
  store?: { physicalStorePlanCity?: string };
  /**
   * Os templates que a Meta já aprovou, um por toque da régua. OPCIONAL, e ausente
   * significa que nenhum foi aprovado ainda — o que barra todo toque que caia fora da
   * janela de 24h em vez de mandar texto livre que a Cloud API recusaria. Ver
   * `deliveryFor` em `src/agent/followups.ts`.
   */
  channel?: {
    templates?: Partial<
      Record<import("../agent/followups.js").FollowupKind, import("../agent/followups.js").TemplateBinding>
    >;
  };
}

export const loadBusinessConfig = (path = "config/business.json"): BusinessConfig =>
  JSON.parse(readFileSync(path, "utf-8")) as BusinessConfig;

/** Hard ceiling: the cap plus the tolerance a long conversation is allowed to use. */
export const costCeilingBrl = (c: BusinessConfig): number =>
  c.cost.conversationCapBrl * (1 + c.cost.overrunTolerance);
