/**
 * Marketing opt-in (decision of 2026-09-28: option B of
 * docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template only to
 * someone who agreed to receive it from a named business; a click on the ad is not that.
 * So the code — never the model — asks once, inside the 24-hour window, and records a yes.
 *
 * Two pieces, both pure:
 * - `optInQuestion`: the line the ruler's first touch carries when the operator turns the
 *   question on (`channel.askMarketingOptIn === true`; absent = never asked, never sent).
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

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Emoji and punctuation around the words carry no answer ("sim!! 💛").
    .replace(/[^\p{L}\p{N}?\s]/gu, " ")
    // "siiim", "simm", "podeee".
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\bsim+\b/g, "sim")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The whole reply must be one of these — "sim, mas só o pedido" is not a yes to offers.
 * Short on purpose; a longer reply is conversation, and the model answers it.
 */
const YES = new Set([
  "sim",
  "s",
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

/**
 * True only when her reply answers the opt-in question and says yes, alone.
 *
 * `lastOutbound` is the last message the agent sent before her reply. Requiring the question
 * in it is what keeps a "sim" to "quer o M?" — asked by the model an hour later, inside the
 * same day — from being read as consent to marketing.
 */
export const acceptsMarketingOptIn = (reply: string, lastOutbound: string | null, brand: string): boolean => {
  if (!lastOutbound?.includes(optInQuestion(brand))) return false;
  const r = normalize(reply);
  // A question back ("sim?", "pode mandar o que?") is not an answer.
  if (r.includes("?")) return false;
  return YES.has(r);
};
