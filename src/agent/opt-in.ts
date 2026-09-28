/**
 * Marketing opt-in (decision of 2026-09-28: option B of
 * docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template only to
 * someone who agreed to receive it from a named business; a click on the ad is not that.
 * So the code — never the model — asks once, inside the 24-hour window, and records a yes.
 *
 * The consent is a KEYWORD, not a "sim". Four review rounds (2026-09-28) found a "sim" that
 * answered something else every time the anchor moved: the touch's own question, the bubble
 * before, the agent's "Tá certinho assim?" before the silence. "Sim" answers anything; only a
 * word nothing else asks for answers this question alone, whatever came before it or after.
 *
 * - `optInQuestion`: a message of its own, after the ruler's first touch, when the operator
 *   turns the question on (`channel.askMarketingOptIn === true`; absent = never asked).
 * - `acceptsMarketingOptIn`: whether her reply gives the keyword, alone, within 24h of the
 *   question. Anything unclear is a no: a wrong yes sends marketing to someone who never
 *   agreed (and spam reports can cost the only number); a wrong no costs two touches.
 * - `revokesMarketingOptIn`: whether a message, at any time, takes the consent back. It lives
 *   here, beside the yes, because the question teaches the word she will revoke with ("não
 *   quero ofertas"), and `classifyOptOut` — which stops everything — does not read it.
 *
 * Zero imports, so it can be mirrored byte for byte into `supabase/functions/turn/` like the
 * guardrail chain. The turn runs `classifyOptOut` before this; an opt-out never gets here.
 */

/** The word she answers with. Nothing else the agent says asks for it. */
export const OPT_IN_KEYWORD = "OFERTAS";

/**
 * Names the business (Meta's opt-in guide asks for it) and what she would receive. No coupon:
 * `coupon.active` may be false, and a question promising one is a promise `coupon_exists`
 * vetoes. Null for a blank brand: a question that names no business is not an opt-in.
 */
export const optInQuestion = (brand: string): string | null =>
  brand.replace(/[\s\u200b-\u200d\ufeff]/g, "") === ""
    ? null
    : `Posso te mandar lembretes e ofertas da ${brand.trim()} por aqui? Se quiser, me responde **${OPT_IN_KEYWORD}**.`;

/** A question back, in any script: "sim?", "pode¿", "sim ？". */
const QUESTION_MARK = /[?¿？]/;

/**
 * The only symbols a yes may carry: 💛 ❤ ♥ 😊 🥰 😍 👍 🙏 🤩 ✨ (any skin tone), the bold she
 * copies back ("*OFERTAS*") and punctuation. Anything else — 👎 ❌ 🙄 😒 🤡 — may be the answer
 * itself, and an unknown symbol reads as no.
 */
const HARMLESS =
  /[!.,*\u2026\s\u200b-\u200d]|\ufe0e|\ufe0f|[\u{1f3fb}-\u{1f3ff}]|\u{1f49b}|\u2764|\u2665|\u{1f60a}|\u{1f970}|\u{1f60d}|\u{1f44d}|\u{1f64f}|\u{1f929}|\u2728/gu;

/**
 * Only the accents Portuguese writes (grave, acute, circumflex, tilde, diaeresis, cedilla).
 * Any other combining mark stays and makes the reply a no: "s̶i̶m̶" is struck through.
 */
const stripAccents = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u0303\u0308\u0327]/g, "");

const normalize = (s: string): string =>
  stripAccents(s)
    .toLowerCase()
    .replace(HARMLESS, " ")
    // "siiim", "ofertasss".
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\bsim+\b/g, "sim")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The whole reply must be one of these — each one carries the keyword; "sim" alone, "pode" or
 * "quero" alone are answers to anything and count as no. "não quero ofertas" is not in the set.
 */
const YES = new Set([
  "ofertas",
  "oferta",
  "sim ofertas",
  "ofertas sim",
  "quero ofertas",
  "sim quero ofertas",
  "pode mandar ofertas",
  "sim pode mandar ofertas",
  "ofertas pode mandar",
  "ofertas por favor",
  "sim oferta",
  "quero oferta",
  "me manda ofertas",
  "aceito ofertas",
  "quero receber ofertas",
]);

/** She answers the question she can still see: after the service window, no reply counts. */
const ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OptInAnchor {
  /** The question the sweep sent (`leads.marketing_opt_in_question_id`); null = never asked. */
  questionId: string | null;
  /** When it went out (`leads.marketing_opt_in_asked_at`), as a Date or the ISO text PostgREST returns. */
  askedAt: Date | string | null;
  now: Date;
}

const toTime = (d: Date | string | null | undefined): number =>
  d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : NaN;

/**
 * True only when the question went out less than 24 hours ago and her whole reply is the
 * keyword (optionally with "sim"/"quero"/"pode mandar"). Any missing or invalid input is a no.
 */
export const acceptsMarketingOptIn = (reply: string, anchor: OptInAnchor): boolean => {
  if (!anchor.questionId) return false;
  const age = toTime(anchor.now) - toTime(anchor.askedAt);
  // Written so NaN (an invalid date, a column missing from the select) fails closed.
  if (!(age >= 0 && age < ANSWER_WINDOW_MS)) return false;
  if (typeof reply !== "string" || QUESTION_MARK.test(reply)) return false;
  // Anything that is not a letter, a digit or a harmless symbol makes the reply a no.
  if (/[^\p{L}\p{N}]/u.test(stripAccents(reply).replace(HARMLESS, ""))) return false;
  return YES.has(normalize(reply));
};

/** What a marketing opt-in covers: the words she would use for it. */
const MARKETING_WORD = /\b(?:ofertas?|promoc(?:ao|oes)|promos?|propagandas?|lembretes?|marketing)\b/;

/** Any negation or request to stop, anywhere in the message. */
const STOP_WORD =
  /\b(?:nao|nem|sem|nunca|jamais|nada|para|pare|parar|chega|cancela|cancele|cancelar|tira|tire|tirar|retira|retirar|remove|remova|remover|sai|sair|dispenso|desisto|mudei)\b/;

/**
 * True when a message takes the marketing consent back: a marketing word next to any
 * negation or request to stop, in the same message. Deliberately loose — the safe side here is
 * revoking: a wrong revoke costs two touches, a missed one sends marketing to someone who said
 * no (LGPD art. 8º §5º). "não quero ofertas do M, quero o G" revokes too, and that is accepted.
 */
export const revokesMarketingOptIn = (text: string): boolean => {
  if (typeof text !== "string") return false;
  const t = stripAccents(text).toLowerCase();
  return MARKETING_WORD.test(t) && STOP_WORD.test(t);
};
