/**
 * The lead's profile and readiness score (plan 16 §4.1–§4.3, operator, 2026-10-21).
 *
 * The interpreter reads each message (`occasion`, `pain`, `hook`, `objections`, `price_signal`,
 * `buying_question`); this module folds those readings into `leads.profile` (jsonb) and turns the
 * facts of the conversation into `leads.score` (0–100) and `leads.score_band`. Pure functions, no
 * I/O: the turn reads the row, calls these, writes the result.
 *
 * The profile stays in Supabase, under the lead's 90-day retention. It never goes to the
 * Conversions API nor to an ad audience — `pain` can be health data (operator decision).
 *
 * Only a type import from `./interpret.ts`, which sits beside it in both copies, so it runs
 * byte-identical in Deno and in vitest — mirrored into `supabase/functions/turn/profile.ts` and held
 * there by `tests/function-drift.test.ts`.
 */

import type { Interpretation, Objection } from "./interpret.ts";

export type PriceSensitivity = "baixa" | "media" | "alta";

export interface LeadProfile {
  occasion: string | null;
  pain: string | null;
  hook: string | null;
  objections: Objection[];
  /** The highest level seen in the conversation (§4.3). */
  price_sensitivity: PriceSensitivity;
  /** Her messages that came as audio (the channel's marker, `isAudioBody`). */
  audio_count: number;
  /** She told an occasion or a pain at least once — the score's "+5 once". */
  occasion_told: boolean;
  buying_questions: number;
  discount_asks: number;
  /** Messages read as "vou pensar" (`wants_to_think`). */
  think_count: number;
}

export const EMPTY_PROFILE: LeadProfile = Object.freeze({
  occasion: null,
  pain: null,
  hook: null,
  objections: Object.freeze([]) as unknown as Objection[],
  price_sensitivity: "baixa",
  audio_count: 0,
  occasion_told: false,
  buying_questions: 0,
  discount_asks: 0,
  think_count: 0,
}) as LeadProfile;

const LEVEL: Record<PriceSensitivity, number> = { baixa: 0, media: 1, alta: 2 };

const levelOf = (signal: Interpretation["price_signal"]): PriceSensitivity =>
  signal === "complaint" || signal === "discount_ask"
    ? "alta"
    : signal === "installments" || signal === "discount_question"
      ? "media"
      : "baixa";

/**
 * One message folded into the profile. `prev` is the jsonb as stored: null for a lead with no
 * profile yet, and possibly missing keys written by an older shape — each missing key reads empty.
 */
export const mergeProfile = (
  prev: Partial<LeadProfile> | null | undefined,
  i: Interpretation,
  message: { audio: boolean },
): LeadProfile => {
  const p: LeadProfile = { ...EMPTY_PROFILE, ...(prev ?? {}) };
  const seen = levelOf(i.price_signal);
  return {
    occasion: i.occasion ?? p.occasion,
    pain: i.pain ?? p.pain,
    hook: i.hook ?? p.hook,
    objections: [...new Set([...p.objections, ...i.objections])],
    price_sensitivity: LEVEL[seen] > LEVEL[p.price_sensitivity] ? seen : p.price_sensitivity,
    audio_count: p.audio_count + (message.audio ? 1 : 0),
    occasion_told: p.occasion_told || i.occasion !== null || i.pain !== null,
    buying_questions: p.buying_questions + (i.buying_question ? 1 : 0),
    discount_asks: p.discount_asks + (i.price_signal === "discount_ask" ? 1 : 0),
    think_count: p.think_count + (i.wants_to_think ? 1 : 0),
  };
};

/**
 * The body is one of the channel's audio markers (`supabase/functions/whatsapp/whatsapp.ts`): the
 * transcribed audio, or the placeholder when it could not be transcribed. The literals are copied,
 * not imported — the channel is another function — and `tests/profile.test.ts` fails if they drift.
 */
export const isAudioBody = (body: string): boolean => {
  const t = body.trimStart();
  return t.startsWith("[áudio da cliente, transcrito automaticamente") || t.startsWith("[a cliente mandou um áudio");
};

/** The facts the score reads, each one already decided by the turn's own code. */
export interface ScoreFacts {
  sizeKnown: boolean;
  regionKnown: boolean;
  codAvailable: boolean;
  pathChosen: boolean;
  nameGiven: boolean;
  wantsToBuyOrAskedLink: boolean;
  buyingQuestions: number;
  occasionOrPainTold: boolean;
  thinkCount: number;
  secondDiscountAfterNo: boolean;
  unansweredTouches: number;
  declinedOrOptOut: boolean;
  orderCreated: boolean;
}

/**
 * The weights of plan 16 §4.2, one row each. A HYPOTHESIS, not a measurement: they hold until
 * ~200 real leads, when a logistic regression of "order" over these same signals replaces them.
 */
export const SCORE_WEIGHTS = Object.freeze({
  start: 10, // came from the ad and wrote
  size: 15,
  region: 15,
  cod: 5,
  path: 10,
  name: 10,
  wantsToBuy: 20,
  buyingQuestion: 5,
  buyingQuestionsMax: 15,
  occasionOrPain: 5, // once
  think: -15, // once: the table says "cada" only for buying questions and touches
  secondDiscountAfterNo: -10,
  unansweredTouch: -10, // each
  order: 100,
});

/** 0–100. An order is 100 even if she opts out afterwards: the order is the fact. */
export const scoreOf = (f: ScoreFacts): number => {
  const w = SCORE_WEIGHTS;
  if (f.orderCreated) return w.order;
  if (f.declinedOrOptOut) return 0;
  const sum =
    w.start +
    (f.sizeKnown ? w.size : 0) +
    (f.regionKnown ? w.region : 0) +
    (f.codAvailable ? w.cod : 0) +
    (f.pathChosen ? w.path : 0) +
    (f.nameGiven ? w.name : 0) +
    (f.wantsToBuyOrAskedLink ? w.wantsToBuy : 0) +
    Math.min(Math.max(f.buyingQuestions, 0) * w.buyingQuestion, w.buyingQuestionsMax) +
    (f.occasionOrPainTold ? w.occasionOrPain : 0) +
    (f.thinkCount > 0 ? w.think : 0) +
    (f.secondDiscountAfterNo ? w.secondDiscountAfterNo : 0) +
    Math.max(f.unansweredTouches, 0) * w.unansweredTouch;
  return Math.min(Math.max(sum, 0), 100);
};

export type ScoreBand = "quente" | "morna" | "fria";

/** §4.2: ≥ 60 quente · 30–59 morna · < 30 fria. */
export const bandOf = (score: number): ScoreBand => (score >= 60 ? "quente" : score >= 30 ? "morna" : "fria");

/** The band in the operator's e-mail subject (§4.2): "🔥 QUENTE · 72", "MORNA · 45", "FRIA · 18"; no score, no tag. */
export const scoreTag = (score: unknown): string | null => {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const s = Math.round(Math.min(Math.max(score, 0), 100));
  const band = bandOf(s);
  return `${band === "quente" ? "🔥 " : ""}${band.toUpperCase()} · ${s}`;
};
