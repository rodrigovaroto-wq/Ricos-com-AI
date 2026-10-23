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
  /** Sent replies that cited her occasion or pain, over the whole conversation (§4.4, `triggerUsesSoFar`). */
  trigger_uses: number;
  /** The newest sent message `trigger_uses` counted: what comes after it is counted next. */
  trigger_counted_at: string | null;
  /**
   * The turn offered the real-stock line (§4.6) / gave the vague-objection question (§4.5): once per conversation, by what the
   * turn decided, never by reading the text back (four /code-review rounds of PR 77: every text reader missed some wording).
   */
  stock_offered: boolean;
  vague_asked: boolean;
  /** Replies of the model that went out with the stock line offered to it (grafo §123 residue: a line it left out comes back once). */
  stock_offers: number;
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
  trigger_uses: 0,
  trigger_counted_at: null,
  stock_offered: false,
  vague_asked: false,
  stock_offers: 0,
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
    // Counted by the turn on what was sent, not read from her message: carried as stored.
    trigger_uses: p.trigger_uses,
    trigger_counted_at: p.trigger_counted_at,
    // Set by the turn, sticky: once true, true for the rest of the conversation.
    stock_offered: p.stock_offered === true,
    vague_asked: p.vague_asked === true,
    stock_offers: Number.isInteger(p.stock_offers) ? p.stock_offers : 0,
  };
};

/** How many model replies may carry the stock line offer in one conversation: one the model left out is offered once more. */
export const MAX_STOCK_OFFERS = 2;

/**
 * The marks this turn's reply leaves on the profile (plan 16 §4.5–§4.6), merged into the stored jsonb by `lead_profile_mark`
 * (0030) — never the whole profile over it (grafo §123 residue). Null when it leaves none.
 * - The stock line counts as said when the model's reply that went out says stock (`stockSaid`, the gate's own reader), or after
 *   `MAX_STOCK_OFFERS` offers it did not use (grafo §123 residue: offered once and left out, it never came back).
 * - The vague-objection question, when the reply that goes out (now, or held for the morning) was written with it.
 */
export const profileMarks = (
  p: LeadProfile,
  t: { stockOffered: boolean; stockSaid: boolean; vagueAsked: boolean },
): Partial<LeadProfile> | null => {
  const marks: Partial<LeadProfile> = {};
  if (t.stockOffered && !p.stock_offered) {
    marks.stock_offers = p.stock_offers + 1;
    if (t.stockSaid || marks.stock_offers >= MAX_STOCK_OFFERS) marks.stock_offered = true;
  }
  if (t.vagueAsked && !p.vague_asked) marks.vague_asked = true;
  return Object.keys(marks).length > 0 ? marks : null;
};

/** `leads.profile` as stored: the jsonb object, or null (absent before 0029, or any other shape). */
export const storedProfileOf = (lead: { profile?: unknown }): Partial<LeadProfile> | null =>
  lead.profile !== null && typeof lead.profile === "object" && !Array.isArray(lead.profile) ? (lead.profile as Partial<LeadProfile>) : null;

/**
 * What this turn folds its reading into, and whether the reading is a replay to leave out (plan 16 §4.1).
 * - A revision (`reviseBase` given) folds the whole burst into the profile its first turn read: that turn's fold covered
 *   only the first messages, and its `score_at` would read the later ones as replayed (code review: m2 of [m1, m2] lost).
 * - n8n's resume answers the message the turn before it already folded (the offer with a question beside it), unless no turn
 *   ever scored this lead (the opening's resume: the opening turn returns before the profile).
 * - Any other turn (the sweep's retry included) is a replay when the last score is past the NEWEST message of its burst: every
 *   message of it was read by the turn that scored. A burst with a message newer than the score (her m2 after a turn that gave
 *   up as `retry_moot` or `superseded` once m1 was folded) folds whole.
 *   shortcut: there the counters of m1 count twice (one interpretation per burst, it cannot be split); a per-message fold would fix it.
 */
export const profileFold = (t: {
  stored: Partial<LeadProfile> | null;
  /** `ReviseTicket.profileBase`; undefined when this turn is no revision. */
  reviseBase?: Partial<LeadProfile> | null;
  isResume: boolean;
  /** `leads.score_at` in ms, NaN when never scored. */
  scoredAt: number;
  /** The newest message of the burst this turn answers, null when it answers no stored burst. */
  batchTo: string | null;
}): { base: Partial<LeadProfile> | null; replayed: boolean } => {
  if (t.reviseBase !== undefined) return { base: t.reviseBase, replayed: false };
  if (t.isResume) return { base: t.stored, replayed: Number.isFinite(t.scoredAt) };
  return { base: t.stored, replayed: t.batchTo !== null && Number.isFinite(t.scoredAt) && t.scoredAt >= Date.parse(t.batchTo) };
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

/**
 * The stored score after one more ruler touch went out (§4.2, −10 each unanswered touch; operator, 2026-10-22). Every touch
 * counts as unanswered when it leaves: her next message runs a turn that rescores from scratch with no unanswered touch, so
 * an answered one never keeps its −10. Null when the lead was never scored (no number to lower). Floored at 0.
 */
export const afterUnansweredTouch = (score: unknown): { score: number; score_band: ScoreBand } | null => {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const s = Math.max(Math.round(score) + SCORE_WEIGHTS.unansweredTouch, 0);
  return { score: s, score_band: bandOf(s) };
};

/** The band in the operator's e-mail subject (§4.2): "🔥 QUENTE · 72", "MORNA · 45", "FRIA · 18"; no score, no tag. */
export const scoreTag = (score: unknown): string | null => {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const s = Math.round(Math.min(Math.max(score, 0), 100));
  const band = bandOf(s);
  return `${band === "quente" ? "🔥 " : ""}${band.toUpperCase()} · ${s}`;
};
