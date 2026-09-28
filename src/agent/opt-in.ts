/**
 * Marketing opt-in (decision of 2026-09-28: option B of
 * docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template only to
 * someone who agreed to receive it from a named business; a click on the ad is not that.
 * So the code — never the model — asks, inside the 24-hour window, and records the answer.
 *
 * ROOT RULE: no text she types ever GRANTS consent. Eight review rounds (2026-09-28) read her
 * text — "sim", then a keyword, then negations for the way back — and every reading had holes
 * both ways, because intent in free text is not regular (`.claude/memory/negation-blindness.md`).
 * The channel had the structured answer all along and threw it away: a tap on a reply button
 * carries the id WE gave the button (`InboundMessage.reply`, src/channel/whatsapp.ts). So:
 *
 * - consent = a tap on this question's "yes" button, within 24h;
 * - refusal = a tap on any question's "no" button, Meta's `user_preferences` stop, error
 *   131050 or the general opt-out — structured, recorded by the caller as `declinedAt`;
 * - her TEXT can only SUSPEND: any mention of marketing clears the consent and lets the
 *   question be asked again, once, with the buttons. A wrong suspension costs one question in
 *   the window, not the consent; a revocation in words the stems miss is still covered by
 *   Meta's own switch (`user_preferences`) and by the general opt-out.
 *
 * Zero imports, so it can be mirrored byte for byte into `supabase/functions/turn/` like the
 * guardrail chain. Nothing calls it yet: the turn and the sweep wire it after PR #37 merges.
 */

const YES_PREFIX = "optin:yes:";
const NO_PREFIX = "optin:no:";

/** She answers the question she can still see: after the service window, a yes does not count. */
const ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The question and its two buttons, for `replyButtonsMessage`. Names the business (Meta's
 * opt-in guide asks for it) and what she would receive. No coupon: `coupon.active` may be
 * false, and a question promising one is a promise `coupon_exists` vetoes.
 *
 * `nonce` is fresh per question (the caller's `crypto.randomUUID()`, stored on the lead): a
 * tap on an older question's yes is not a yes to this one. Null for a blank brand or nonce —
 * a question that names no business is not an opt-in.
 */
export const optInMessage = (
  brand: string,
  nonce: string,
): { body: string; buttons: [{ id: string; title: string }, { id: string; title: string }] } | null => {
  const blank = (s: string) => s.replace(/[\s\u200b-\u200d\ufeff]/g, "") === "";
  if (blank(brand) || blank(nonce)) return null;
  return {
    body: `Posso te mandar lembretes e ofertas da ${brand.trim()} por aqui?`,
    buttons: [
      { id: `${YES_PREFIX}${nonce}`, title: "Quero ofertas" },
      { id: `${NO_PREFIX}${nonce}`, title: "Não, obrigada" },
    ],
  };
};

const toTime = (d: Date | string | null | undefined): number =>
  d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : NaN;

export interface OptInQuestion {
  /** The current question's nonce (`leads.marketing_opt_in_nonce`); null = never asked. */
  nonce: string | null;
  /** When it went out (`leads.marketing_opt_in_asked_at`), Date or the ISO text PostgREST returns. */
  askedAt: Date | string | null;
  now: Date;
}

/**
 * What a tap says. "yes" only for the CURRENT question's yes button, tapped less than 24h after
 * it went out. "no" for ANY question's no button, at any time — a no is always a no. Null for
 * everything else, typed text included (it has no `reply`): text never grants.
 */
export const optInAnswer = (reply: { id: string } | undefined, question: OptInQuestion): "yes" | "no" | null => {
  const id = reply?.id;
  if (typeof id !== "string") return null;
  if (id.startsWith(NO_PREFIX)) return "no";
  if (!question.nonce || id !== `${YES_PREFIX}${question.nonce}`) return null;
  const age = toTime(question.now) - toTime(question.askedAt);
  // Written so NaN (an invalid date, a column missing from the select) fails closed.
  return age >= 0 && age < ANSWER_WINDOW_MS ? "yes" : null;
};

/**
 * Words she would use for what the opt-in covers, as stems: "ofertinha", "promo", "cupons",
 * "publicidade", "mkt". `\bcupo` and not `cupo`: "me preocupo com golpe" is the commonest
 * objection, not a revocation (eighth review). "ofet"/"ofret" are the usual typos.
 */
const MARKETING_STEM =
  /ofert|ofet|ofret|promo|propag|public|divulg|\bmkt\b|lembret|\bcupo|descont|novidad|anunci|spam|marketing/;

/** "ofertaaas", "promooo": any run of one letter is read as one. */
const collapse = (s: string): string => s.replace(/(\p{L})\1+/gu, "$1");

/**
 * Whether her message suspends the consent: TYPED text that mentions marketing at all. No
 * negation is read — "não quero ofertas" and "tem desconto no pix?" both suspend, and the
 * second one is simply asked again with the buttons. A tap never suspends, even though
 * "Quero ofertas" contains the word: the tap is the structured answer, read by `optInAnswer`.
 */
export const suspendsMarketingOptIn = (message: { body: string; reply?: { id: string } }): boolean => {
  if (message.reply || typeof message.body !== "string") return false;
  const t = collapse(message.body.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  return MARKETING_STEM.test(t);
};

export interface OptInState {
  /** `leads.marketing_opt_in_asked_at` — the last question. */
  askedAt: Date | string | null;
  /** `leads.marketing_opt_in_at` — consent in force. */
  optInAt: Date | string | null;
  /** `leads.marketing_opt_in_suspended_at` — her text suspended it. */
  suspendedAt: Date | string | null;
  /** `leads.marketing_opt_in_declined_at` — a structured no. Final. */
  declinedAt: Date | string | null;
}

/**
 * Whether the question may go out (the caller also needs `channel.askMarketingOptIn === true`
 * and an open window). Never after a structured no; never while consent is in force; once when
 * never asked; once more after each suspension. Any value in `declinedAt` or `optInAt` counts,
 * readable or not (safe: do not ask), and a suspension with an unreadable date does not reopen
 * the question.
 */
export const mayAskOptIn = (s: OptInState): boolean => {
  if (s.declinedAt || s.optInAt) return false;
  if (!s.askedAt) return true;
  return toTime(s.suspendedAt) > toTime(s.askedAt);
};
