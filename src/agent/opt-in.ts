/**
 * Marketing opt-in (decision of 2026-09-28: option B of
 * docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template only to
 * someone who agreed to receive it from a named business; a click on the ad is not that.
 * So the code — never the model — asks once, inside the 24-hour window, and records a yes.
 *
 * Two pieces, both pure:
 * - `optInQuestion`: a message of its own, sent right after the ruler's first touch when the
 *   operator turns the question on (`channel.askMarketingOptIn === true`; absent = never
 *   asked, never sent).
 * - `acceptsMarketingOptIn`: whether her reply is a yes TO THAT QUESTION. Anything unclear
 *   is a no: a wrong yes sends marketing to someone who never agreed; a wrong no only costs
 *   two touches.
 *
 * Zero imports, so it can be mirrored byte for byte into `supabase/functions/turn/` like the
 * guardrail chain. The turn runs `classifyOptOut` before this; an opt-out never gets here.
 */

/**
 * Names the business (Meta's opt-in guide asks for it) and what she would receive. No coupon:
 * `coupon.active` may be false, and a question promising one is a promise `coupon_exists`
 * vetoes.
 *
 * It goes out as a message OF ITS OWN, right after the ruler's first touch — never inside it.
 * Four of the six `silence_1` variants end on a yes/no of their own ("Conseguiu finalizar
 * seu pedido?"), and a "sim" to that is not consent (second review, 2026-09-28).
 */
export const optInQuestion = (brand: string): string =>
  `Posso te chamar aqui de novo com lembretes e ofertas da ${brand}? Se puder, me responde **SIM**.`;

/** A question back, in any script: "sim?", "pode¿", "sim ？". */
const QUESTION_MARK = /[?¿？]/;

/**
 * The only symbols a yes may carry: 💛 ❤ ♥ 😊 🥰 😍 👍 🙏 🤩 ✨ and punctuation. Anything else —
 * 👎 ❌ 🙄 😒 🤡 — may be the answer itself, and an unknown symbol reads as no.
 */
const HARMLESS = /[!.,\s\u200b-\u200d]|\ufe0f|\u{1f49b}|\u2764|\u2665|\u{1f60a}|\u{1f970}|\u{1f60d}|\u{1f44d}|\u{1f64f}|\u{1f929}|\u2728/gu;

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(HARMLESS, " ")
    // "siiim", "podeee".
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\bsim+\b/g, "sim")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The whole reply must be one of these — "sim, mas só o pedido" is not a yes to offers.
 * Short on purpose; a longer reply is conversation, and the model answers it. No "s": one
 * letter is the commonest typo, and a false yes can cost the number (spam reports), while a
 * false no costs two touches.
 */
const YES = new Set([
  "sim",
  "pode",
  "pode sim",
  "sim pode",
  "pode mandar",
  "sim pode mandar",
  "quero",
  "quero sim",
  "sim quero",
  "claro",
  "claro que sim",
  "sim claro",
  "aceito",
  "sim aceito",
]);

/** She answers the question she can still see: after the service window, no reply counts. */
const ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OptInAnchor {
  /**
   * The body of the last message sent to her before this reply. The caller passes the
   * message the SWEEP recorded as the question (by id, from `marketing_opt_in_asked_at`'s
   * touch), never any outbound: the model sees the history and could repeat the line.
   */
  lastOutbound: string | null;
  /** When the sweep sent the question (`leads.marketing_opt_in_asked_at`). */
  askedAt: Date | null;
  now: Date;
}

/**
 * True only when her reply answers the opt-in question — the last thing she was sent, alone,
 * less than 24 hours ago — and the whole reply is a short yes.
 */
export const acceptsMarketingOptIn = (reply: string, brand: string, anchor: OptInAnchor): boolean => {
  if (anchor.lastOutbound?.trim() !== optInQuestion(brand)) return false;
  if (!anchor.askedAt) return false;
  const age = anchor.now.getTime() - anchor.askedAt.getTime();
  if (age < 0 || age >= ANSWER_WINDOW_MS) return false;
  if (QUESTION_MARK.test(reply)) return false;
  // Anything that is not a letter, a digit or a harmless symbol makes the reply a no.
  const bare = reply.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(HARMLESS, "");
  if (/[^\p{L}\p{N}]/u.test(bare)) return false;
  return YES.has(normalize(reply));
};
