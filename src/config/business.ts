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
    codScheduled: boolean;
    prepayVariesByRegion: boolean;
    warrantyDays: number;
  };
  sizes: readonly string[];
  hours: { openHour: number; closeHour: number };
  /** Cap per conversation, plus how far a long chat may overrun before handoff. */
  cost: { conversationCapBrl: number; overrunTolerance: number };
  coupon: { code: string; percent: number; active: boolean };
  /** When `Físico na entrega` is off, the courier does not collect: no "pay on delivery" promise. */
  cod: { physicalOnDeliveryActive: boolean };
  checkout: { baseUrl: string };
  handoff: { email: string };
}

export const loadBusinessConfig = (path = "config/business.json"): BusinessConfig =>
  JSON.parse(readFileSync(path, "utf-8")) as BusinessConfig;

/** Hard ceiling: the cap plus the tolerance a long conversation is allowed to use. */
export const costCeilingBrl = (c: BusinessConfig): number =>
  c.cost.conversationCapBrl * (1 + c.cost.overrunTolerance);
