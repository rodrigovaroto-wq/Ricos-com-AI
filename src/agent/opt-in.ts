/**
 * Marketing opt-in (decision of 2026-09-28: option B of
 * docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template only to
 * someone who agreed to receive it from a named business; a click on the ad is not that.
 * So the code — never the model — asks once, inside the 24-hour window, and records a yes.
 *
 * Two pieces, both pure:
 * - `optInQuestion` and `mayAskOptIn`: a message of its own, sent right after a ruler touch
 *   that asks nothing, when the operator turns the question on
 *   (`channel.askMarketingOptIn === true`; absent = never asked, never sent).
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
 */
export const optInQuestion = (brand: string): string =>
  `Posso te chamar aqui de novo com lembretes e ofertas da ${brand}? Se puder, me responde **SIM**.`;

/**
 * Whether the question may follow this touch, as a message of its own. Only after a touch
 * that leaves nothing for her to answer: after "Conseguiu finalizar seu pedido?" or "Me fala o
 * tamanho", her "sim" answers that, in two bubbles as much as in one — and the Cloud API does
 * not guarantee the two arrive in order (second and third reviews, 2026-09-28).
 *
 * So only the `after_price` touch ("Qualquer coisa é só chamar!"), and only while its copy
 * asks nothing — a question added to it later turns this off instead of reopening the hole.
 */
export const mayAskOptIn = (stopPoint: string | undefined, touch: string, brand: string): boolean =>
  stopPoint === "after_price" && brand.trim() !== "" && !QUESTION_MARK.test(touch);

/** A question back, in any script: "sim?", "pode¿", "sim ？". */
const QUESTION_MARK = /[?¿？]/;

/**
 * The only symbols a yes may carry: 💛 ❤ ♥ 😊 🥰 😍 👍 🙏 🤩 ✨ (any skin tone), the bold she
 * copies back ("*SIM*") and punctuation. Anything else — 👎 ❌ 🙄 😒 🤡 — may be the answer
 * itself, and an unknown symbol reads as no.
 */
const HARMLESS =
  /[!.,*…\s\u200b-\u200d]|\ufe0e|\ufe0f|[\u{1f3fb}-\u{1f3ff}]|\u{1f49b}|❤|♥|\u{1f60a}|\u{1f970}|\u{1f60d}|\u{1f44d}|\u{1f64f}|\u{1f929}|✨/gu;

/**
 * Only the accents Portuguese writes (grave, acute, circumflex, tilde, diaeresis, cedilla).
 * Any other combining mark stays and makes the reply a no: "s̶i̶m̶" is struck through.
 */
const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-̧̃̈]/g, "");

const normalize = (s: string): string =>
  stripAccents(s)
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

/** Ids, not text: the model sees the history and could write the same line. */
export interface OptInAnchor {
  /** Id of the last message sent to her before this reply (`messages.id`, outbound). */
  lastOutboundId: string | null;
  /** Id of the question the sweep sent (`leads.marketing_opt_in_question_id`). */
  questionId: string | null;
  /** When the sweep sent it (`leads.marketing_opt_in_asked_at`). */
  askedAt: Date | null;
  now: Date;
}

/**
 * True only when her reply answers the opt-in question — the last message she was sent, less
 * than 24 hours ago — and the whole reply is a short yes. Any missing or invalid input is a no.
 */
export const acceptsMarketingOptIn = (reply: string, anchor: OptInAnchor): boolean => {
  if (!anchor.questionId || anchor.lastOutboundId !== anchor.questionId) return false;
  const age = (anchor.now?.getTime() ?? NaN) - (anchor.askedAt?.getTime() ?? NaN);
  // Written so NaN (an invalid date, a column missing from the select) fails closed.
  if (!(age >= 0 && age < ANSWER_WINDOW_MS)) return false;
  if (QUESTION_MARK.test(reply)) return false;
  // Anything that is not a letter, a digit or a harmless symbol makes the reply a no.
  if (/[^\p{L}\p{N}]/u.test(stripAccents(reply).replace(HARMLESS, ""))) return false;
  return YES.has(normalize(reply));
};
