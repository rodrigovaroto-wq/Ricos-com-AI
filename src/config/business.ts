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
  prices: { codBrl: number; prepayBrl: number; prepayDiscountPercent: number; anchorBrl: number };
  delivery: {
    codDaysMin: number;
    codDaysMax: number;
    /** A janela do antecipado, em dias úteis — conferida no checkout em 2026-09-08. */
    prepayDaysMin: number;
    prepayDaysMax: number;
    codScheduled: boolean;
    prepayVariesByRegion: boolean;
    warrantyDays: number;
    /** Os dois caminhos têm frete grátis desde 2026-09-09. Ausente = grátis; só `false` desliga. */
    freeShipping?: boolean;
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
}

export const loadBusinessConfig = (path = "config/business.json"): BusinessConfig =>
  JSON.parse(readFileSync(path, "utf-8")) as BusinessConfig;

/** Hard ceiling: the cap plus the tolerance a long conversation is allowed to use. */
export const costCeilingBrl = (c: BusinessConfig): number =>
  c.cost.conversationCapBrl * (1 + c.cost.overrunTolerance);
