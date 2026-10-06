/**
 * Only the slice of the business config the gates actually read. Declared here, and
 * not imported, so this file has zero imports and runs byte-identical in Deno (the
 * Edge Function) and in vitest — one source of truth, no copy to drift.
 * `BusinessConfig` satisfies it structurally.
 */
/**
 * A kit of 2 or 3 pieces with its own checkout (operator, 2026-09-25): the Coinzz checkout
 * sells a fixed quantity, so each path has one link per quantity, each with its own price
 * and discount. One piece stays in `prices` and `checkout`; kits add to them.
 */
export interface Kit {
  path: "cod" | "prepay";
  units: number;
  priceBrl: number;
  discountPercent: number;
  checkoutUrl: string;
}

export interface GateConfig {
  /**
   * OPTIONAL, and absent means one piece only: production reads the whole config from the
   * `BUSINESS_CONFIG` secret, so until the operator writes the kits there, no kit price
   * exists and the gate refuses every one.
   */
  kits?: readonly Kit[];
  prices: {
    codBrl: number;
    prepayBrl: number;
    anchorBrl: number;
    prepayDiscountPercent: number;
    /**
     * The most installments the prepaid card checkout offers. Absent, installments are
     * off: the agent may not offer any, on either path. Present, she may offer up to this
     * many on the prepaid card checkout, and never at the door (2026-09-24).
     */
    prepayMaxInstallments?: number;
  };
  delivery: {
    codDaysMin: number;
    codDaysMax: number;
    /**
     * The prepaid window in working days, kept only so the gate can still refuse a range
     * against a configured one. It is **absent everywhere as of 2026-09-09** and meant to
     * stay that way: the deadline briefly was 3 to 10 working days, then Logzz confirmed it
     * varies by region, so the honest shape is the average below and not a range. Absent,
     * the gate refuses every window on the prepaid path — which is the right default.
     */
    prepayDaysMin?: number;
    prepayDaysMax?: number;
    /**
     * The prepaid deadline stopped being a range on 2026-09-09: Logzz varies it by region
     * and the only honest number is an average. Present and `prepayVariesByRegion` on, the
     * agent may say this one number as an average; absent, it may say no prepaid deadline
     * at all — which is the right default whenever nobody has measured one.
     */
    prepayAvgDays?: number;
    prepayVariesByRegion?: boolean;
    warrantyDays: number;
    /**
     * Both offers ship free as of 2026-09-09 — the operator zeroed the freight on the
     * delivery offer and the prepaid one never had one. The flag exists so the day a
     * freight comes back, setting it to `false` restores the old refusal instead of
     * needing the gate rewritten under pressure.
     *
     * OPTIONAL, and the absent key must read as the truth. That is the shape of this
     * deployment: production reads the whole config from a `BUSINESS_CONFIG` secret that
     * overrides the fallback wholesale, so a key added in code is simply missing there
     * until someone edits the secret. Until 2026-09-22 the truth was free, so absent read
     * as free (`!== false`). On 2026-09-22 the operator decided the operation does NOT
     * offer free shipping, so absent now reads as NOT free: only an explicit `true` makes
     * it free (`=== true`), in every gate and in the prompt alike. `codFreeShipping` below
     * splits it by path (2026-09-28): this key stays "free on BOTH paths".
     */
    freeShipping?: boolean;
    /**
     * Free shipping on cash on delivery only (operator, 2026-09-28): the delivery offer's
     * freight is R$ 0,00 for her, while the prepaid checkout charges it by region. So "frete
     * grátis" is true in a sentence about paying at the door and false next to the prepaid
     * offer. OPTIONAL, and ABSENT reads as today's truth — free on delivery — so the test is
     * `!== false`: production's `BUSINESS_CONFIG` does not carry the key. `false` brings back
     * the 2026-09-22 reading (not free on either path); `freeShipping === true` (free on
     * both) overrides it.
     */
    codFreeShipping?: boolean;
    /**
     * Whether a same-day modality ("Express", "hoje em até 4 horas") really exists. It is
     * up in no region as of 2026-09-24, so absent reads as off: the briefing never
     * mentions it and the gate refuses same-day and Express, whatever the region query said.
     */
    expressActive?: boolean;
  };
  hours: { openHour: number; closeHour: number; timeZone?: string };
  /** `code`: what she types at checkout (R17.4 a), named in the briefing once the coupon is hers. */
  coupon: { percent: number; active: boolean; code?: string };
  cod: { physicalOnDeliveryActive: boolean };
  /** Where she writes to exchange or return. Absent, the briefing names no address. */
  support?: { email?: string };
  /**
   * A size exchange's freight is hers (operator, 2026-09-29, R17.1): she pays it through a Mercado
   * Pago link, outside the Coinzz and Logzz checkouts. OPTIONAL, and absent reads as today's truth
   * — the exchange is never free — with no amount and no link: the agent says the freight is hers
   * and an order's exchange goes to a person. Both present, the agent quotes `feeBrl` and sends the
   * link. The return stays free (R16.3).
   */
  exchange?: { feeBrl?: number; checkoutUrl?: string };
  /**
   * A customer count the operation can back. Absent, no customer count may be said;
   * present, only this one ("mais de N clientes satisfeitas").
   */
  socialProof?: { satisfiedCustomers?: number };
  /** There is no store. Present, the agent may say one is planned in this city. */
  store?: { physicalStorePlanCity?: string };
  /**
   * Urgency the operation can actually back. Scarcity sells, and invented scarcity is
   * misleading advertising (CDC art. 37) plus a promise nobody can keep — so the agent
   * may only use what is declared here. Leave it out and every urgency claim is vetoed,
   * which is the right default while nothing counts units or runs a clock.
   */
  scarcity?: {
    /** Units really left, from whoever owns the stock. */
    unitsLeft?: number | null;
    /** ISO instant the current offer really ends. */
    offerEndsAt?: string | null;
    /**
     * The operator's switch. With it on, the chain stops refusing urgency it cannot
     * verify — the agent may say a batch is running out without a counted number
     * behind it. Off by default, and it is a decision the operator owns, not the
     * agent: the exposure is CDC art. 37 §1º (quantity is information capable of
     * inducing error) and it lands on the WhatsApp number, which has no backup.
     *
     * Even with it on, prefer `unitsLeft`: a number that is the same for everyone all
     * day reads as real, and one improvised per conversation is what gets noticed —
     * the customer who kept the screenshot is the one who complains.
     */
    allowUnverified?: boolean;
  };
}

/**
 * The seventeen gates every outbound message passes before it reaches the customer.
 *
 * These are deterministic on purpose: they cost nothing to run, they run on every
 * message, and — the reason they are code and not prompt text — they can be proven
 * by a test. A guardrail nobody can test is a guardrail nobody knows works.
 *
 * Order matters. Opt-out comes first because it is irrevocable: once she asked to
 * stop, no later gate may let anything through.
 */

/**
 * `warn` is a soft gate's finding (2026-09-24): recorded in the trace, never blocks. The
 * operator split the chain in two after persona runs lost sales to vetoes on sentences
 * that cost nothing when wrong — a repeated line, a window missing its label, a store
 * question. Money, law and the body stay `block`.
 */
export type Verdict = "pass" | "block" | "warn";

export interface GateTrace {
  gate: string;
  verdict: Verdict;
  detail?: string;
}

export interface GateContext {
  config: GateConfig;
  /** Layer 1 (the 24/7 receipt message) skips the business-hours gate. */
  layer: "auto" | "agent";
  optedOut: boolean;
  now: Date;
  paymentPath: "cod" | "prepay";
  /**
   * Pre-sale is the agent promising; logistics is the agent reporting a date the
   * carrier already scheduled. "Chega amanhã" before the order exists is the broken
   * promise that produces refusals at the door. The same words on the eve of a
   * scheduled delivery are a fact — and that message is the one that PREVENTS the
   * refusal. Same string, opposite effect, so the gate has to know which is which.
   */
  stage?: "presale" | "logistics";
  /** Literal texts sent recently, to catch the same message going out en masse. */
  recentOutbound?: readonly string[];
  /** Testimonials the knowledge base actually holds. Anything else is invented. */
  knownTestimonials?: readonly string[];
  /** Anti-ban counters, owned by the channel layer. */
  pacing?: { sentLastHour: number; hourlyLimit: number; sentToday: number; dailyLimit: number };
  /**
   * The size the availability query has actually answered for, at her postcode.
   * `undefined` means nothing was checked — and then no size may be recommended.
   */
  sizeChecked?: string;
  /** Pieces this conversation is about (kits); absent means one. */
  units?: number;
  /**
   * The total of the order a post-order touch speaks of (sixth review): a total the
   * platform closed, a coupon, or a price changed since, is still the amount she pays.
   */
  orderAmountBrl?: number;
  /**
   * The checkout returned a same-day modality for her postcode ("Express — receba hoje
   * em até 4 horas"). Only then is "hoje" a fact rather than the broken promise that
   * produces a refusal at the door.
   */
  sameDayWindow?: boolean;
  /**
   * Whether the region lookup answered for her postcode this turn. `false` means it did
   * not — no CEP yet, or the lookup failed (the Coinzz endpoint started redirecting on
   * 2026-09-24) — and then no sentence may affirm that delivery reaches her. `undefined`
   * (the follow-up sweep, the fixed receipts) leaves the `coverage_claim` gate idle.
   */
  regionKnown?: boolean;
  /**
   * Her region has no cash on delivery: the region lookup answered so this turn, or the lead
   * carries it from an earlier one (`leads.address.codAvailable === false`, the sweep). Only then,
   * or on a prepaid order's own touches, is "você paga na entrega" a lie — `paymentPath: "prepay"`
   * alone also means she chose prepaid where delivery exists, and there naming the delivery as the
   * other option is true (operator, 2026-09-29, R16.2).
   */
  codUnavailable?: boolean;
  /**
   * The reply to her putting the purchase off ("vou pensar", "depois eu compro"), the only place
   * the declared stock may be said (operator, 2026-09-29, R16.5). Absent everywhere else, and
   * then `scarcity_claim` refuses any stock or deadline, declared or not.
   */
  postponing?: boolean;
  /**
   * The fixed reply to a size exchange on an order (R17.1), the only place the exchange's freight
   * (`exchange.feeBrl`) may be said. Absent everywhere else, and then that amount is one more price
   * the shop does not have.
   */
  exchanging?: boolean;
  /**
   * Whether her message asks for testimonials or proof from other customers (`asksForTestimonial`).
   * Testimonials are said only when she asks (R16.7): `false` makes `invented_testimonial` refuse any
   * mention of them. `undefined` (the sweep, the fixed replies) leaves that check idle, as `regionKnown`.
   */
  askedTestimonial?: boolean;
  /**
   * Whether her message asks what the agent is (`asksWhatSheIs`). Q10, line 2: she never announces
   * she is virtual on her own, so `false` makes `humanity_claim` refuse "assistente virtual", IA,
   * robô. `undefined` (the sweep, the fixed replies) leaves that check idle, as `askedTestimonial`.
   */
  askedIdentity?: boolean;
}

const norm = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * The window is a business decision in Brazilian hours, and the runtime clock is not:
 * Supabase Edge Functions run in UTC, where `getHours()` turned "6h to midnight" into
 * 03:00-21:00 in São Paulo. That silenced the agent through the evening — peak WhatsApp
 * hours for this audience — and scheduled held replies for 3am, the exact hour the
 * follow-up code calls "how a number gets reported".
 */
/**
 * The prepaid average, but only when the config also says the deadline varies by region.
 *
 * The two keys were written to mean one thing together and read as one thing alone: the
 * gate looked at `prepayAvgDays` and never at `prepayVariesByRegion`, so the flag was
 * decorative. Turning it off was supposed to take the agent back to saying no prepaid
 * deadline at all — the right default whenever nobody has measured one — and instead it
 * changed nothing, which is the worst kind of switch: the operator flips it, the panel
 * says off, and the agent keeps quoting the average.
 */
const prepayAverage = (d: {
  prepayAvgDays?: number;
  prepayVariesByRegion?: boolean;
}): number | undefined => (d.prepayVariesByRegion ? d.prepayAvgDays : undefined);

export const BUSINESS_TZ = "America/Sao_Paulo";

/**
 * The hour on the clock in `timeZone`, 0 to 23. `hourCycle: "h23"`, never `hour12: false`:
 * on Node 20 (ICU 78.2) `hour12: false` resolves to `h24` and midnight reads "24", which
 * the business-hours gate would take as outside a 0-24 window. Deno 2.9 happens to resolve
 * h23, so this was latent in production — and live in a test, which passed or failed
 * depending on which `node` came first on PATH (2026-09-22).
 */
export const hourIn = (at: Date, timeZone: string): number =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at),
  );

/** A comma that ends a phrase. The one in "R$ 12,99" sits between digits and ends nothing. */
const PHRASE_COMMA = /(?<!\d),|,(?!\d)/;

/**
 * Whether the token at `at` is denied in its own clause. The agent has to be able to
 * say the honest sentence that contains the very thing the gate looks for: "ele não
 * emagrece" and "não consigo oferecer 30% de desconto" are both required answers, and
 * both read as violations to a regex that only sees the token. The clause boundary is
 * what stops "não precisa de academia: ele emagrece" from hiding behind an earlier no.
 *
 * `sem` is the exception, and it used to be treated like the rest. It denies only the
 * noun it is attached to, not everything after it: "sem promessa de emagrecimento" is
 * an honest sentence, while "sem juros e sem burocracia, sai por R$ 59,90" and "sem
 * esperar muito, chega amanhã" are a made-up price and a same-day promise that the
 * chain let through, exempted by a word that denied neither. So it only counts within
 * its own comma-bounded phrase and a couple of words of the token. `nem` needs no such
 * guard: it only ever carries an earlier negation forward ("não emagrece nem afina").
 */
const negatedAt = (t: string, at: number): boolean => {
  const before = t.slice(Math.max(0, at - 30), at);
  const clause = before.split(/[:;.!?]/).pop() ?? "";
  if (/\b(nao|nunca|jamais|nem)\b/.test(clause)) return true;
  return /\bsem\b(?:\s+\S+){0,2}\s*$/.test(clause.split(PHRASE_COMMA).pop() ?? "");
};

/**
 * Narrower than `negatedAt`: the denial has to govern the token itself, in its own
 * comma-bounded phrase — "não dá pra parcelar", "não tem parcelamento", "sem
 * parcelamento", "não temos entrega expressa". Any other word between them breaks it:
 * "não tem problema parcelar em 6x" and "não se preocupe, parcela em 6x" are promises.
 */
const deniedJustBefore = (t: string, at: number): boolean =>
  /\b(?:nao|nem|sem)\s+(?:(?:da|tem|temos|ha|existe|aceita\w*|consig\w*|conseguimos|posso|podemos|faz|fazemos|trabalh\w*|rola|e\s+possivel|oferec\w*|precisa)\s+)?(?:(?:ir|vir)\s+)?(?:(?:pra|como|com|de|a|o)\s+)?(?:entrega\s+)?$/.test(
    (t.slice(Math.max(0, at - 40), at).split(/[:;.!?\n]/).pop() ?? "").split(PHRASE_COMMA).pop() ?? "",
  );

/**
 * Whether the message hands the same-day question back to the checkout instead of
 * answering it. Telling her the Express modality exists is honest and converts; saying
 * it will happen at her address is a promise only the checkout can make. The difference
 * is one clause, and this is it.
 */
const defersToCheckout = (t: string): boolean =>
  /\b(confer|verific|checar|checa|consultar?|ver\s+se)\w*\b/.test(t) ||
  /\bdisponibilidade\b/.test(t) ||
  /\bse\s+(estiver|tiver|houver)\b/.test(t) ||
  /\bdepende\b/.test(t);

/**
 * Every amount in the text, with where it sits. Two shapes, because customers and the
 * agent use both: "R$ 129,90" and the bare "129,90 reais". The second used to be
 * invisible, so "custa 200 reais" — a number the operation does not have — passed the
 * price gate untouched.
 */
/**
 * Right before the price a comparison is made against: "em vez de", "contra", "e não",
 * "desconto sobre os". Never "do que": "menos do que R$ 272,79" is the lying comparative
 * (second review).
 */
const COMPARED_AGAINST =
  /\b(?:em\s+vez\s+d[eoa]s?|ao\s+inves\s+d[eoa]s?|no\s+lugar\s+d[eoa]s?|abaixo\s+d[eoa]s?|contra\s+(?:os?\s+)?|e\s+nao|(?:desconto|%)\s+sobre\s+(?:os?|as?)|comparad[oa]\s+(?:a|com)(?:\s+os?)?)\s*$/;

const moneyMatches = (text: string): Array<{ value: number; at: number }> =>
  [...text.matchAll(/r\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)|\b([\d.]+,\d{2}|\d+)\s*reais\b/gi)].map(
    (m) => ({
      // "R$ 129.90" is the same price as "R$ 129,90" and used to parse as 12990 — a
      // number the operation does not have, so the correct price was vetoed. A dot is a
      // thousands separator only when it is not the decimal one: exactly two digits after
      // the last dot, and no comma anywhere, means she wrote it the other way round.
      value: Number(
        /^\d{1,3}(?:\.\d{3})*\.\d{2}$|^\d+\.\d{2}$/.test(m[1] ?? m[2]!)
          ? (m[1] ?? m[2]!).replace(/\.(?=\d{3})/g, "")
          : (m[1] ?? m[2]!).replace(/\./g, "").replace(",", "."),
      ),
      at: m.index ?? 0,
    }),
  );

/**
 * The sentence around `at`. A stop is `.`, `!` or `?` followed by a space or the end, or
 * a line break — so the decimal dot in "R$ 12.99" does not cut the amount off from its
 * own sentence. Commas, colons and semicolons stay inside: "na entrega, nenhum frete a
 * mais: você paga R$ 129,90 na porta" is one sentence.
 */
const sentenceAt = (t: string, at: number): string => {
  const stop = (i: number): boolean =>
    t[i] === "\n" || (/[.!?]/.test(t[i] ?? "") && (i + 1 >= t.length || /\s/.test(t[i + 1]!)));
  let start = at;
  while (start > 0 && !stop(start - 1)) start--;
  let end = at;
  while (end < t.length && !stop(end)) end++;
  return t.slice(start, end);
};

/**
 * Every sentence of `t`: cut after `.`, `!` or `?` unless a digit sits on BOTH sides,
 * and at a line break — so "R$ 129.90" stays whole, as in `sentenceAt`, but "Dá pra parcelar.Quer?" is
 * still two sentences and the promise is not hidden inside a question (second review,
 * 2026-09-24).
 */
const sentencesIn = (t: string): string[] =>
  t.split(/(?<=[.!?])(?!\d)|(?<=\D[.!?])(?=\d)|\n/).filter((s) => s.trim());

/**
 * A negative lookahead, as regex source: "no new subject starts here". Used by
 * `shipping_promise` to stop an amount from being read as the freight's once the
 * sentence has moved on to another subject. See the gate for why each word is in it.
 */
const NOT_NEW_SUBJECT =
  String.raw`(?!(?<!\b(?:para|pra|com|sobre|em|por|ate|entre|contra|sob|sem|que)\s+)\b[oa]\s+(?:produto|colete|cinta|preco|pedido|antecipado|total)\b|(?<=(?:,|\be|\bmas)\s+)o\s+valor\s+(?:e|fica|sai|sera|custa|vai\s+dar)\b)`;
/** An amount the sentence gives as the freight's own, every occurrence. Compiled once; see `shipping_promise`. */
const ATTRIBUTED_TO_SHIPPING = new RegExp(
  `\\bfrete\\b(?:${NOT_NEW_SUBJECT}[^.!?]){0,40}?\\b(e|fica|custa|sai|sera|vai\\s+dar|de|em\\s+torno\\s+de|cerca\\s+de|uns|aproximadamente)\\b(?:${NOT_NEW_SUBJECT}[^.!?]){0,12}?\\br\\$\\s*[\\d.,]+`,
  "g",
);

// The prepaid path's names. "Cartão" only with its own preposition ("dinheiro ou cartão" is
// paid at the door), "link" only as the payment link ("te mando o link" is the checkout of
// both paths).
const PREPAY_NAME =
  /\b(?:antecipa\w*|adianta\w*|pix|boleto|transferencia|a\s+vista|online|deposito|pelo\s+link|link\s+de\s+pagamento|pag\w*\s+(?:antes|agora|adiantado|hoje|ja)|(?:no|pelo|com|via)\s+(?:cartao|credito|debito))\b/g;
// The delivery path's names. The courier and the door are in both paths ("no pix, o
// entregador leva…"): only paying there names this one.
const COD_NAME = /\bna\s+entrega\b|\bpag\w*\s+(?:(?:so|tudo|apenas|r\$\s*[\d.,]+)\s+)?(?:na\s+(?:porta|mao)|(?:ao|pro)\s+entregador)\b/g;

/**
 * `shipping_promise`'s reading of "the freight costs her nothing" (2026-09-28). A free word
 * with `frete` within 24 characters before it (or 16 after, for "grátis o frete"), or with
 * `entrega` right before it ("a entrega é grátis"); and the freight denied as a noun ("sem
 * frete", "não tem frete", "nem no pix tem frete", "não cobramos frete", "o frete não é
 * cobrado"). The last three passed every gate on the prepaid path until 2026-09-28.
 * "Não esqueça de pagar o frete" and "não deixe de pagar o frete" are the reminder that it
 * exists; "não cobrado à parte" says it is included, not free, and stays out.
 */
const FREE_WORD = /\b(?:gratis|gratuit[oa]|zero|free|por\s+nossa\s+conta|de\s+gra[cs]a|custa\s+nada)\b/g;
const FREIGHT_DENIAL =
  /\b(?:sem|nao\s+tem|nao\s+ha|zero\s+de)\s+frete\b|(?<!\bnao\s+(?:se\s+)?)\b(?:nada\s+de|nenhum|zero|livre\s+de|isent\w*\s+de|esquec\w*)\s+(?:o\s+)?frete\b|\bnem\b[^.!?,]{0,20}?\b(?:tem|ha|existe|cobr\w*|pag\w*)\s+(?:o\s+|de\s+|nenhum\s+)?frete\b|\b(?:nao|nunca|sem)\s+(?:(?!esquec|deix)[a-z]+\s+){0,2}?(?:cobr|pag)\w*\s+(?:o\s+|de\s+|nenhum\s+)?frete\b(?!\s+(?:a\s+parte|separad\w*|por\s+fora))|\bfrete\b(?:\s+[a-z]+){0,3}?\s+(?:nao|nunca)\s+(?:e\s+|sera\s+|vai\s+ser\s+|esta\s+sendo\s+)?cobrad[oa]\b(?!\s+(?:a\s+parte|separad\w*|por\s+fora))/g;
/**
 * The free claim denied, which is the honest prepaid answer: "o frete (do pix) não é grátis",
 * "no pix não tem frete grátis", "nem no pix tem frete grátis". Not when "só" follows ("não é
 * grátis só na entrega" says it is free elsewhere too), and not inside a question ("não é
 * frete grátis?" offers it).
 */
const FREE_DENIED =
  /(?:\b(?:frete|entrega)\b(?:\s+(?!gratis|gratuit|zero|free)[a-z]+){0,4}?\s+(?:nao|nunca)\s+(?:e|sai|fica|vai\s+ser|sera|esta)\s+|(?:\b(?:nao|nunca)|\bnem(?:\s+(?:n[oa]|pel[oa]|com|via|pagando|pagar)(?:\s+[a-z]+)?)?)\s+(?:tem|ha|existe|temos|oferec\w*|damos|rola|vem\s+com|inclui\w*|e|sai|fica)\s+(?:com\s+)?(?:o\s+)?frete\s+)(?:gratis|gratuit[oa]|de\s+gra[cs]a|zero)\b(?!\s+(?:so|apenas|somente)\b)(?![^.!?\n]*\?)/g;
/**
 * The only sentences a free-shipping claim may stand in while cash on delivery alone ships free
 * (2026-09-29, grafo §32). Three rounds (§29–§31) tried to prove from free text that a "grátis"
 * was confined to the door — a deny-list of what reaches past it (`BEYOND_COD`), then an allow-list
 * of payment verbs (`COD_PAY`) — and each review found a new family passing ("…e no site", "…e
 * pela internet", "…e na Coinzz", the price's decimal comma read as a clause end). A sentence has
 * unbounded shapes; this set does not. So the claim's WHOLE sentence (cut at `.`, `!`, `?` and a
 * line break, never at a comma) has to be one of these, after `norm`, with its runs of spaces
 * collapsed and the quotes, emoji and punctuation at its ends trimmed. Anything else costs a
 * rewrite, and the prompt teaches the first form word for word. The prices are the delivery's
 * (`codBrl` and the delivery kits), exact, never a prepaid one. `payWord`: only the cores that say
 * paying on delivery ("pagando / no pagamento na entrega"), for the prepaid path, where a bare "na
 * entrega" reads as "when it arrives" (2026-09-29, grafo §33).
 */
const canonicalFree = (codPrices: readonly number[], payWord: boolean): RegExp => {
  const price = `(?:${codPrices.map((v) => String.raw`r\$ ?${v.toFixed(2).replace(".", "[.,]")}`).join("|")})`;
  const free = `(?:gratis|gratuito)`;
  const isFree = `(?:e|sai) ${free}(?: pra voce)?`;
  const pay = `(?:pagando|no pagamento|com pagamento|com o pagamento|pagamento) na entrega`;
  const payAfter = `(?:pagando|no pagamento|com pagamento) na entrega`;
  const lead = `(?:(?:e|ah|ah e|olha|e olha|aqui|e aqui|lembrando que|e lembrando que|so lembrando que),? )?`;
  const core = (
    payWord
      ? [`${pay},? o frete ${isFree}`, `(?:o )?frete ${isFree} ${payAfter}`, `frete ${free} ${payAfter}`]
      : [
          `${pay},? o frete ${isFree}`,
          `na entrega,? o frete ${isFree}`,
          `(?:o )?frete ${isFree} (?:${payAfter}|na entrega)`,
          `frete ${free} (?:${payAfter}|na entrega)`,
          `na entrega,? nao tem frete`,
          `na entrega,? nenhum frete a mais`,
          `o frete na entrega ${isFree}`,
        ]
  ).join("|");
  const receive = `(?:receber|o colete chegar)`;
  const pays = `voce (?:so )?paga (?:so )?(?:(?:o valor de |os )?${price}(?: quando ${receive}| na porta)?|quando ${receive})(?: e mais nada)?`;
  const tail = `(?:(?:,? e |: |, | [—–-] )(?:${pays}|sem nada a mais na porta))?`;
  const courtesy = `(?:,? (?:ta bom|ta|viu|amiga|linda|ok))?`;
  return new RegExp(`^${lead}(?:${core})${tail}${courtesy}$`);
};
/** A sentence as `canonicalFree` reads it: one space between words, nothing but words at its ends. */
const canonicalShape = (s: string): string =>
  s.replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
/**
 * A sentence that names another way to pay or buy, or every way at once: the prepaid path's names
 * (`PREPAY_NAME`), where it is bought (site, internet, Coinzz), its means (pix, "nos cartões"), and
 * "pros dois", "todas as formas", "qualquer pagamento", "outro pagamento". Next to a free sentence
 * that passed, such a sentence extends the free to it unless it denies the free or says the freight
 * is charged there (grafo §33). Not a bare "link", "checkout" or "cartão", for `PREPAY_NAME`'s reason:
 * "te mando o link", "quem escolhe o dia é você, no checkout" and "dinheiro ou cartão" are the
 * delivery's too, and were vetoed next to the canonical sentence (revisão do PR #39, achado 5). With
 * "também" they still extend it (`PAYISH`): "Cartão também.", "No link também."
 */
const OTHER_PAYMENT =
  /\b(?:site|internet|coinzz|pix)\b|\b(?:n[oa]s|pel[oa]s|com|via)\s+cartoes\b|\b(?:n[oa]s|pr[oa]s|para\s+[oa]s|em)\s+(?:dois|duas|ambos|ambas)\b|\btod[oa]s\s+(?:[oa]s\s+)?(?:formas?|pagamentos?|caminhos?|jeitos?|opc\w*|modalidades?|meios?)\b|\b(?:qualquer|outr[oa]s?)\s+(?:uma?\s+)?(?:formas?|pagamentos?|caminhos?|jeitos?|opc\w*|modalidades?|meios?)\b/;
/**
 * "Também", "igual", "o mesmo", "idem": they extend the free sentence only about a payment — "Antes
 * também.", "Parcelando também.", "E antes? Também!" (the question before it). "Isso mesmo!", "Eu
 * também uso!" and "Tem no G também." name none and pass.
 */
const ALSO = /\b(?:tambem|igua\w*|mesm[oa]s?|idem)\b/;
const PAYISH = /\b(?:pag\w*|parcel\w*|antes|agora|hoje|celular|aplicativo|app|online|loja|maquininha|compr\w*|cartao|cartoes|link|checkout)\b/;
/**
 * The freight said to be charged: the prompt's own prepaid line ("o frete é calculado por região… no
 * checkout"). A charging word in the clause of `frete`, with no denial between them nor right before
 * `frete`, or "ele é calculado" in the clause after ("o frete não é igual ao da entrega: ele é
 * calculado no checkout"). A bare
 * "checkout" or "região" after `frete` used to count, and "No pix também, o frete já sai zerado no
 * checkout." passed next to the canonical sentence (revisão do PR #39, achado 3).
 */
const FREIGHT_CHARGED =
  /(?<!\b(?:nao|nunca|nem|jamais)\s+(?:[a-z]+\s+){0,2})\bfrete\b(?:(?!\b(?:nao|nunca|nem|jamais)\b)[^.!?:;]){0,40}\b(?:calculad|cobrad|varia|depende|por\s+regiao|a\s+parte|separad|por\s+fora)(?![a-z]*\s+(?:(?:ja\s+)?(?:no|dentro\s+do|junto\s+(?:com\s+o|ao))\s+(?:preco|valor)|(?:(?:so|apenas|somente)\s+)?na\s+entrega))|\bfrete\b[^.!?]*[:;]\s*(?:ele|o\s+valor(?:\s+dele)?)\s+(?:e|sera|vai\s+ser|fica)\s+(?:calculad|cobrad)/;
/**
 * The free claim denied with no `frete` in it: "no pix não é grátis". Only the free word right after
 * the verb; not when "só" follows, nor inside a question — as in `FREE_DENIED`.
 */
const BARE_FREE_DENIED =
  /\b(?:nao|nunca)\s+(?:e|sai|fica|vai\s+ser|sera|esta)\s+(?:gratis|gratuit[oa]|de\s+gra[cs]a|sem\s+custo|zerad[oa])\b(?!\s+(?:so|apenas|somente)\b)(?![^.!?\n]*\?)/;
/**
 * "It costs her nothing" without the word `frete` (revisão do PR #39, achado 4): "No pix também é
 * grátis.", "O frete no pix sai sem custo nenhum." `shipping_promise` counts it as a free claim in a
 * sentence that names another payment, unless it is about the exchange or the return (`RETURN_FREE`).
 */
const PAYMENT_FREE =
  /\b(?:gratis|gratuit[oa]|de\s+gra[cs]a|sem\s+(?:nenhum\s+)?custo|(?:nao\s+tem|nao\s+ha|zero\s+de)\s+custo|custo\s+zero|custa\s+nada|zerad[oa]|por\s+nossa\s+conta)\b/g;
/**
 * The exchange or the return as what is free, for this gate's payment rule only: the return costs
 * her nothing (R16.3), "a devolução não tem custo nenhum pra você". The exchange is not free
 * (R17.1), and `warranty_promise` vetoes that claim (`EXCHANGE_FREE`) on every path. Only when
 * nothing of payment or freight sits between it and the free word ("na troca pro pix fica grátis").
 */
const RETURN_FREE =
  /\b(?:troca|trocar|devoluc\w*|devolv\w*|garantia)\b(?:(?!\b(?:pag\w*|pix|cartao|frete|envio|entrega|site|link|antecipad\w*)\b)[^,;:])*$/;
/**
 * What is free, named right after the free word and with nothing of freight, payment or "também" after
 * it: the return ("é sem custo nenhum a devolução", R16.3) or generating the pix code ("é sem custo
 * nenhum pra você gerar o código"). An allow-list of the words between: "é grátis no pix e a devolução
 * também" names the pix first, and stays a free claim (second review, 2026-09-29, finding 10).
 */
const FREE_OWNED_AFTER =
  /^\s+(?:(?:nenhum|nenhuma|mesmo|pra\s+voce|pra\s+vc|para\s+voce)\s+)*(?:(?:a\s+|na\s+|pra\s+|para\s+)?(?:sua\s+)?devoluc\w*|(?:pra|para)\s+(?:voce\s+|vc\s+)?(?:gerar|copiar)\s+o\s+(?:codigo|qr\s*code|pix))\b(?![^.!?\n]*\b(?:frete|envio|entrega|tambem|igua\w*|mesm[oa]s?|troc\w*)\b)/;
/**
 * The size exchange said to cost her nothing (R17.1: its freight is hers). Every shape of "free" the
 * gates know, plus the shop taking the freight on ("a gente paga o frete da troca").
 */
const EXCHANGE_FREE_WORD =
  /\b(?:gratis|gratuit[oa]|de\s+gra[cs]a|sem\s+(?:nenhum\s+)?custo|custo\s+zero|(?:nao\s+tem|nao\s+ha|zero\s+de)\s+custo|(?:nao\s+)?custa\s+nada|(?:nao|sem)\s+(?:precisa\s+)?(?:pagar|paga)\s+(?:nada|o\s+frete|frete)|por\s+nossa\s+conta|zerad[oa]|(?:a\s+gente|nos|a\s+loja)\s+(?:paga|pagamos|cobre|cobrimos|arca\w*)\s+(?:com\s+)?o\s+frete)\b/g;
/** The exchange, as a noun or a verb — not "troco" (change for cash) nor "trocado". */
const EXCHANGE_WORD = /\btroc(?:a|as|ar|amos|ando|aria|ue|ou|ar\w+)\b/g;
const RETURN_WORD = /\bdevol\w*|\breembols\w*|\bestorn\w*|\bdinheiro\s+de\s+volta\b/g;
/** Is any free-word claim in `t` owned by the exchange? One sentence at a time. */
const claimsExchangeFree = (t: string): boolean => {
  let asked = false;
  for (const piece of t.split(/(?<=[.!?;\n])/)) {
    // The answer to her question about the exchange owns its free word too: "Trocar de tamanho?
    // Pode sim, custa nada." — unless it names the return.
    const answers = asked && !/\bdevol|\breembols|\bestorn/.test(piece);
    asked = piece.trimEnd().endsWith("?") && /\btroc(?:a|ar)\b/.test(piece);
    const sentence = answers ? `troca ${piece}` : piece;
    if (!/\btroc/.test(sentence)) continue;
    const exchanges = [...sentence.matchAll(EXCHANGE_WORD)].map((m) => m.index ?? 0);
    if (exchanges.length === 0) continue;
    const returns = [...sentence.matchAll(RETURN_WORD)].map((m) => m.index ?? 0);
    for (const m of sentence.matchAll(EXCHANGE_FREE_WORD)) {
      const at = m.index ?? 0;
      const after = sentence.slice(at + m[0].length);
      // "grátis pra trocar", "sem custo na troca", "a gente paga o frete da troca".
      const governsAfter = /^[^,]{0,20}?\b(?:pra|para|na|pela|pelo|da|de|em|com\s+a)\s+(?:(?:a|sua|primeira|uma)\s+)?troc(?:a|ar)\b/.test(after);
      // Otherwise the nearest exchange or return before it owns it: "a devolução não tem custo e a
      // troca de tamanho é por sua conta" is the return's. "Trocar ou devolver, sem custo" is both.
      const lastExchange = Math.max(-1, ...exchanges.filter((i) => i < at));
      const lastReturn = Math.max(-1, ...returns.filter((i) => i < at));
      const coordinated = lastReturn > lastExchange && lastExchange >= 0 && /^\w+\s+(?:ou|e)\s+(?:\w+\s+){0,2}$/.test(sentence.slice(lastExchange, lastReturn));
      const owner = governsAfter ? at : lastExchange > lastReturn || coordinated ? lastExchange : -1;
      if (owner < 0) continue;
      // Denied between the exchange and the free word: "a troca não é grátis", "não sai de graça".
      // The free word's own "não" ("não tem custo") is the claim, not its denial.
      if (!governsAfter && /\b(?:nao|nunca)\b/.test(sentence.slice(owner, at))) continue;
      // "Não existe troca grátis", "não tem troca sem custo".
      if (/\b(?:nao|nunca)\s+(?:existe|tem|ha|e|oferecemos|fazemos)\s+(?:\w+\s+){0,2}$/.test(sentence.slice(0, Math.min(owner, at))))
        continue;
      return true;
    }
    // "A devolução é sem custo, e a troca também."
    if (/\b(?:gratis|sem\s+(?:nenhum\s+)?custo|de\s+gra[cs]a|por\s+nossa\s+conta|nao\s+(?:tem|ha)\s+custo)\b[^]*\btroc(?:a|ar)\s+(?:de\s+tamanho\s+)?tambem\b/.test(sentence))
      return true;
  }
  return false;
};
/**
 * The freight said to be the delivery's own ("o frete do pix é igual ao da entrega", "o mesmo
 * frete da entrega", "frete como na entrega"), unless a denial sits between them ("o frete no
 * pix não é igual ao da entrega").
 */
const SAME_AS_DELIVERY =
  /\bfrete\b(?:(?!\b(?:nao|nunca)\b)[^.!?]){0,30}\b(?:igua\w*|mesm[oa]|identic\w*|como)\b[^.!?]{0,12}?\b(?:d[ao]|n[ao]|a|ao)\s+(?:pagamento\s+(?:n[ao]\s+)?|pagar\s+n[ao]\s+)?entrega\b|\bmesmo\s+frete\s+(?:d[ao]|n[ao]|que\s+(?:n[ao]|d[ao]))\s+(?:pagamento\s+(?:n[ao]\s+)?)?entrega\b/;
/** The amount at `at`, as written: "r$ 12,99" or "12,99 reais". */
const amountAt = (t: string, at: number): string =>
  /^(?:r\$\s*[\d.,]*\d|[\d.,]*\d\s*reais)/.exec(t.slice(at))?.[0] ?? "";

/**
 * A percentage is only a discount claim when something around it says so. Reading the
 * whole message for the word "desconto" got this wrong in both directions: "te dou 30%
 * agora" is an offer with no such word and used to pass, while "o tecido é 92%
 * poliamida" is a spec sheet and used to be vetoed the moment any discount was also
 * mentioned. So the decision is made in a window around each number, and composition
 * wins over the discount reading — a fabric percentage promises nothing.
 */
const COMPOSITION_NEAR =
  /(algodao|poliamida|elastano|poliester|nylon|spandex|lycra|composicao|tecido|malha)/;
const DISCOUNT_NEAR = /(desconto|\boff\b|abatiment|promo|cupom|economi|\bmenos\b)/;
const GIVING_BEFORE = /\b(dou|damos|dar|darei|libero|liberamos|tiro|abato|consigo|faco|fazemos)\b(?:\s+\S+){0,3}\s*$/;

const looksLikeDiscount = (t: string, at: number): boolean => {
  const window = t.slice(Math.max(0, at - 40), at + 40);
  if (COMPOSITION_NEAR.test(window)) return false;
  return DISCOUNT_NEAR.test(window) || GIVING_BEFORE.test(t.slice(Math.max(0, at - 30), at));
};

/**
 * Opt-out has two levels, and the difference is the whole point: a naive regex on
 * "parar" blocks "tem como parar a dor?" and never blocks "não quero mais receber nada".
 */
export type OptOutLevel = "explicit" | "ambiguous" | "none";

export const classifyOptOut = (text: string): OptOutLevel => {
  const t = norm(text);
  const explicit = [
    /nao\s+(quero|desejo)\s+mais\s+(receber|nada|mensage)/,
    // The negated "não para de mandar" is read below (2026-09-29).
    /(?<!\bnao\s+)\b(para|pare|parem|pode\s+parar)\s+de\s+(me\s+)?(mandar|enviar|encher)/,
    /nao\s+me\s+(mande|manda|envie|envia)\s+mais/,
    /me\s+(tira|tire|remove|remova|exclui|exclua|apaga|apague)\s+d\w{0,4}\s+lista/,
    /(descadastrar|desinscrever|sair\s+da\s+lista)/,
    /\bnao\s+tenho\s+interesse\b.*\bnao\s+me\s+(chame|procure)\b/,
  ];
  if (explicit.some((r) => r.test(t))) return "explicit";
  // "Vocês não param de mandar mensagem, que saco" is a complaint, as it read until 2026-09-28; the
  // negated form asks for more only beside a liking she says, not denied ("não para de mandar
  // oferta boa não", "tô gostando") (2026-09-29, grafo §31). And only about this shop: no subject, or
  // "vocês" / "essa loja" (an allow-list). "Minhas amigas não param de me mandar foto com o colete,
  // quero comprar um" and "a transportadora não para de mandar mensagem" are someone else (grafo §32).
  // With no subject said, what keeps coming has to be this shop's (grafo §33): nothing, the messages
  // or the offers, and no subject after it — "não param de me mandar SMS de rastreio", "não para de
  // mandar mensagem a transportadora" and "gente, não param de me mandar foto do colete" are others.
  const stillSending = /\bnao\s+(?:para|param)\s+de\s+(?:me\s+)?(?:mandar|enviar|encher)/.exec(t);
  const subject = stillSending ? t.slice(0, stillSending.index).split(/[,;.!?:\n]/).pop()!.trimStart() : "";
  if (
    stillSending &&
    /^(?:(?:e|mas|gente|nossa|aff?e?|oi|ola)\s+)?(?:(?:voces|vcs|voce|vc|tu|essa\s+loja|esse\s+numero|essa\s+empresa)\s+)?$/.test(subject) &&
    (/\b(?:voces|vcs|voce|vc|tu|loja|numero|empresa)\s+$/.test(subject) ||
      /^\s*(?:(?:mais\s+)?(?:mensage\w*|msg|promo\w*|ofertas?|propaganda\w*|isso|o\s+saco))?\s*$/.test(
        t.slice(stillSending.index + stillSending[0].length).split(/[,;.!?:\n]/)[0]!,
      )) &&
    !/(?<!\bnao\s+(?:\S+\s+)?)\b(?:gost\w*|ador\w*|amo|amei|curt(?:o|i|indo|ir)|otim\w*|maravilh\w*|legal)\b|\b(?:ofertas?|promoc\w*|promos?|mensage\w*)\s+(?:boas?|otimas?|legais)\b|\bquero\s+ver\b/.test(t)
  )
    return "explicit";
  // The forms the list above missed (2026-09-28, grafo §26): it fixed the word order ("não quero
  // mais receber", never "não quero receber mais") and read messages but not what they carry.
  // What she refuses is the messages or the offers in them — never the purchase. The block is
  // terminal, so like `HUMAN_REQUEST_PHRASES` it is an allow-list: every word of the message is
  // the refusal, courtesy or a complaint. A deny-list of purchase words let "não quero mais
  // oferta de kit, quero só 1", "chega de promoção, me manda o link" and "não quero receber nada
  // pelo correio" block a buyer (2026-09-29, grafo §31); they read none, as before 2026-09-28.
  const SENT = String.raw`(?:mensage\w*|promoc\w*|promo|ofert\w*|propaganda\w*|nada)\b`;
  const REFUSAL_ONLY =
    /^(?:nao|n|sim|ja|mais|mesmo|nunca|nenhum|nenhuma|nada|de|do|da|e|que|o|a|os|as|com|no|isso|essa|esse|disso|dessa|desse|tant[ao]s?|aqui|agora|hoje|gente|moc[ao]|amig[ao]|viu|ta|to|serio|pelo|amor|deus|por|favor|pfv?r?|obrigad[ao]|obg|brigad[ao]|valeu|grat[ao]|ok|okay|beleza|blz|tchau|desculp\w*|saco|chat[ao]|chatice|cansei|cansad[ao]|ench\w*|incomod\w*|perturb\w*|insuport\w*|spam|para|pare|parem|parar|chega|me|mim|mand\w*|envi\w*|receber|quero|desejo|voces?|vcs?|vou|bloquear|denunciar|meu|minha|nesse|neste|numero|whatsapp|zap|wpp|mensage\w*|promoc\w*|promos?|ofert\w*|propaganda\w*)$/;
  if (
    new RegExp(
      String.raw`\bnao\s+(?:quero|desejo)\s+(?:mais\s+(?:${SENT})|receber\s+(?:mais\s+)?(?:nenhuma?\s+)?${SENT})|\bchega\s+de\s+(?:tant[ao]s?\s+)?${SENT}|^\s*(?:para|pare|parem)\s+com\s+isso\s*(?:,?\s*por\s+favor)?\s*[.!]*\s*$`,
    ).test(t) &&
    t.split(/[^a-z0-9]+/).every((w) => w === "" || REFUSAL_ONLY.test(w))
  )
    return "explicit";

  // Bare "parar"/"sair"/"cancelar" as the whole message — intent unclear, ask before acting.
  if (/^\s*(parar|pare|sair|cancelar|stop)\s*[.!]?\s*$/.test(t)) return "ambiguous";
  return "none";
};

/**
 * What the system does with a block, so that a vetoed message never becomes silence
 * and never becomes the operator's problem by default.
 *
 * - `rewrite` — the reply said something the operation cannot back. The veto and its
 *   reason go back into the context and the agent writes it again. Most gates.
 * - `defer` — the reply is fine and the clock is not. Rewriting produces the same
 *   block forever, so the message is scheduled instead of reworded.
 * - `stop` — she asked not to be contacted. Rewriting here means continuing to talk
 *   to someone who said stop; this one is never retried, at any cost.
 */
export type Remedy = "rewrite" | "defer" | "stop";

/**
 * She asked for a person (§Q12), and the bar is absolute twice over: the whole message
 * has to **be** one of these phrases, and the phrase has to name a human *as opposed to
 * this agent*. Not contain one, not resemble one, not merely mention attendance.
 *
 * Both halves are the operator's call (2026-09-08), and the second half is the sharper
 * one. The agent already IS an attendant, and a saleswoman: "quero falar com um
 * atendente" and "quero falar com um vendedor" describe what she is already doing, and
 * "olá, gostaria de falar com um atendente" is how a conversation *opens*. Routing those
 * hands a person the very first message of a sale nobody was failing to make. The same
 * goes for "alguém": "tem alguém aí?" asks whether anyone is listening, and the answer
 * is yes — the agent is. So the list keeps only the words that draw the line the request
 * is actually about: pessoa, humano, robô, bot, máquina, and "outro atendente".
 *
 * The first half is why it is a list at all. Handoff is irreversible — the agent never
 * answers that conversation again — so a pattern firing inside a longer sentence ends a
 * sale for someone who asked for nothing. The regex version did exactly that three times
 * before it was narrowed, and narrowing a regex is endless: each fix invents the next
 * sentence it swallows. A phrase list swallows nothing.
 *
 * The price is real and accepted: "oi, tudo bem? queria falar com uma pessoa" is not
 * routed. She is not ignored — she gets a normal answer, and the prompt tells the agent
 * to offer calling someone. This sentinel is the deterministic shortcut that costs
 * nothing and never guesses; it was never the only way to reach a person.
 */
export const HUMAN_REQUEST_PHRASES: readonly string[] = [
  // Ela nomeia a pessoa, em oposição à agente.
  "quero falar com uma pessoa",
  "quero falar com uma pessoa de verdade",
  "quero falar com um humano",
  "quero falar com um atendente humano",
  "quero falar com outro atendente",
  "quero atendimento humano",
  "quero suporte humano",
  "atendimento humano",
  // Transferência, e só para quem é gente.
  "me passa para uma pessoa",
  "me passa pra uma pessoa",
  "me passa para um humano",
  "me passa pra um humano",
  "me transfere para um humano",
  "me transfere pra um humano",
  // Recusar o robô é pedir gente, e não tem outra leitura.
  "nao quero falar com robo",
  "nao quero falar com um robo",
  "nao quero falar com bot",
  "nao quero falar com um bot",
  "nao quero falar com maquina",
  "nao quero falar com uma maquina",
];

export const asPhrase = (text: string): string =>
  norm(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const wantsHuman = (text: string): boolean =>
  HUMAN_REQUEST_PHRASES.includes(asPhrase(text));

/**
 * Whether her message asks for testimonials or for proof from other customers (R16.7), which is what
 * lets the agent bring them up (`GateContext.askedTestimonial`). Broad on purpose, and blind to
 * negation on purpose ("isso não é golpe, né?" is the question): a false positive only restores the
 * behaviour before this check, a false negative vetoes the answer she asked for.
 */
export const asksForTestimonial = (message: string): boolean =>
  /\bdepoiment|\bavalia|\bopinia|\bopinio|\breclame\s*aqui\b|\breclamac|\bquem\s+(?:ja\s+)?(?:comprou|usou|usa|testou|provou|pegou)\b|\b(?:outr[ao]s|algum[ao]s?|uma|as|suas)\s+(?:clientes?|compradoras?|pessoas\s+que)\b|\b(?:funciona|serve|resolve|modela|afina)\s+mesmo\b|\bconfia(?:vel|veis|nca|r)\b|\bgolpe\b|\bfraude\b|\breferenc|\bfeedbac?k|\bresultado|\bantes\s+e\s+depois\b|\b(?:zap|whats\w*|numero|contato|telefone|insta\w*)\s+d[ea]\s+(?:uma?|alguma|algum|outra)\s+(?:cliente|compradora|pessoa)\b/.test(
    norm(message),
  );

/**
 * Whether her message asks what the agent is — a person, a robot, an AI (Q10, line 3), which is what
 * lets the agent say she is the brand's virtual assistant (`GateContext.askedIdentity`). Broad and
 * blind to negation on purpose, as `asksForTestimonial`: "você não é robô né?" is the question, and
 * so is "não quero falar com máquina". A false positive only restores the behaviour before §58.
 */
export const asksWhatSheIs = (message: string): boolean =>
  /\b(?:robo|rbo|robbo|robot)\w*|\bbots?\b|\bchat\s*(?:bot|gpt)\b|\bgpt\b|\bcarne\s+e\s+osso\b|\b(?:resposta|mensagem|texto)\s+(?:pront|gravad|automatic)\w*|\bgravac|\b(?:e|eh)\s+(?:um\s+)?(?:sistema|programa)\b|\b(?:voce|vc|ce|tu)\s+(?:e|eh|foi|ta)?\s*programad|\b(?:e|eh|vc|voce)\s+(?:um\s+|uma\s+|a\s+|o\s+)?atendente\b|\b(?:voce|vc|ce|tu|e|eh|pessoa|gente)\s+(?:\S+\s+)?real\b|\btem\s+alguem\s+(?:ai|ae|aqui)\b|\b(?:falo|falando|converso|conversando)\s+com\s+quem\b|\bmesm[ao]\s+(?:q|que)\s+(?:responde|escreve|digita|ta|esta|fala)\b|\bmaquina\b|\binteligencia\s+artificial\b|^\W*ia\b|\b(?:e|eh|com|uma|um|tipo)\s+(?:uma\s+)?ia\b|\bvirtual\b|\bautomatic[oa]s?\b|\bautomatizad|\bhuman[oa]s?\b|\b(?:e|eh|com|sendo)\s+(?:uma?\s+)?(?:pessoa|gente)\b|\b(?:pessoa|gente|alguem|voce|vc|ce|tu|e|eh)\s+(?:\S+\s+)?de\s+verdade\b|\b(?:pessoa|gente)\s+real\b|\bquem\s+(?:e|eh|ta|esta)\s+(?:falando|ai|respondendo|digitando|me\s+atendendo)\b|\bcom\s+quem\s+(?:eu\s+)?(?:falo|to|estou|converso)\b|\bquem\s+(?:e|eh)\s+(?:voce|vc)\b|\b(?:voce|vc|ce|tu)\s+existe|\bartific\w*|\buma\s+assistente\b|\bquem\s+(?:me\s+)?responde\b|\btem\s+gente\s+(?:ai|ae|aqui)\b/.test(
    norm(message),
  );

/** The one place money is written for a human to read inside this file. */
const money = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;
/** The size exchange's freight, as the briefing teaches it (R17.1). The amount goes only in the fixed reply. */
const EXCHANGE_FREIGHT_LINE =
  `Na troca de tamanho o envio é por conta dela: o valor e o link de pagamento vão numa mensagem ` +
  `à parte, quando ela pedir a troca de um pedido. Nunca diga que a troca é grátis ou sem custo, e ` +
  `não cite valor da troca. A devolução, sim, é sem custo.`;
const savingOf = (c: GateConfig): number => +(c.prices.codBrl - c.prices.prepayBrl).toFixed(2);
/** The prepaid card's installment ceiling, or undefined when installments are off. */
const maxInstallments = (c: GateConfig): number | undefined => {
  const n = c.prices.prepayMaxInstallments;
  return n != null && n >= 2 ? n : undefined;
};

interface Gate {
  name: string;
  remedy: Remedy;
  /** Returns a reason to block, or null to pass. Absent on a gate that is only soft. */
  check?: (text: string, ctx: GateContext) => string | null;
  /**
   * The soft half: a reason recorded as `warn`, which never blocks. Read only when
   * `check` passed, so one gate leaves one trace.
   */
  warn?: (text: string, ctx: GateContext) => string | null;
  /**
   * The same rule, written for the agent to read **before** it writes.
   *
   * A gate that only ever speaks by vetoing teaches nothing until it has already cost a
   * rewrite, and a rewrite is a second model call for a turn the agent could have got
   * right the first time. So every content gate states its rule here, and the turn hands
   * the whole set to the model inside the system prompt: the agent calibrates against
   * the rule instead of discovering it by being refused.
   *
   * It lives on the gate and not in the prompt for the reason this repository keeps
   * relearning: two copies of one rule drift, and the copy that drifts is the one nobody
   * tests. A test asserts every `rewrite` gate carries a line.
   *
   * Only content gates have one. `business_hours`, `pacing` and `opt_out` are not things
   * better wording avoids — the clock and her opt-out are facts about the world, not
   * about the sentence.
   */
  briefing?: (config: GateConfig) => string;
}

/**
 * A denial glued to the verb at `at`: "não prova", "não dá pra provar", "não pode experimentar". Only a
 * negation followed at most by a modal ("dá pra", "pode", "consegue", "tem como", "precisa") and a
 * pronoun: "sem precisar sair e prova" and "não se preocupe, você veste" deny something else, and
 * passed as honest with the three-word window of the first version (independent review, 2026-09-29;
 * `.claude/memory/negation-blindness.md`).
 */
const deniedRightBefore = (t: string, at: number): boolean =>
  /\b(?:nao|nunca|nem)\s+(?:(?:da|pode|podem|consegue|vai|tem\s+como|tem|ha|existe|rola|aceita|aceitamos|temos|oferece|precisa|e\s+possivel|espera|aguarda)\s+(?:(?:pra|para|de)\s+)?)?(?:(?:voce|vc|ela)\s+)?$/.test(
    t.slice(Math.max(0, at - 40), at),
  );
/** Trying the vest on, as her act. Never "vista" (also "à vista") nor the noun "prova" alone. */
const TRY = String.raw`(?:vest(?:e|ir|ia|indo)|experiment\w*|prova(?:r|ndo)?|prove|provou)`;
/**
 * She tries it on, then pays (operator, 2026-09-29: the courier does not wait). Five shapes: the try
 * then "só então / só depois / e só paga se"; the try "antes de pagar"; "só paga se / depois de" what
 * only wearing tells (the mirror, the fit); the courier waiting for her to try; and the try then "só
 * então decide" — the ruler's own old line, D4 of the cross-check (independent review, finding 3).
 */
const TRY_BEFORE_PAYING = new RegExp(
  [
    String.raw`\b${TRY}\b[^.!?]{0,30}?\b(?:so\s+(?:entao|depois|ai)|depois|entao|ai\s+sim)\s+(?:(?:voce|vc)\s+)?(?:paga|pagar|pague)\b`,
    String.raw`\b${TRY}\b[^.!?]{0,30}?\bso\s+(?:(?:voce|vc)\s+)?paga\w*\s+(?:se|quando|depois)\b`,
    String.raw`\b${TRY}\b[^.!?]{0,30}?\bantes\s+de\s+(?:pagar|pagamento|acertar)`,
    String.raw`\b(?:so\s+paga\w*|paga\w*\s+so)\s+(?:se|depois\s+de|apos)\b,?(?:(?!\b(?:nao|nunca|nem)\b)[^.!?,;:]){0,40}?\b(?:espelho|vest\w*|experiment\w*|prova(?:r|ndo|do)?|servir|serviu|couber|caber|ficar\s+bem|valeu|valer\s+a\s+pena)\b`,
    String.raw`\bentregador\b(?:(?!\b(?:nao|nunca|nem|sem)\b)[^.!?]){0,30}?\bespera\w*\b[^.!?]{0,20}?\b${TRY}\b`,
    String.raw`\b${TRY}\b[^.!?]{0,60}?\b(?:so\s+(?:entao|depois|ai)|e\s+ai)\s+(?:(?:voce|vc)\s+)?decid\w*`,
  ].join("|"),
  "g",
);
/**
 * Paying at the door or on arrival, which does not exist where delivery does not reach her (operator,
 * 2026-09-29, R16.2). A payment word, then — with no "antes", "agora", pix, card or checkout between —
 * the door, the courier or the arrival, in any of the ways she hears it: "na entrega", "em dinheiro na
 * entrega", "ao entregador", "acerta com o entregador", "no recebimento", "ao receber", "depois de
 * receber", "na hora que receber", "pra quando o colete chegar". The first version listed three exact
 * phrasings, and the review passed ten others (independent review, finding 6).
 */
const DOOR_PAYMENT = new RegExp(
  String.raw`\b(?:pag\w*|acert\w*)\b(?:(?!\b(?:antes|agora|adiantad\w*|antecipad\w*|checkout|pix|cartao|site|link|nao|nunca)\b)[^.!?;:]){0,30}?\b(?:(?:na|no\s+momento\s+da|na\s+hora\s+da)\s+(?:entrega|porta)|(?:ao|pro|para\s+o|com\s+o|na\s+mao\s+do)\s+entregador|no\s+recebimento|(?:quando|ao|assim\s+que|depois\s+de|depois\s+que|na\s+hora\s+(?:que|em\s+que))\s+(?:(?!(?:nao|nunca|antes)\b)[a-z]+\s+){0,3}?(?:receber|recebe|chegar|chega|estiver|trouxer|trazer|traz|entregar|entrega|bater)|(?:pra|para)\s+quando\s+(?:(?!(?:nao|nunca|antes)\b)[a-z]+\s+){0,3}?(?:chegar|chega|trouxer|entregar))`,
  "g",
);
/**
 * "Não é antes" said of the payment, which points it at the door ("o pagamento não é antes, é só na
 * entrega"): `DOOR_PAYMENT` stops at "nao" and "antes", so the phrase is taken out before it reads the
 * sentence (second review, 2026-09-29, finding 4).
 */
const NOT_BEFORE = /\b(?:nao|nunca)\s+(?:e|sera|vai\s+ser|fica)\s+(?:antes|agora|adiantad\w*|antecipad\w*)\b\s*,?/g;
/**
 * "Nothing now" without the door: "você não paga nada agora/hoje", "não tem que pagar nada antes". Not
 * "na hora da entrega": "você não paga nada na hora da entrega, já está pago" is the prepaid order's
 * truth (second review, finding 5).
 */
const NOTHING_NOW =
  /\bnao\s+(?:paga|precisa\s+pagar|vai\s+pagar|tem\s+que\s+pagar|tem\s+de\s+pagar|desembolsa)\s+nada\s+(?:agora|antes|adiantado|hoje|na\s+hora\b(?!\s+(?:da\s+entrega|que\s+(?:receber|chegar))))\b/;
const NOTHING_NOW_ALL = new RegExp(NOTHING_NOW.source, "g");
/** Agreeing, not extending: "isso mesmo", "é isso mesmo", "exatamente isso", "sim, mesmo". Never "o mesmo". */
const AGREEMENT = /\b(?:e\s+)?isso\s+mesm[oa]\b|\bsim\s*,?\s+mesm[oa]\b/g;
/**
 * The predicate denied right after it: "pagar na entrega não está disponível no seu CEP", "o pagamento
 * na entrega não chega aí" — the sentence this path needs most, which the first version vetoed
 * (independent review, finding 16). Glued to the match, with no comma but around an adverb ("pagar na entrega,
 * infelizmente, não dá no seu CEP"): a denial anywhere in the next
 * sixty characters let "você paga na entrega e não tem taxa nenhuma" and "…, não é ótimo?" through
 * (second review, finding 1). "É/está/fica" only with what says the option is off ("não é possível",
 * "não está disponível"): "pagar na entrega não é problema" is the lie.
 */
const DENIED_AFTER =
  /^(?:\s*,\s*(?:infelizmente|ainda|por\s+enquanto|por\s+ora|aqui|ai|la)\s*,)?\s+(?:ainda\s+|infelizmente\s+)?(?:nao|nunca)\s+(?:(?:esta|e|fica)\s+(?:(?:mais|ainda)\s+)?(?:disponive\w*|possive\w*|liberad\w*|ativ\w*|habilitad\w*|aceit\w*|oferecid\w*|feit\w*|atendid\w*|(?:uma\s+)?opcao)|chega\b(?!\s+a\s+ser)|atende|existe|funciona|cobre|alcanca|serve|(?:da|rola)\b(?=\s*(?:$|[,.!?]|ai\b|aqui\b|n[oa]\s+(?:seu|sua)\b|pra\s+(?:voce|vc|sua|seu)\b))|vale\s+(?:pra|para)\s+(?:a\s+|o\s+)?(?:sua|seu|voce|vc|essa|esse)\b)\b/;
/** A sentence that makes paying on delivery its condition: "pagando na entrega…", "se pagar na entrega…". */
const COD_CONDITION =
  /\b(?:pagando|no\s+pagamento|com\s+(?:o\s+)?pagamento|se\s+(?:voce\s+|vc\s+)?(?:pagar|escolher\s+pagar|preferir\s+pagar|optar\s+por\s+pagar))\s+na\s+entrega\b/;

const gates: readonly Gate[] = [
  {
    name: "opt_out",
    remedy: "stop",
    check: (_t, ctx) => (ctx.optedOut ? "lead asked to stop receiving messages" : null),
  },
  {
    name: "charge_promise",
    remedy: "rewrite",
    briefing: (c) =>
      (c.cod.physicalOnDeliveryActive
        ? `Ela paga só quando o colete chegar na mão dela, ao entregador — isso está ligado na loja e ` +
          `você pode dizer. Quando a entrega não chega no CEP dela, ela só tem o antecipado e paga ` +
          `antes, no checkout: aí nunca diga que ela paga na entrega, ao entregador ou quando ` +
          `receber, nem que não paga nada agora.`
        : `NÃO diga que ela paga na entrega: o pagamento na entrega está DESLIGADO na loja agora.`) +
      ` Em nenhum caminho ela veste, prova ou experimenta o colete antes de pagar: o entregador não ` +
      `espera. O que ela tem é ${c.delivery.warrantyDays} dias após o recebimento pra devolver.`,
    check: (text, ctx) => {
      const t = norm(text);
      const promisesDoorPayment =
        /(paga|pagar|pagamento)\s+(so\s+)?(na|no\s+momento\s+da)\s+entrega/.test(t) ||
        /nao\s+paga\s+nada\s+agora/.test(t) ||
        /paga\s+(direto\s+)?(pro|para\s+o)\s+entregador/.test(t);
      if (promisesDoorPayment && !ctx.config.cod.physicalOnDeliveryActive)
        return "promises payment at the door while `Físico na entrega` is off";
      // The courier does not wait for her to try it on (operator, 2026-09-29), on either path: "você
      // recebe, veste e só então paga", "pode experimentar antes de pagar", "só paga se, ao se olhar
      // no espelho, achar que valeu". A denial right before the verb is the honest answer ("não dá
      // pra provar antes de pagar", "o entregador não espera você provar").
      for (const m of t.matchAll(TRY_BEFORE_PAYING)) {
        if (!deniedRightBefore(t, m.index ?? 0)) return "promises she tries the vest on before paying, and the courier does not wait";
      }
      // Where delivery does not reach her, or about a prepaid order, she pays before, in the checkout
      // (operator, 2026-09-29, R16.2): "você não paga nada agora", "paga na entrega", "paga pro
      // entregador", "o pagamento é só quando o colete chegar" are the delivery's, and a lie there.
      // `paymentPath: "prepay"` alone is not enough: she may have chosen it where delivery exists. A sentence that makes the delivery its condition
      // ("pagando na entrega…", the canonical free sentence) speaks of that path, and passes.
      // Where delivery does not reach her there is no delivery path to condition on, so even "pagando
      // na entrega…" is a lie there (independent review, finding 7); on a prepaid order's own touches
      // the conditioned sentence still speaks of the other path, and passes.
      if (ctx.codUnavailable === true || (ctx.paymentPath === "prepay" && ctx.stage === "logistics")) {
        for (const s of sentencesIn(t)) {
          if (ctx.codUnavailable !== true && COD_CONDITION.test(s) && s.search(PREPAY_NAME) === -1) continue;
          if (NOTHING_NOW.test(s))
            return "promises she pays nothing now where she only has the prepaid path, and pays in the checkout";
          const door = s.replace(NOT_BEFORE, " ");
          for (const m of door.matchAll(DOOR_PAYMENT)) {
            const at = m.index ?? 0;
            if (deniedRightBefore(door, at) || DENIED_AFTER.test(door.slice(at + m[0].length))) continue;
            return "promises payment at the door where she only has the prepaid path, and pays in the checkout";
          }
        }
      }
      return null;
    },
  },
  {
    // Price and discount are one gate, as in the spec: both answer "does this number
    // exist in the operation?", and a message that gets one wrong usually gets both.
    name: "price_promise",
    remedy: "rewrite",
    briefing: (c) =>
      `Os únicos valores que existem são ${money(c.prices.codBrl)} na entrega, ` +
      `${money(c.prices.prepayBrl)} antecipado e ${money(c.prices.anchorBrl)} de preço cheio` +
      (c.kits?.length
        ? `, e os kits: ${c.kits
            .map((k) => `${k.units} peças ${k.path === "cod" ? "na entrega" : "no antecipado"} ${money(k.priceBrl)} (${k.discountPercent}%)`)
            .join(", ")}`
        : ``) +
      `. ` +
      `Nenhum outro número em reais. ` +
      (savingOf(c) > 0
        ? `Nunca diga a economia em reais — a diferença entre os dois preços, nem a de um kit, em ` +
          `nenhuma formulação. Diga o percentual e o preço ("${c.prices.prepayDiscountPercent}% ` +
          `de desconto: ${money(c.prices.prepayBrl)} no antecipado"). Preço e desconto são do caminho e ` +
          `da quantidade de que você está falando: não junte o desconto de um kit com o preço de outro. `
        : ``) +
      `Os únicos descontos são ` +
      `${c.prices.prepayDiscountPercent}% no antecipado e 40% (o já publicado no site)` +
      (c.kits?.length ? `, mais os percentuais dos kits acima` : ``) +
      `${c.coupon.active ? `, mais ${c.coupon.percent}% do cupom` : ``}. E não prometa desconto ` +
      `sem número: "eu tiro um pouquinho", "faço um precinho", "dou um jeito no valor" ` +
      `comprometem a loja com um preço que ninguém definiu. Recusar um número que ela pediu é ` +
      `permitido, e é o seu trabalho.`,
    check: (text, ctx) => {
      const { codBrl, prepayBrl, anchorBrl, prepayDiscountPercent } = ctx.config.prices;
      const kits = ctx.config.kits ?? [];
      const allowedPrices = new Set([codBrl, prepayBrl, anchorBrl, ...kits.map((k) => k.priceBrl)]);
      const orderAmount = ctx.stage === "logistics" ? ctx.orderAmountBrl : undefined;
      if (orderAmount !== undefined) allowedPrices.add(orderAmount);
      const exchangeFee = ctx.exchanging === true ? ctx.config.exchange?.feeBrl : undefined;
      if (exchangeFee !== undefined) allowedPrices.add(exchangeFee);
      const t = norm(text);

      // Exit A (operator decision 2026-09-22, Frente 4 item 6): the saving in reais — the
      // difference between the two offers — is never said, in any wording, on either path
      // and whatever `freeShipping` says. Only the percentage and the prepaid price. Exit C
      // kept it citable next to the freight caveat, and four rounds of regex could not
      // hold it: every way of saying "economia" was a new surface, and "com o desconto de
      // antecipado sai R$ 12,99" still passed. A negation does not exempt it either — the
      // number said at all is what she takes to the checkout. The bare "12,99" counts too:
      // `moneyMatches` needs "R$" or "reais" and would let it through. Skipped only when the
      // difference coincides with a configured price, where the two cannot be told apart.
      // Every offer the shop has — one piece on each path plus the kits — and every saving
      // they imply: the list price minus the offer, and prepaid against delivery at the same
      // quantity (pricing review, 2026-09-25: "levando 2 você economiza 25,98" passed, as did
      // any kit saving written without "R$").
      const offers = [
        { path: "cod" as const, units: 1, price: codBrl, pct: 0 },
        { path: "prepay" as const, units: 1, price: prepayBrl, pct: prepayDiscountPercent },
        ...kits.map((k) => ({ path: k.path, units: k.units, price: k.priceBrl, pct: k.discountPercent })),
      ];
      const savings = new Set<number>();
      for (const o of offers) {
        const vsList = +(o.units * codBrl - o.price).toFixed(2);
        if (vsList > 0) savings.add(vsList);
        const cod = offers.find((x) => x.path === "cod" && x.units === o.units);
        if (o.path === "prepay" && cod && cod.price > o.price) savings.add(+(cod.price - o.price).toFixed(2));
      }
      for (const saving of savings) {
        if (allowedPrices.has(saving)) continue;
        const [whole, cents] = saving.toFixed(2).split(".");
        if (
          new RegExp(`(?<![\\d.,])${whole}[.,]${cents}(?!\\d|[.,]\\d)`).test(t) ||
          moneyMatches(t).some((m) => m.value === saving)
        ) {
          return `cites the ${money(saving)} saving in reais; say only the percentage (${prepayDiscountPercent}%) and the prepaid price`;
        }
      }
      // A saving can coincide with a price (3 × 129,90 − 272,79 = 116,91, the prepaid price),
      // so value alone cannot tell it: any amount right after "economiza / poupa / desconto
      // de" or right before "mais barato / a menos / de economia" is a saving in reais.
      for (const m of moneyMatches(t)) {
        if (negatedAt(t, m.at)) continue;
        const amount = amountAt(t, m.at);
        if (
          /\b(?:econom\w*|poup\w*|deixa\s+de\s+pagar|desconto\s+de)\s+(?:de\s+)?(?:ate\s+)?(?:so\s+)?$/.test(t.slice(Math.max(0, m.at - 30), m.at)) ||
          /^\s*(?:mais\s+barato|a\s+menos|de\s+economia|de\s+desconto)\b/.test(t.slice(m.at + amount.length, m.at + amount.length + 25))
        )
          return `states a saving in reais (${amount.trim()}); say only the percentage and the price`;
      }

      // An offer's price and percent belong to its path and quantity (pricing review,
      // 2026-09-25): "na entrega você leva com 30% de desconto" and "3 peças na entrega saem
      // por R$ 272,79" used every configured number, and she finds the gap at the door. When a
      // sentence names exactly one path or exactly one quantity, every offer price and
      // discount in it must belong to an offer that matches; comparing paths or quantities in
      // one sentence names several, and that dimension is not checked.
      const UNIT_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
      const offerPrices = new Set(offers.map((o) => o.price));
      // Built once, not per sentence: in a reply of thousands of short sentences, building them was
      // half this gate's time (2026-09-28).
      const N = "(\\d|um|uma|dois|duas|tres|quatro|cinco)";
      const NOT_COUNT = "(?!\\s*(?:ou\\s+\\d+\\s+)?(?:x|vezes|dias?|horas?|parcelas?|uteis|cart\\w*|sem\\s+juros|no\\s+cartao)\\b)";
      const COUNTED = new RegExp(
        `\\b${N}\\s+(?:pecas?|unidades?|coletes?)\\b|\\bkits?\\s+de\\s+${N}\\b|\\b(?:o|a|os|as)\\s+de\\s+${N}\\b${NOT_COUNT}|\\be\\s+${N}\\s+(?:por|sai\\w*|saem|fica\\w*|custa\\w*)\\b`,
        "g",
      );
      const CHANGED = new RegExp(`\\b(?:as|os)\\s+(duas|dois|tres)\\b|\\blev\\w*\\s+(?:so\\s+)?${N}\\b${NOT_COUNT}`, "g");
      const IN_COUNT = new RegExp(`\\bem\\s+${N}\\b${NOT_COUNT}`, "g");
      for (const sm of t.matchAll(/[^.!?\n]+/g)) {
        const sentence = sm[0];
        const paths = new Set<string>();
        if (/\bna\s+entrega\b|\bna\s+porta\b|\bentregador\b/.test(sentence)) paths.add("cod");
        if (/\b(?:antecipa\w*|adianta\w*|pix|pag\w*\s+(?:antes|agora)|a\s+vista)\b/.test(sentence)) paths.add("prepay");
        // The quantities in play (fourth review): the conversation's own — the turn knows it
        // deterministically, `ctx.units`, 1 when absent — plus every count the sentence names
        // in so many words: "2 peças", "o kit de 3", "e o de 3", "e 3 saem", the single piece
        // ("a unidade", "avulsa"), and "20% em 3" only beside another count. Guessing the
        // quantity from the words alone ("seu M", "em 6") kept vetoing honest lines. A price
        // or percent must belong to an offer of the sentence's path at one of them.
        // Accepted residue: two kits named together with their prices swapped.
        const counts: Array<{ at: number; units: number }> = [];
        const add = (re: RegExp) => {
          for (const u of sentence.matchAll(re)) {
            const w = u.slice(1).find((x) => x !== undefined)!;
            counts.push({ at: u.index ?? 0, units: UNIT_WORDS[w] ?? Number(w) });
          }
        };
        add(COUNTED);
        // Changing her mind inside a kit conversation (fifth review): "as duas", "levando 3".
        add(CHANGED);
        if (counts.length > 0) add(IN_COUNT);
        for (const u of sentence.matchAll(
          /\b(?:uma|a|cada)\s+peca\b|\ba\s+unidade\b|\bavuls[oa]\b|\be\s+uma\s+(?:sai|fica|por)\b|\bso\s+uma\b|\buma\s+so\b|^\s*uma\s+(?:sai|fica|custa|por)\b/g,
        ))
          counts.push({ at: u.index ?? 0, units: 1 });
        // "a segunda peça", "com a terceira" — never "na segunda(-feira)" or "a terceira
        // tentativa" (sixth review). And the single vest: "o colete", "só um".
        for (const u of sentence.matchAll(
          /\b(segunda|terceira)\s+(?:peca|unidade)\b|\b(?:com|levando)\s+a\s+(segunda|terceira)\b(?!\s*-?\s*feira)(?!\s+\w*(?:tentativa|vez|dia|entrega))|\bmais\s+uma\b/g,
        ))
          counts.push({
            at: u.index ?? 0,
            units: (u[1] ?? u[2]) === "segunda" ? 2 : (u[1] ?? u[2]) === "terceira" ? 3 : (ctx.units ?? 1) + 1,
          });
        for (const u of sentence.matchAll(/\b(?:so|um)\s+um\b|\bum\s+so\b|\b(?:o|um|cada|seu)\s+colete\b/g))
          counts.push({ at: u.index ?? 0, units: 1 });
        // A number whose own clause names a count answers to that count ("R$ 129,90 levando 2
        // peças" is 2 for the price of 1); one in a clause without a count answers to the last
        // count before it, else to the sentence's counts and the conversation's ("Seu M fica
        // R$ 129,90, e levando 2 peças sai R$ 233,82" on the decision turn). A decimal comma
        // is not a clause break.
        const breaks = [...sentence.matchAll(/[,;:](?!\d)/g)].map((b) => b.index ?? 0);
        const unitsAt = (at: number): Set<number> => {
          const start = (breaks.filter((b) => b < at).at(-1) ?? -1) + 1;
          const end = breaks.find((b) => b >= at) ?? sentence.length;
          const own = counts.filter((c) => c.at >= start && c.at < end).map((c) => c.units);
          if (own.length > 0) return new Set(own);
          // A clause without a count continues the one before it ("se levar só uma, fica …").
          const before = counts.filter((c) => c.at < start).at(-1);
          return new Set(before ? [before.units] : [...counts.map((c) => c.units), ctx.units ?? 1]);
        };
        const matchingAt = (at: number) => {
          const units = unitsAt(at);
          return offers.filter((o) => (paths.size !== 1 || paths.has(o.path)) && units.has(o.units));
        };
        const moneys = moneyMatches(sentence);
        for (const [k, m] of moneys.entries()) {
          if (!offerPrices.has(m.value) || negatedAt(sentence, m.at) || m.value === orderAmount) continue;
          const matching = matchingAt(m.at);
          if (matching.some((o) => o.price === m.value)) continue;
          // The price a comparison is made against is not the offer on sale: "antecipado sai
          // R$ 116,91 em vez de R$ 129,90" is the script's own line (7.1). Only when an offer
          // price that DOES match came first — "menos do que R$ 272,79" alone is the lie.
          const comparedAgainst =
            COMPARED_AGAINST.test(sentence.slice(Math.max(0, m.at - 30), m.at)) &&
            moneys.slice(0, k).some((p) => matchingAt(p.at).some((o) => o.price === p.value));
          if (comparedAgainst) continue;
          return `price ${money(m.value)} belongs to another offer than the one this sentence names; say each offer in its own sentence`;
        }
        for (const m of sentence.matchAll(/(\d{1,3})\s*(?:%|por\s*cento)/g)) {
          const value = Number(m[1]);
          const at = m.index ?? 0;
          if (value === 40 || (ctx.config.coupon.active && value === ctx.config.coupon.percent)) continue;
          // An offer's own percent is a discount even without the word ("sai com 30%").
          if ((!looksLikeDiscount(sentence, at) && !offers.some((o) => o.pct === value)) || negatedAt(sentence, at)) continue;
          if (!matchingAt(at).some((o) => o.pct === value))
            return `discount of ${value}% belongs to another offer than the one this sentence names`;
        }
      }

      // Saying a number the operation does not have is a promise; refusing it is the
      // job. "Me dá 30% que eu fecho agora" is the most ordinary message in a COD
      // funnel, and the answer to it — "não consigo oferecer 30% de desconto" — used
      // to be vetoed, burning two rewrites and ending in a handoff for a turn the
      // agent had already got right.
      for (const m of moneyMatches(t)) {
        if (allowedPrices.has(m.value) || negatedAt(t, m.at)) continue;
        return `price ${m.value} is not one of the configured values`;
      }

      // "O total" is the one word that says the freight is in. On the prepaid path it is
      // not — the checkout adds R$ 15 to R$ 40 by region — so calling the prepaid price
      // "o total" is the half-truth she finds at checkout, unless the freight is added
      // right there ("o total é R$ 116,91 mais o frete"). A `não` between `total` and the
      // amount denies it; one before `total` ("não precisa esperar, o total fica...")
      // denies nothing.
      if (ctx.config.delivery.freeShipping !== true && prepayBrl !== codBrl) {
        const prepayPrices = new Set([prepayBrl, ...kits.filter((k) => k.path === "prepay").map((k) => k.priceBrl)]);
        for (const m of moneyMatches(t)) {
          if (!prepayPrices.has(m.value)) continue;
          const amount = amountAt(t, m.at);
          // Kit sentences are longer ("o total das 3 peças no antecipado fica R$ 272,79"), and
          // "no total / ao todo" after the amount says the same (pricing review, 2026-09-25).
          const totalBefore = /\btotal\b(?![^.!?]*\bnao\b)[^.!?]{0,45}$/.test(t.slice(Math.max(0, m.at - 60), m.at));
          const totalAfter = /^\s*,?\s*(?:no\s+total|ao\s+todo)\b/.test(t.slice(m.at + amount.length, m.at + amount.length + 20));
          if (!totalBefore && !totalAfter) continue;
          // Only the freight added right after the amount. A caveat anywhere later in the
          // sentence, and "sem o frete", were accepted for a while (2026-09-22) and let
          // through "o total é R$ 116,91, e o frete, que seria calculado no checkout, já
          // está incluso" and "o total é R$ 116,91 sem o frete cobrado à parte". The honest
          // sentences they freed cost a rewrite; the lies cost the freight at the door.
          const after = t.slice(m.at + amount.length, m.at + amount.length + 45);
          if (/^(?:\s*,?\s*(?:no\s+total|ao\s+todo))?[^.!?]{0,25}?(?:\bmais|\+|\bfora|\bsem\s+contar|\balem\s+d[oe])\s*(?:o\s+)?(?:valor\s+d[oe]\s+)?frete\b/.test(after)) continue;
          return `calls the prepaid ${money(m.value)} a total, and the freight is added in the checkout`;
        }
      }

      const allowedPercents = new Set([
        prepayDiscountPercent,
        40, // anchor discount already published on the site
        ...(ctx.config.coupon.active ? [ctx.config.coupon.percent] : []),
        ...kits.map((k) => k.discountPercent),
      ]);
      // A concession with no number is still a concession. "Eu tiro um pouquinho",
      // "faço um precinho", "dou um jeito no valor" commit the shop to a price nobody
      // set, and the number gate never sees them because there is no number to see.
      // "Tiro mais alguma dúvida" is the closing question, not a concession (M-05): the
      // object of "tiro" is the doubt, and only determiners may stand between them, so
      // nothing that names a price can hide in the span removed. Not when the scan's own
      // window would find a concession word after the doubt ("tiro sua dúvida e mais um
      // pouco do preço", "…, pra você sai por menos", "…(pra você um pouquinho)" share the
      // verb — second review, three rounds: listing separators did not converge), and
      // blanked to the same length so `negatedAt` keeps its distances.
      const concessions = t.replace(
        /\btiro\s+(?:(?:mais|pra\s+voce|para\s+voce|a|as|das|alguma|algumas|uma|outra|outras|sua|suas|essa|essas|qualquer|todas)\s+){0,4}duvid(?:as?|inhas?|azinhas?)\b(?![^.!?]{0,20}\b(?:um\s+pou(?:c|qu)\w+|mais|pra\s+voce|para\s+voce)\b)/g,
        (x) => " ".repeat(x.length),
      );
      for (const m of concessions.matchAll(
        /\b(tiro|abato|baixo|diminuo)\b[^.!?]{0,20}\b(um\s+pou(?:c|qu)\w+|mais|pra\s+voce)\b|\bfa[cç]o\s+um\s+pre[cç]\w+|\bdou\s+um\s+jeit\w+|\bmelhoro\s+(?:o\s+)?(?:pre[cç]o|valor)|\bdeixo\s+mais\s+barato|\bleve\s+\d+\s+(?:e\s+)?pague\s+\d+|\bganh\w*\s+(?:uma|1|outra)\s+(?:peca|unidade)|\b(?:peca|unidade)\s+(?:de\s+)?gratis|(?<=(?<!\b(?:troc|devol)\w*\s+d[oa]\s+)\b(?:segund[oa]|terceir[oa]|outr[oa]|colete|peca|unidade)\b(?:(?!troc|devol)[^.!?]){0,25})\b(?:sai|fica|vai|e|sera)\s+(?:de\s+gra[cç]a|por\s+nossa\s+conta|gratis)\b(?!\s+(?:pra|para)\s+(?:trocar|devolver))|(?<=\blev\w*\s+(?:\d|duas|dois|tres)\b[^.!?]{0,25})\bpag\w*\s+(?:so\s+)?(?:uma|um|1|duas|dois|2)\b(?!\s+vez)|\b(?:gratis|de\s+gra[cç]a|por\s+nossa\s+conta)\b[^.!?]{0,30}\b(?:segund[oa]|outr[oa])\s+(?:peca\s+)?tambem\b|\b(?:lev\w*|ganh\w*)\s+(?:a|o)\s+(?:outr[oa]|segund[oa])\b[^.!?]{0,15}\bde\s+gra[cç]a\b/g,
      )) {
        if (!negatedAt(concessions, m.index ?? 0)) return "promises a discount with no number behind it";
      }

      // "30 por cento" is the same offer as "30%", and only the symbol was read.
      for (const m of t.matchAll(/(\d{1,3})\s*(?:%|por\s*cento)/g)) {
        const value = Number(m[1]);
        const at = m.index ?? 0;
        if (!looksLikeDiscount(t, at)) continue;
        if (allowedPercents.has(value) || negatedAt(t, at)) continue;
        return `discount of ${value}% is not configured`;
      }
      return null;
    },
  },
  {
    name: "coupon_exists",
    remedy: "rewrite",
    briefing: (c) =>
      c.coupon.active
        ? `O cupom de ${c.coupon.percent}% está ativo e você pode citá-lo` +
          (c.coupon.code?.trim() ? `: o código é ${c.coupon.code.trim()}, digitado por ela no checkout. Nenhum outro código existe.` : `.`)
        : `Não existe cupom. Você pode dizer que não temos cupom no momento — o que não pode é ` +
          `anunciar um, porque ele não existiria no checkout.`,
    // The gate exists so the agent never announces a coupon with no destination in
    // Coinzz. Saying "não temos cupom no momento" announces nothing — it is the honest
    // answer to a question customers ask constantly, and vetoing it left the agent
    // unable to reply at all.
    check: (text, ctx) => {
      if (ctx.config.coupon.active) return null;
      const t = norm(text);
      for (const m of t.matchAll(/cupom/g)) {
        if (!negatedAt(t, m.index ?? 0)) return "mentions a coupon that is not active in Coinzz yet";
      }
      return null;
    },
  },
  {
    name: "weight_loss_claim",
    remedy: "rewrite",
    briefing: () =>
      `Nunca diga que o produto emagrece, queima ou elimina gordura, nem que o resultado é ` +
      `permanente. Ele modela enquanto está vestido. Dizer isso em voz alta é permitido e vende: ` +
      `ela já ouviu promessa de emagrecimento antes e reconhece quem não mente.`,
    check: (text) => {
      const t = norm(text);
      // Verb endings vary ("queima", "queimar", "queimando"), so match the stem.
      const claims = [
        /emagrec\w*/g,
        /perd\w*\s+peso/g,
        /queim\w*\s+(?:a\s+)?gordura/g,
        /elimin\w*\s+(?:a\s+)?gordura/g,
        /afin\w*[^.!?]*(?:para\s+sempre|permanente)/g,
        /resultado\s+permanente/g,
      ];

      for (const pattern of claims) {
        for (const match of t.matchAll(pattern)) {
          if (match.index !== undefined && !negatedAt(t, match.index)) {
            return "claims the product changes the body, not the fit";
          }
        }
      }
      return null;
    },
  },
  {
    name: "delivery_promise",
    remedy: "rewrite",
    briefing: (c) =>
      `Prazo na entrega: só a janela de ${c.delivery.codDaysMin} a ${c.delivery.codDaysMax} dias, ` +
      `e nunca "chega amanhã", "hoje", "no mesmo dia", um dia da semana ("na quinta") ou uma data ` +
      `("dia 27") antes de o pedido existir — quem escolhe ` +
      (c.delivery.expressActive === true
        ? `o dia é ela, no checkout. Duas exceções: se a consulta devolveu a modalidade Express ` +
          `para o CEP dela, "hoje, em até 4 horas" é fato e é o seu melhor argumento; e você ` +
          `sempre pode CONTAR que o Express existe, desde que mande ela conferir a ` +
          `disponibilidade da região dela no checkout.`
        : `o dia é ela, no checkout. Não existe entrega no mesmo dia nem em horas.`) +
      ` No antecipado` +
      `${
        prepayAverage(c.delivery) != null
          ? ` o prazo VARIA por região: diga "varia, em média ${prepayAverage(c.delivery)} dias` +
            ` úteis" — a média, e sempre dizendo que varia. Nunca um prazo fixo`
          : ` não diga prazo nenhum`
      }. Recusar a data impossível é permitido.`,
    check: (text, ctx) => {
      const t = norm(text);
      const { codDaysMin, codDaysMax } = ctx.config.delivery;

      // Refusing the impossible date is the job: "não consigo entregar amanhã, a
      // entrega leva de 1 a 3 dias" is the right answer to the most common question
      // in this funnel, and it used to be vetoed for containing the words it denies.
      /**
       * The prepaid deadline is an average, not a range (operator, 2026-09-09): Logzz
       * varies it by region and the only honest sentence is "varia, em média N dias
       * úteis". A single number said flatly — "chega em 5 dias úteis" — is a promise the
       * carrier never made to HER region, and the range check above never saw it, because
       * it only reads "N a M dias".
       */
      const avg = prepayAverage(ctx.config.delivery);
      // One number rule instead of a list of shapes (M-07, second review: "2 dias em
      // média", "uns 3 dias", "dois dias", "em até 2 dias" each escaped a shape list). In
      // a sentence about the prepaid path, EVERY day count that does not close the
      // delivery range is the configured average, and the sentence says it varies.
      // Elsewhere, only an average-shaped count in delivery talk is judged — "em média 2
      // dias de uso" is about wearing the vest, not about the carrier.
      // M-08: "um/uma/num/numa" and weeks are counts too ("um dia só", "chega numa semana").
      const DAY_WORDS: Record<string, number> = {
        um: 1, uma: 1, num: 1, numa: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
        oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
      };
      /**
       * ONE vocabulary per idea, read by every rule of this gate (2026-09-28). Until then there
       * were three lists of the prepaid path's names and four of arrival words, each a little
       * different ("antes / cartão / online / link" in one and not in another), and ten review
       * rounds kept finding the sentence that fell between two of them. The two path names,
       * `PREPAY_NAME` and `COD_NAME`, sit at module level since 2026-09-28, because
       * `shipping_promise` reads them too.
       */
      // Arrival: a delivery verb, the place, or her having it ("é seu", "tá com você", "tá contigo",
      // "abre a caixa", "já veste"). "Em casa" only with being there — "usa ele em casa" is wearing it.
      // "Prazo" is not arrival — "o prazo pra trocar" — and the rules that read it say so.
      const ARRIVAL =
        /\b(?:cheg\w*|entreg\w*|receb\w*|lev[ae]\w*|demor\w*|envi\w*|despach\w*|post\w*|sai\w*|ai|la|na\s+sua\s+casa|mao|porta|viagem|caminho|vem|abre\s+a\s+caixa|ja\s+tem|(?:tem|tera|vai\s+ter)\s+(?:o\s+(?:seu\s+)?colete|ele)|ja\s+(?:(?:esta|ta)\s+)?(?:vest|us)\w*|e\s+(?:tod[oa]\s+)?(?:seu|sua)|(?:esta|ta|estara|estar|fica)\s+(?:(?:aqui|ai|la)\s+)?(?:com\s+(?:voce|ele)|contigo|em\s+casa))\b/;
      /** Delivery talk: arrival, the deadline named ("o prazo", "é rapidinho", "nesse tempo"), or the carrier. */
      const talksDelivery = (s: string): boolean => ARRIVAL.test(s) || /\b(?:prazo|rapid\w*|correio\w*|transportador\w*|(?:mesmo|nesse|esse)\s+tempo)\b/.test(s);
      const names = (re: RegExp, s: string) => s.search(re) !== -1;
      /**
       * M-10, independent review: a prepaid name that is denied does not name the prepaid path.
       * "Nada de cartão, nada de Pix" is the script's own argument for the delivery, and "sem
       * pix / nem pix / não precisa (de / pagar) antecipar / pix não! / pix não precisa" read as
       * the prepaid path vetoed its honest 1-3 days — and, in a header, let the prepaid average
       * through as the delivery's. Only a denier glued to the name in its own phrase: "no pix
       * não demora" and "sem juros no pix" still name it, and "não quer" denies only outside a
       * question ("Não quer pagar no pix?" offers it). Returns where the last name that is not
       * denied starts, or -1.
       */
      const prepaidNamed = (s: string): number => {
        let last = -1;
        for (const m of s.matchAll(PREPAY_NAME)) {
          const at = m.index ?? 0;
          const denier = /\b(?:sem|nem|nada\s+de|nao\s+(precisa|quer\w*)(?:\s+(?:de|pagar|ser))?)\s+(?:(?:no|na|o|a|pelo|pela|de|com|via|em)\s+)?(?:pag\w*\s+)?$/.exec(
            s.slice(0, at).split(/[,;:.!?\n]/).pop()!,
          );
          // A denier denies only a name its phrase closes on, or one in a series ("Nem pix, nem
          // boleto", "sem pix e sem cartão", "sem pix nenhum"). "Nem" is also "not even" ("nem no pix
          // demora" names it), and "nada de pix demorado / sem boleto que demora" talk about it
          // (2026-09-28): a word of its own after the name makes it the subject, not the denied.
          const rest = s.slice(at + m[0].length);
          const closes =
            /^\s*(?:[.!,;:?]|$|nem\b|nenhum\b|(?:e|ou)\s+(?:sem|nem|nada\s+de)\b|(?:e|ou)\s+(?:(?:no|na|pelo|pela|com|via|de)\s+)?(?:pix|boleto|cartao|credito|debito|transferencia|deposito|antecipa\w*|adianta\w*)\b)/.test(rest);
          if (denier && !(denier[1]?.startsWith("quer") && /^[^.!\n]*\?/.test(s.slice(at))) && closes) continue;
          // "Pix não precisa." denies; "pix não precisa esperar" says something about it.
          if (/^\s*nao(?:\s+precisa)?\s*(?:[.!,;:?]|$)/.test(rest)) continue;
          last = at;
        }
        return last;
      };
      /** A sentence that names the prepaid path only to deny it: "Sem pix, …", "Nada de pix." */
      const deniesPrepaid = (s: string): boolean => names(PREPAY_NAME, s) && prepaidNamed(s) === -1;
      /**
       * M-10: the path named in a header right before the sentence — "Pagou no pix? Chega em 2
       * dias." A header has no predicate of its own and the next sentence is its answer: a
       * question, or a fragment of at most four words (a path name is two or three, "no pix",
       * "pagando antes"; a fifth is room for a claim of its own), and a run of them counts
       * ("Pagou no pix? Ótimo."). The closest one that names a path decides, prepaid when it
       * names the prepaid one at all ("Na entrega ou no pix?"). A full statement ends the run,
       * and so does a sentence that names a path itself.
       */
      // A header that denies the prepaid path ("Nada de pix.") names the delivery one.
      // The walk back from each sentence, computed once for the whole text: walking it again at
      // every count was quadratic in a run of short questions (2026-09-28). `walk[j]` is what the
      // walk answers starting at sentence j; `ends` maps where a sentence ends to its index.
      let walk: Array<"prepay" | "cod" | null> | undefined;
      const ends = new Map<number, number>();
      const headerPath = (at: number): "prepay" | "cod" | null => {
        const head = t.slice(0, at).split(/[.!?\n]/).pop()!;
        const own = head + t.slice(at).split(/[.!?\n]/)[0]!;
        if (names(COD_NAME, own) || names(PREPAY_NAME, own)) return null;
        if (!walk) {
          walk = [];
          let end = 0;
          for (const s of t.split(/(?<=[.!?\n])/)) {
            end += s.length;
            ends.set(end, walk.length);
            walk.push(
              !/\?\s*$/.test(s) && s.trim().split(/\s+/).length > 4
                ? null
                : prepaidNamed(s) !== -1
                  ? "prepay"
                  : names(COD_NAME, s) || deniesPrepaid(s)
                    ? "cod"
                    : (walk.at(-1) ?? null),
            );
          }
        }
        const j = ends.get(at - head.length);
        return j == null ? null : walk[j]!;
      };
      const prepaidHeader = (at: number): boolean => headerPath(at) === "prepay";
      const PREPAY_ONE = new RegExp(PREPAY_NAME.source);
      /**
       * Whether `s` is at most the prepaid path's own window: "no antecipado o prazo varia por
       * região, em média 5 dias úteis". An allowlist — the 6th round found "…, nada muda" past a
       * word blocklist. The average's number is judged by the number rule, so here a window only
       * has to be a window. M-07: the prepaid mention must carry it ("varia / depende / conforme /
       * em média") — "…1 a 3 dias e no pagamento antecipado." reads as "the same there".
       */
      const windowRest = (s: string): string =>
        s
          .replace(/^\s+uteis\b/, "")
          .replace(PREPAY_ONE, "")
          .replace(/,?\s*(?:(?:cheg\w*|lev[ae]\w*|demor\w*|(?:voce\s+)?receb\w*|e|sao|fica)\s+)?(?:em\s+)?(?:media|torno|cerca|aproximadamente)\s+(?:de\s+)?\d{1,2}(?:[.,]\d)?\s*dias?(?:\s+uteis)?/g, "")
          // The average as the subject, the name already cut: "a média do antecipado é de 5 dias".
          .replace(/\b(?:a\s+)?media\s+(?:(?:d[oa]|n[oa])\s+)?(?:e|fica|sao)\s+(?:de\s+)?\d{1,2}(?:[.,]\d)?\s*dias?(?:\s+uteis)?/g, "")
          .replace(/\b(?:conforme|de\s+acordo\s+com|depende)\s+(?:d?[aeo]\s+)?(?:(?:sua|seu)\s+)?(?:regiao|cep)\b/g, "")
          .replace(/\bo\s+prazo\b|\bvaria\w*(?:\s+bastante)?|\bpor\s+regiao\b|\b(?:e|mas|no|pagando|pagamento|ja|enquanto|ta|viu)\b/g, "");
      const onlyPrepayWindow = (s: string): boolean => {
        if (!PREPAY_ONE.test(s)) return /^[\s.,;:!?()]*$/.test(s.replace(/^\s+uteis\b/, ""));
        if (!/\b(?:varia\w*|depende\w*|conforme|de\s+acordo|media)\b/.test(s)) return false;
        return /^[\s.,;:!?()]*$/.test(windowRest(s));
      };
      // Words that tie one path's window to the other's.
      const EQ =
        "(?:ou|tambem|igual\\w*|mesm\\w*|idem|que\\s+nem|tanto|quanto|como|mais\\s+rapido|em\\s+relacao|nao\\s+muda|nada\\s+muda|sem\\s+esperar|nao\\s+precisa\\s+esperar|todo\\s+mundo|tod[oa]s?|toda\\s+cliente|qualquer|independente|os\\s+dois|as\\s+duas|ambos)";
      /**
       * Whether a count the delivery path is named closest to stays the delivery's in a sentence
       * that also names the prepaid path (M-01, persona round 4, Cleide: "no pagamento na entrega
       * você recebe em 1 a 3 dias, no antecipado o prazo varia…" was judged as prepaid and vetoed
       * three times → fallback) — ONLY when the prepaid mention carries its own window, nothing
       * equates or extends one path to the other, and what surrounds the count is at most that
       * window. Second review, 2026-09-24: proximity alone let "no antecipado ou na entrega, chega
       * em 1 a 3 dias" and "na entrega é 1 a 3 dias; no antecipado também" through.
       */
      /** Whether a word ties one path's window to the other's in `sentence`. */
      const equatedIn = (sentence: string): boolean => {
        const firstPrepay = sentence.search(PREPAY_NAME);
        // "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia
        // por região" (code review, 2026-09-24): a "também escolhe / agenda / marca" before any
        // prepaid mention, in a clause that says "na entrega" and brings in no second option, and
        // only when the sentence ends at the prepaid window. Second review, twice: wider exemptions
        // let "…, e pagando antes também chega em 1 a 3 dias" and "na entrega ou no boleto, chega em
        // 1 a 3 dias" through — "ou", "igual", "mesmo" next to "na entrega" always tie in another path.
        const endsAtPrepayWindow =
          firstPrepay !== -1 &&
          /^[\s.,;:!?]*$/.test(
            sentence
              .slice(firstPrepay)
              .replace(PREPAY_ONE, "")
              .replace(/,?\s*em\s+media\s+\d+\s+dias(?:\s+uteis)?/g, "")
              .replace(/\bo\s+prazo\b|\bvaria\w*|\bpor\s+regiao\b/g, ""),
          );
        return [...sentence.matchAll(new RegExp(`\\b${EQ}\\b`, "g"))].some((e) => {
          const eAt = e.index ?? 0;
          const clause = sentence.slice(0, eAt).split(/[,;:]/).pop()! + sentence.slice(eAt).split(/[,;:]/)[0]!;
          const exempt =
            e[0] === "tambem" &&
            /^tambem\s+(?:escolh|agend|marc)\w*/.test(sentence.slice(eAt)) &&
            endsAtPrepayWindow &&
            !/\b(?:e|ou)\b/.test(sentence.slice(0, eAt).split(/[,;:]/).pop()!) &&
            eAt < firstPrepay &&
            /\bna\s+entrega\b/.test(clause) &&
            !/\b(?:e|ou)\s+(?:na|no|pagando|pelo|pela|de|a|o)\b|\boutr[oa]s?\b|\bopcao\b|\bforma\b|\bjeito\b|\bantes\b|\bpix\b|\bcartao\b|\bboleto\b|\bdois\b|\bduas\b|\bambos\b/.test(
              clause,
            );
          return !exempt;
        });
      };
      const deliveryKeeps = (sentence: string, head: string, tail: string, codAt: number): boolean => {
        if (!new RegExp(String.raw`${PREPAY_NAME.source}[^.!?\n]{0,60}\b(?:varia\w*|media|regiao)\b`).test(sentence)) return false;
        if (equatedIn(sentence)) return false;
        // After the count, at most the prepaid window. Clause by clause, one more kind is allowed:
        // what the price or the payment is ("…, e no cartão pelo checkout dá pra parcelar em até
        // 12x", "…, e no antecipado é R$ 116,91 com 10% de desconto", "…e você paga na porta") —
        // never time, arrival or likeness ("…e chega junto", "…é parecido", "…, e no depósito 2 a 3
        // dias").
        const windowed = PREPAY_ONE.test(tail) && /\b(?:varia\w*|depende\w*|conforme|de\s+acordo|media)\b/.test(tail);
        const tailKeeps =
          onlyPrepayWindow(tail) ||
          tail.split(/[;:]|(?<!\d),|,(?!\d)|\s(?:e|mas)\s/).every(
            (c) =>
              /^[\s.,;:!?()]*$/.test(c) ||
              (windowed && /^[\s.,;:!?()]*$/.test(windowRest(c))) ||
              ((names(COD_NAME, c) || /r\$|\b(?:reais|desconto|parcel\w*|checkout|cep|juros|frete|preco|valor|custa|cupom|\d+\s*x)\b/.test(c)) &&
                !talksDelivery(c.replace(COD_NAME, " ")) &&
                !/\b(?:dias?|semanas?|horas?|tempo|junto|parecid\w*|similar\w*|diferen\w*|bate\w*|rapid\w*|logo)\b/.test(c)),
          );
        if (!tailKeeps) return false;
        // M-07: before the count, the stretch from the first prepaid mention to the delivery name
        // is at most the prepaid window — "No antecipado varia por região, e no pix e na entrega, 1
        // a 3 dias" shares the range with the Pix.
        const headPrepay = head.search(PREPAY_NAME);
        return headPrepay === -1 || onlyPrepayWindow(head.slice(headPrepay, codAt === -1 ? head.length : codAt));
      };
      type Path = "cod" | "prepay" | "both";
      /**
       * THE answer to "which path is this count / range about", read by the number rule and the
       * range rule alike (2026-09-28 — until then each had its own, and they disagreed on a name
       * after the count, a header, and a denied name). In order:
       * 1. A path named in the sentence: the one closest before the count, else one in the count's
       *    own clause after it ("chega em 2 dias no pix"), else the only one the sentence names. The
       *    delivery keeps a count the prepaid path is named around only per `deliveryKeeps`, and a
       *    word that ties the two ("no pix ou na entrega, …") gives it to both — both rules judge it.
       * 2. A sentence that names the prepaid path only to deny it ("Sem pix, …") names the delivery.
       * 3. A header right before the sentence (`headerPath`).
       * `null` leaves it to the conversation's path.
       */
      const pathOf = (at: number, end: number): { path: Path | null; by: "name" | "after" | "denial" | "header" | null } => {
        const head = t.slice(0, at).split(/[.!?\n]/).pop()!;
        const rest = t.slice(end).split(/[.!?\n]/)[0]!;
        const sentence = head + t.slice(at, end) + rest;
        const codAt = Math.max(-1, ...[...head.matchAll(COD_NAME)].map((x) => x.index ?? 0));
        const prepayAt = prepaidNamed(head);
        const ownAfter = rest.split(/[,;:]|\s(?:e|mas|ou)\s/)[0]!;
        const prepayAny = prepaidNamed(sentence) !== -1;
        const codAny = names(COD_NAME, sentence);
        let near: Path | null = codAt > prepayAt ? "cod" : prepayAt > codAt ? "prepay" : null;
        let tail = rest;
        let by: "name" | "after" = "name";
        if (near == null && names(COD_NAME, ownAfter) && prepaidNamed(ownAfter) === -1) {
          near = "cod";
          tail = rest.slice(ownAfter.length);
          by = "after";
        }
        if (near == null && prepaidNamed(ownAfter) !== -1) near = "prepay";
        if (near === "cod" || (near == null && codAny && !prepayAny))
          return { path: !prepayAny || deliveryKeeps(sentence, head, tail, codAt) ? "cod" : "both", by };
        // The prepaid path closest, and the delivery tied to it ("na entrega ou no pix, …"): both.
        if (near === "prepay" || prepayAny) return { path: codAny && equatedIn(sentence) ? "both" : "prepay", by: "name" };
        if (deniesPrepaid(sentence)) return { path: "cod", by: "denial" };
        const h = headerPath(at);
        return { path: h, by: h ? "header" : null };
      };
      const COUNT =
        /\b(\d{1,2}(?:[.,]\d{1,2})?|n?uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s*(dias?|semanas?)\b/g;
      // Every rule below reads a count's whole sentence, so judging costs counts × sentence. No honest
      // reply comes near either limit (the corpus's most is 2 counts in a text and 269 characters in a
      // sentence); a degenerate one — a repetition loop at the 4000-token ceiling — took seconds at
      // 16k characters (2026-09-28). It goes back to be rewritten before any rule reads it.
      const counted = t.match(COUNT)?.length ?? 0;
      if (counted > 20) return `states ${counted} day counts in one reply; say the deadline once, in a short message`;
      if (counted > 0 && t.split(/[.!?\n]/).some((s) => s.length > 1000)) return "a sentence of over 1000 characters; write short messages";
      for (const m of t.matchAll(COUNT)) {
        const at = m.index ?? 0;
        const before = t.slice(Math.max(0, at - 30), at);
        const after = t.slice(at + m[0].length, at + m[0].length + 80);
        // A week is 7 calendar days: it can be the warranty, never the average (business days).
        const week = m[2]!.startsWith("semana");
        // The end of a range ("1 a 3 dias") is the range check's to judge — and judged here too
        // when in weeks ("1 a 2 semanas").
        if (!week && /\d\s*(?:a|e|ate)\s*$/.test(before)) continue;
        // "Um dia" with its own qualifier is a day, not a count: "um dia marcado", "num dia de festa".
        if (/^n?uma?$/.test(m[1]!) && /^\s+(?:marcad|agendad|especial|important|de\s+festa)/.test(after)) continue;
        const sentence =
          t.slice(0, at).split(/[.!?\n]/).pop()! + t.slice(at).split(/[.!?\n]/)[0]!;
        const days = (DAY_WORDS[m[1]!] ?? Number(m[1]!.replace(",", "."))) * (week ? 7 : 1);
        const phrase = t.slice(0, at).split(/[,;:.!?\n]/).pop()!;
        // Every exemption is a loosening, and each shape so far leaked or over-blocked (M-07,
        // six reviews): context rules freed "a troca é grátis e no pix chega em só 2 dias",
        // exact shapes vetoed the warranty sentence `warranty_promise` itself teaches. The
        // rule that holds is about the NUMBER: only the configured warranty is a warranty.
        // Any other count on the prepaid path is a deadline, whatever words surround it —
        // "garantia de 2 dias", "2 dias após o recebimento". The warranty count is exempt only
        // when bound to a return word (before it with filler only, or after it) and no
        // delivery verb governs it ("chega em 7 dias pra trocar", "leva 7 dias, com garantia").
        // tests/prepaid-deadline-fuzz.test.ts generates the lies and requires a veto for all.
        // Seventh review: the 7 is the warranty when its own clause names a return and no
        // delivery, and nothing after it in the sentence talks delivery — "a garantia é de 7
        // dias pra entrega" and "a troca é em 7 dias, e a entrega também" are deadlines. The
        // one delivery-looking word allowed is the warranty's own anchor, "após/a partir
        // de quando/contados do recebimento". Safe to be this simple only because no other
        // number can ever be exempt.
        if (days === ctx.config.delivery.warrantyDays) {
          // M-08, fourth review: the burden is inverted. Four rounds stripped anchors and hunted
          // for delivery words, and each closed a shape while its siblings stayed open. The count
          // is the warranty only when a warranty form GOVERNS it — a return purpose right after
          // it, or a return word taking it right before it — and nothing after it says anything
          // but "corridos/úteis", the purpose, or when the warranty starts counting.
          // "Quando chega aí você tem 7 dias pra trocar": the place of the arrival is part of it.
          const WHO = String.raw`(?:(?:o\s+colete|o|voce|ele|a\s+senhora)\s+)?(?:receb|cheg)\w*(?:\s+(?:ai|la|em\s+casa|na\s+sua\s+casa))?`;
          // When the warranty starts counting: "depois que receber", "a partir do recebimento",
          // "contados de quando ele chegar", "a contar do dia que receber", "após a entrega" — and
          // the script's own "contando do dia que receber / da data em que você recebe" (fifth review).
          const START = String.raw`(?:(?:depois\s+que|apos|depois\s+d[aeo]|(?:a\s+partir|contad[oa]s?(?:\s+a\s+partir)?|contando(?:\s+a\s+partir)?|a\s+contar)\s+d[aeo](?:\s+quando|\s+(?:dia|data)\s+(?:em\s+)?que)?|de\s+quando)\s+${WHO}|(?:apos|depois\s+d[ae]|a\s+partir\s+d[ae]|contad[oa]s?\s+d[ae]|contando\s+d[ae]|a\s+contar\s+d[ae])\s+(?:a\s+)?entrega)`;
          // The return verb may carry its object: "pra trocar de tamanho", "pra devolver o produto",
          // "trocar pelo tamanho certo" (2026-09-28: without "pelo" and the adjective, "pode trocar
          // pelo tamanho certo em até 7 dias após o recebimento" was not governed, and its anchor's
          // "recebimento" read as arrival).
          const OBJECT = String.raw`(?:\s+(?:de|o|a|pelo|por\s+outro)\s+(?:tamanho|produto|colete|numero)(?:\s+(?:certo|correto|ideal|maior|menor))?)?`;
          const PURPOSE = String.raw`(?:(?:pra|para)\s+(?:(?:trocar|devolver|troca|devolu\w*|desistir|se\s+arrepender|experimentar)(?:\s+ou\s+(?:trocar|devolver|desistir))?${OBJECT}|(?:pedir|solicitar)\s+a\s+(?:troca|devolucao))|de\s+(?:garantia|arrependimento|prazo\s+(?:pra|para)\s+(?:troca|devol\w*)))`;
          // Getting her money back ("e recebe seu dinheiro de volta") and asking the CEP to look
          // the delivery up ("me passa seu CEP pra eu ver a entrega aí") are not delivery (loop
          // review, 2026-09-25) — only as the purpose of asking the CEP ("dá pra ver a entrega em
          // casa nesse tempo" is a deadline).
          // M-10: nor is the delivery path's own name — "na entrega / pagando na entrega / pagando
          // na mão do entregador você tem 7 dias pra trocar" names the path, not an arrival.
          const notDelivery = (x: string) =>
            x
              .replace(/\b(?:(?:no\s+)?pag\w*\s+)?na\s+entrega\b|\bpag\w*\s+na\s+(?:porta|mao(?:\s+do\s+entregador)?)\b/g, " ")
              .replace(/\breceb\w*\s+(?:(?:o|a|seu|sua)\s+){0,2}(?:dinheiro(?:\s+de\s+volta)?|reembols\w*|estorno)\b/g, " ")
              .replace(/\b(?:cep|endereco)\b[^.!?]{0,20}?\b(?:ver|conferir|checar|consultar|calcular)\s+(?:como\s+fica\s+)?(?:a\s+)?entrega\b(?:\s+ai\b)?(?![^.!?]*\b(?:cheg\w*|leva\w*|demor\w*|dias?|tempo|prazo)\b)/g, " ");
          // After the count: "corridos/úteis", the purpose and the start, in any order; a bare
          // "quando receber" only after the purpose ("7 dias pra trocar, quando receber").
          let tail = t.slice(at + m[0].length).split(/[.!?\n]/)[0]!;
          let purpose = false;
          // Her receiving it ("contando de quando recebeu"), not the store ("depois que
          // recebermos") nor the noun ("a partir do recebimento") — sixth review.
          let startHer = false;
          for (let x; (x = tail.match(new RegExp(String.raw`^[\s,]*(?:corridos|uteis|(${PURPOSE})|(${START})${purpose ? String.raw`|quando\s+${WHO}` : ""})\b`))); ) {
            purpose ||= x[1] != null;
            startHer ||= /\b(?:receb(?:er|e|eu|a)|cheg(?:ar|a|ou))(?:\s+(?:ai|la|em\s+casa|na\s+sua\s+casa))?$/.test(x[2] ?? "");
            tail = tail.slice(x[0].length);
          }
          // "A garantia de 7 dias vale (também) nos dois": the warranty's own verb opens the rest.
          tail = tail.replace(/^\s+(?:vale\w*|continua|se\s+aplica|e\s+(?:por\s+)?lei)(?:\s+tambem)?\b/, ",");
          // Then the sentence ends, or a new clause opens that says nothing about arrival or time
          // ("…, e o frete da troca é por nossa conta", "…se não servir"). "de viagem", "até lá",
          // "ele está aí", "e o colete é seu", "…, que é bem quando ele chega" are the count's own
          // arrival — past a semicolon too ("…; a entrega também", sixth review). The one delivery
          // mention that is not a deadline is the script's own "…; e eu fico aqui no WhatsApp com
          // você do pedido até a entrega" — only with its subject: loose, "7 dias pra trocar do
          // pedido até a entrega" is the delivery (seventh review).
          tail = tail.replace(/\beu\s+fico\s+aqui\b[^;,]*?\bcom\s+voce\s+do\s+pedido\s+ate\s+a\s+entrega\b/g, " ");
          // 2026-09-28: the arrival and her having it are the one `ARRIVAL`; the time words here are
          // time, not the phrases that only share a word with it — "suporte todo dia", "sem perder
          // tempo", "mesmo tamanho ou outro". And the prepaid window may follow, as the prompt's own
          // warranty line says it ("…7 dias pra trocar, e no antecipado o prazo varia por região, em
          // média 5 dias úteis"): its number is judged on its own.
          const newClause = /^\s*(?:[,;:]|(?:e|mas|ou|se|sem|caso|porque|pois|que)\s)/.test(tail);
          // The delivery's own window may follow the same way, as a clause that is nothing but it
          // ("…7 dias pra devolver, e a entrega leva de 1 a 3 dias"): its numbers are judged on
          // their own, by the range rule and this loop (2026-09-28).
          const codWindow =
            /^\s*[,;]?\s*(?:(?:e|mas)\s+)?(?:(?:a|na)\s+entrega|o\s+prazo\s+d[ae]\s+entrega)\s+(?:(?:voce\s+)?(?:leva|e|chega|recebe|demora|fica)\s+)?(?:(?:em|de)\s+)?(?:ate\s+)?(?:\d{1,2}\s+a\s+)?\d{1,2}\s+dias(?:\s+uteis)?\s*$/;
          const tailOk =
            /^\s*$/.test(tail) ||
            (newClause && PREPAY_ONE.test(tail) && onlyPrepayWindow(tail)) ||
            (newClause && codWindow.test(tail)) ||
            (newClause &&
              !ARRIVAL.test(notDelivery(tail)) &&
              !/\b(?:quando|dias?|semanas?|depois|antes|ate|junto|tempo|prazo|mesm\w*|igual\w*|tambem)\b/.test(
                tail.replace(/\btod[oa]s?\s+(?:o\s+|os\s+)?dias?\b|\bperder\s+tempo\b|\bmesm[oa]\s+(?:tamanho|numero|modelo|cor)\b/g, " "),
              ));
          const sb = t.slice(0, at).split(/[.!?\n]/).pop()!;
          // A return word taking the count right before it: "a troca é (de/em até)", "a garantia
          // é a mesma:", "a troca pode ser feita em até", "pode trocar/devolver em (até)". A
          // conjunction between them ("pode trocar e em 7 dias…") is another clause.
          const governedBefore =
            // One copula at most: "a garantia também é de", "a troca é grátis em até" — never "tem
            // garantia e são 7 dias", where "e" is "and" (eighth review).
            /\b(?:troca|devolucao|garantia|arrependimento|desistencia)(?:\s+(?:no\s+\w+|tambem|pode\s+ser\s+\w+|vale|a\s+mesma|o\s+mesmo|gratis|gratuita|igual))*(?:\s+(?:e|sao|fica)(?:\s+(?:tambem|a\s+mesma|o\s+mesmo|gratis|gratuita|igual))*)?\s*:?\s+(?:(?:de|em|ate|dentro\s+de|no\s+prazo\s+de)\s+)*$/.test(sb) ||
            new RegExp(String.raw`\b(?:troc|devolv|desist|arrepend)\w*(?:\s+(?:o\s+colete|ele|ela)|${OBJECT})\s+(?:(?:em|ate|dentro\s+de|no\s+prazo\s+de)\s+)+$`).test(sb);
          // "(você) tem / são / é 7 dias" after a return word, with nothing about arrival between:
          // "se precisar trocar, são 7 dias a partir de quando receber", "é só trocar: você tem
          // 7 dias". "Pode trocar, o prazo até quando chegar é de 7 dias" is a deadline.
          const lastRet = [...sb.matchAll(/\b(?:troc|devol|desist|arrepend|garantia)\w*/g)].pop();
          // Only when the return word governs the count (eighth review): "o prazo pra trocar (ou
          // devolver) é de", "pra trocar, o prazo é de", "se precisar trocar, são", "é só trocar:
          // você tem". A return word loose in another clause takes nothing: "a troca é fácil, e o
          // prazo é 7 dias", "tem garantia e são 7 dias", "com direito a troca, são 7 dias".
          const RETV = String.raw`(?:troc|devol|desist|arrepend|garantia)\w*(?:\s+ou\s+(?:troc|devol)\w*)?`;
          const TAKES = String.raw`(?:voce\s+)?(?:tem|tera|sao|e|fica)\s+(?:(?:ate|de)\s+)?$`;
          const takenAfterReturn =
            lastRet != null &&
            new RegExp(
              String.raw`\bprazo\s+(?:pra|para|de)\s+${RETV}\s+${TAKES}|(?:\bse\s+(?:(?!\b(?:cheg|receb|entreg|lev[ae]|demor|envi|despach|post)\w*)[^,;:])*?|\b(?:pra|para)\s+|\be\s+so\s+)${RETV}${OBJECT}\s*[,:]\s*(?:(?:o|seu)\s+prazo\s+)?${TAKES}`,
            ).test(sb);
          // The count's own clause before it says nothing about arrival, except where the warranty
          // starts counting — and never "até / o prazo / o tempo" up to the arrival ("o prazo até
          // quando chegar é de 7 dias pra trocar").
          const own = sb
            .split(/[,;:]|\s(?:e|mas)\s+(?=(?:voce|ela|eu|a|o|no|na|se|tem)\b)|\s(?:porque|pois)\s|(?<!\b(?:depois|dia|em))\sque\s/)
            .pop()!
            .replace(new RegExp(String.raw`(?<!\b(?:ate|pra|para|prazo|tempo)\s)\b(?:${START}|quando\s+${WHO})`, "g"), " ");
          // "Você tem 7 dias contando de quando recebeu": a count she has, starting at her receiving
          // it, is never the carrier's — only "você tem", never "são / é / o prazo é de".
          const hers = startHer && /\bvoce\s+(?:tem|tera)\s+(?:ate\s+)?$/.test(sb);
          if ((purpose || governedBefore || takenAfterReturn || hers) && tailOk && !ARRIVAL.test(notDelivery(own))) continue;
        }
        // A refund is not a delivery, at any count: "reembolso em até 30 dias", "recebe em até
        // 30 dias o seu dinheiro de volta".
        if (/\b(?:reembolso|estorno|dinheiro\s+de\s+volta)\s+(?:em|de|por)\s+(?:ate\s+)?$/.test(phrase)) continue;
        if (/\breceb\w*\s+(?:em\s+)?(?:ate\s+)?$/.test(phrase) && /^\s*(?:(?:o|a|seu|sua)\s+){0,2}(?:reembols\w*|dinheiro\s+de\s+volta|estorno)\b/.test(after)) continue;
        // "Faz 3 dias que comprei" is the past, tied to the count; "há 2 dias de prazo" is not.
        if (/\b(?:ha|faz|fez|fazem)\s+$/.test(before) && /^\s*(?:que|atras)\b/.test(after)) continue;
        // Refusing the number is the job — "não consigo garantir 2 dias", "não dá pra prometer
        // 2 dias" — and only that: the denial must govern garantir/prometer right before the
        // count. "Não tem como passar de 2 dias" and "não posso negar que chega em 2 dias"
        // are promises (fourth review).
        if (
          /\b(?:nao|nunca|jamais)\s+(?:(?:consigo|conseguimos|posso|podemos|da\s+pra|tem\s+como)\s+)?(?:te\s+|lhe\s+)?(?:garant\w*|promet\w*)\s+(?:que\s+(?:chegue|chega|receba|recebe)\s+(?:em\s+)?(?:ate\s+)?)?$/.test(phrase)
        )
          continue;
        // A count that is the whole of its clause ("É 2 dias.", "Sem pix, em uns 3 dias, viu?")
        // answers the one question that has a count for an answer.
        const bare =
          /^\s*(?:(?:e|sao|em|ate|uns|umas|so|mais\s+ou\s+menos|no\s+maximo|cerca\s+de|dentro\s+de|daqui\s+a|tipo|olha|entao)\s+)*$/.test(phrase) &&
          /^\s*(?:uteis|corridos)?(?:\s*,?\s*(?:viu|ta|ok|so|no\s+maximo|mais\s+ou\s+menos))*\s*(?:[,;:.!?\n]|$)/.test(after);
        // Integration review: the word "um/uma" is an article as often as a count. The ruler's
        // own "esperando um dia bom" was vetoed on the prepaid path — and a vetoed touch is
        // cancelled without a word — with "um dia desses", "usa um dia inteiro", "uma semana
        // depois de usar". In a sentence that says nothing of delivery, arrival or her having
        // it, the word is a count only when a time word takes it ("em/de/até/só/tem/leva…
        // uma semana", "um dia só") or the prepaid path is named; and a count for the payment
        // to clear ("no pix é só um dia pra eu confirmar o pagamento") is not a deadline.
        // Requiring delivery words alone freed "em uma semana o colete é seu" (M-08 fuzz).
        if (
          /^n?uma?$/.test(m[1]!) &&
          !talksDelivery(sentence) &&
          !bare &&
          (/^\s+(?:pra|para)\s+(?:(?:eu|(?:a\s+)?gente|o\s+banco)\s+)?(?:confirm|compens|aprov|identific|process)\w*/.test(after) ||
            (!/\b(?:em|de|ate|dentro\s+de|por|media|cerca|so|apenas|tem|tera|sao|e|fica|leva\w*|demor\w*|dura\w*|passa\w*|mais|menos|que)\s+$/.test(before) &&
              !/^\s+(?:so|apenas|no\s+maximo|no\s+minimo)\b/.test(after) &&
              prepaidNamed(sentence) === -1 &&
              // Nor when it denies the prepaid path, which names the delivery (2026-09-28).
              !deniesPrepaid(sentence) &&
              !prepaidHeader(at)))
        )
          continue;
        const averageShaped =
          /\b(?:media|torno|cerca|aproximad\w*)\s+(?:de\s+)?$/.test(before) || /^\s*uteis\b/.test(after);
        // The prepaid average's own shape named by the delivery only after it ("em média 5 dias
        // úteis na entrega") stays with the prepaid rule.
        const found = pathOf(at, at + m[0].length);
        const { path, by } = found.by === "after" && averageShaped ? { path: null, by: null } : found;
        const named = by === "name" || by === "after";
        // On the prepaid path a count whose sentence names no path is the prepaid delivery's when
        // the sentence talks delivery or arrival — the one vocabulary, which has the arrival without
        // a verb ("em 2 dias ele está aí na sua casa", "o colete é seu"). Until 2026-09-28 it was
        // every count unless wearing the vest governed it, and "o reembolso cai em até 5 dias", "a
        // promoção vale por 5 dias", "te chamo daqui a 2 dias" were vetoed on the prepaid path; a
        // list of exemptions would have been the eleventh round. The average's own words ("em média
        // 2 dias úteis") are delivery talk here — not in getting used to the vest ("em média 2 dias
        // de uso", "se acostuma em cerca de 3 dias").
        const averageWord = /\b(?:media|torno|cerca|aproximad\w*)\s+(?:de\s+)?$/.test(before) && !/\bde\s+uso\b|\bse\s+(?:acostum|adapt)\w*/.test(sentence);
        const deadlineTalk = talksDelivery(sentence) || bare;
        const prepaid = path === "both" || path === "prepay" || (!named && ctx.paymentPath === "prepay" && (deadlineTalk || averageWord));
        // M-10: on the delivery path — named closest before the count, or the conversation's
        // when the sentence names none and talks delivery or arrival ("o colete tá aí em 5 dias";
        // "30 dias pra devolver" and "5 kg em uma semana" are other gates') — every count fits the
        // configured range: one number inside it, or a range inside it ("de um a três dias"). A week never
        // fits. It used to be `continue`, and the range check only reads digits, so "na entrega
        // chega em uma semana / em 5 dias / de uma a duas semanas" passed. The prepaid average's
        // own shape ("em média N dias úteis") stays with the prepaid rule below — unless the
        // sentence or its header names or denies its way to the delivery ("Nada de pix. Em média 5
        // dias úteis.", "Vai ser na entrega? Chega em média 5 dias úteis."). A header or a denial on
        // the prepaid conversation leaves the count to both rules.
        // Refusing the impossible date is the job (the briefing says so): a count denied right where
        // it is counted, with the truth told in the same sentence — "na entrega não chega em 5 dias,
        // chega em 1 a 3 dias", "…em até 3 dias, nunca 5 dias", "não demora uma semana: chega em 1 a
        // 3 dias". Only "não/nunca (chega/recebe/entrega/é/leva/demora) (em/de)" or "não passa": "não
        // passa de 5 dias" and "não demora mais que 5 dias" promise a ceiling, and "não demora, chega
        // em 5 dias" has its comma in between. Every other count of the sentence is judged on its own.
        const denied =
          /\b(?:nao|nunca|jamais)\s+(?:(?:(?:cheg|receb|entreg|lev[ae]|demor)\w*|e)\s+(?:(?:em|de)\s+)?|(?:em|de)\s+|passa\s+)?$/.test(phrase) &&
          (sentence.match(COUNT)?.length ?? 0) > 1;
        // A denial names the delivery the way "na entrega" does (2026-09-28): its count is the
        // delivery's without an arrival word, or "Sem pix, em 5 dias você tem o colete" passed
        // wherever the arrival vocabulary has no form for her having it.
        if ((named && path !== "prepay") || ((ctx.paymentPath === "cod" || path === "cod") && path !== "prepay" && (averageShaped ? path === "cod" : deadlineTalk || by === "denial"))) {
          if (denied) continue;
          if (week) return `delivery in weeks contradicts the configured ${codDaysMin}-${codDaysMax} days`;
          const from = new RegExp(String.raw`\b(\d{1,2}|${Object.keys(DAY_WORDS).join("|")})\s+(?:a|e|ate)\s+$`).exec(before)?.[1];
          const start = from == null ? days : (DAY_WORDS[from] ?? Number(from));
          if (start < codDaysMin || days > codDaysMax)
            return `delivery window of ${start === days ? days : `${start}-${days}`} days contradicts the configured ${codDaysMin}-${codDaysMax}`;
          if (!prepaid) continue;
        }
        if (!prepaid && !(averageShaped && talksDelivery(sentence))) continue;
        if (avg == null) return "states a prepaid deadline, and none is configured";
        // Denying a count faster than the average is the refusal; denying a week says it is faster.
        if (denied && !week && days < avg) continue;
        if (week || Number(days) !== avg) {
          return `prepaid average of ${days} days is not the configured ${avg}`;
        }
        if (!/\b(media|varia\w*|depende\w*|em\s+torno|cerca\s+de|aproximad\w*)\b/.test(sentence)) {
          return "states the prepaid average as a fixed deadline, without saying it varies";
        }
      }

      // Same-day is a promise until the checkout says otherwise. When the availability
      // query came back with an Express window for HER postcode, it is a fact the
      // courier already agreed to — and the strongest sentence this funnel owns.
      if (ctx.stage !== "logistics") {
        const express = ctx.config.delivery.expressActive === true;
        for (const m of t.matchAll(
          /(chega|entrega|recebe|receber).{0,24}(amanha|hoje|24\s*h|no\s+mesmo\s+dia)/g,
        )) {
          if (negatedAt(t, m.index ?? 0)) continue;
          const sameDay = /hoje|no\s+mesmo\s+dia/.test(m[2] ?? "");
          if (sameDay && express && (ctx.sameDayWindow || defersToCheckout(t))) continue;
          return "promises same-day or next-day delivery";
        }

        // No same-day modality exists (2026-09-24) until the config says so: not the word
        // Express, not "em até 4 horas" — whatever the region query answered. Only a denial
        // right beside it passes: "não temos entrega expressa", "a Express não está ativa".
        if (!express) {
          for (const m of t.matchAll(
            /\bexpress\w*|\b(?:em|dentro\s+de)\s+(?:ate\s+)?\d{1,2}\s*h(?:oras?)?\b|\bem\s+(?:poucas|algumas)\s+horas\b/g,
          )) {
            const at = m.index ?? 0;
            if (deniedJustBefore(t, at)) continue;
            // Hours are a delivery claim only when a delivery verb governs them, up to three
            // words before ("chega em 4 horas") — "em até 24 horas você recebe a
            // confirmação" is about the order, not the parcel (third review).
            if (
              !m[0].startsWith("express") &&
              !/\b(?:cheg|receb|entreg)\w*(?:\s+\S+){0,3}\s*$/.test(t.slice(Math.max(0, at - 40), at)) &&
              !/^\s+(?:voce\s+)?(?:cheg|receb|entreg)\w*\s+(?:o\s+colete|o\s+pedido|seu\s+colete|em\s+casa|ai)\b/.test(t.slice(at + m[0].length))
            )
              continue;
            // Only a bare "not available/active/here yet" passes after the word. "A Express
            // não tem custo extra" and "…não está disponível depois das 14h" say it exists.
            const after = t.slice(at + m[0].length).split(/[,;:.!?\n]|\bmas\b/)[0]!;
            if (/^\s*(?:ainda\s+)?nao\s+(?:esta|ta|existe|chegou|temos)(?:\s+(?:disponivel|ativa|funcionando))?(?:\s+(?:ainda|aqui|por\s+enquanto|na\s+sua\s+(?:regiao|cidade)))?\s*$/.test(after)) continue;
            return "offers a same-day modality that is not active";
          }
        }

        // A weekday or a date is the same promise one step further out: "pra receber na
        // quinta-feira" before the order exists, when the customer picks the day in the
        // checkout and the window is a range. `negatedAt` is not used here: it reads past
        // a comma, and "não precisa se preocupar, chega na quinta" is the promise itself.
        // The only denial is one that governs the verb — "não chega", "não consigo
        // garantir que chega" — and the only other exemption is repeating what she said.
        // "De segunda a sexta" is when the courier works, not a day, and goes first —
        // only that span: "chega de quarta a sexta" is a window of days, and a promise.
        const WEEKDAY = String.raw`(?:(?:segunda|terca|quarta|quinta|sexta)(?:[\s-]*feira)?|sabado|domingo)`;
        const td = t.replace(/\bde\s+segunda(?:[\s-]*feira)?\s+(?:a|ate)\s+(?:sexta(?:[\s-]*feira)?|sabado)\b/g, " ");
        const DAY = String.raw`(?:${WEEKDAY}(?!\s+(?:vez|via|tentativa|peca|unidade|compra|opcao)\b)|dia\s+(?:[12]?\d|3[01])\b(?!\s*dias)|\b(?:[12]?\d|3[01])\/(?:0?[1-9]|1[0-2])\b(?!\s*dias))`;
        const VERB = String.raw`\b(?:(?!(?:chegou|chegaram|recebeu|recebi|entregou|entreguei)\b)(?:cheg|entreg|receb)\w*|ta\s+(?:ai|na\s+sua|com\s+voce)|vai\s+(?:estar|ai)|na\s+sua\s+(?:mao|casa|porta)|dar?\s+tempo)`;
        for (const m of td.matchAll(
          new RegExp(
            String.raw`${VERB}[^,.;:!?\n]{0,24}?\b${DAY}|\b${DAY}\s+(?:(?:voce|ja|ele|o\s+colete|a\s+entrega)\s+)*${VERB}|\b${DAY}\s*,?\s*(?:e\s+)?(?:dar?\s+tempo|cheg\w*\s+(?:a\s+tempo|sim))`,
            "g",
          ),
        )) {
          const at = m.index ?? 0;
          const phrase = td
            .slice(Math.max(0, at - 60), at)
            .split(/[:;.!?\n]/)
            .pop()!
            .split(PHRASE_COMMA)
            .pop()!
            .split(/\b(?:mas|porem|so\s+que|entao)\b/)
            .pop()!;
          const negations = phrase.match(/\b(?:nao|nunca|jamais|nem)\b/g)?.length ?? 0;
          const CLITIC = String.raw`(?:(?:se|te|me|lhe|vai|vou|ia)\s+)?`;
          // She picks the day: "você escolhe no checkout, e se aparecer quinta, recebe na
          // quinta" hands the day to the checkout instead of promising it.
          // Not when a claim follows the choice: "você escolhe o dia e chega na quinta".
          const choice = /\bescolh\w*|\bse\s+(?:no\s+checkout\s+)?aparecer\b/.exec(
            td.slice(0, at).split(/[.!?\n]/).pop()!,
          );
          if (choice && !/\b(?:e|mas|entao|que)\b/.test(td.slice(0, at).split(/[.!?\n]/).pop()!.slice(choice.index + choice[0].length)))
            continue;
          if (
            // "O entregador não trabalha domingo": the denial sits between verb and day.
            /\b(?:nao|nunca)\b/.test(m[0]) ||
            (negations === 1 &&
            (new RegExp(String.raw`\b(?:nao|nunca|jamais|nem)\s+(?:${CLITIC}|(?:tem|ha|existe|faz|fazemos)\s+)$`).test(phrase) ||
              new RegExp(
                String.raw`\b(?:nao|nunca|jamais)\s+(?:consigo|conseguimos|posso|podemos|da\s+pra|tem\s+como|tenho\s+como|temos\s+como|(?:vai\s+)?dar?\s+tempo\s+de|garanto|garantimos|prometo|prometemos|sei\s+se)\s+(?:(?:(?:te|lhe)\s+)?(?:garantir|prometer|dizer)\s+)?(?:que\s+|a\s+)?(?:(?:voce|ele|o\s+colete|a\s+entrega)\s+)?${CLITIC}(?:(?:na|no|ate|pra|para)\s+)?$`,
              ).test(phrase)))
          ) {
            // "Não entrega na sexta, só na quinta" denies one day to promise another.
            const after = td.slice(at + m[0].length).split(/[.!?\n]/)[0]!;
            if (new RegExp(String.raw`\b(?:so|mas|apenas|somente|e\s+sim)\s+(?:(?:na|no|ate|pra|para|em)\s+)?${DAY}`).test(after))
              return "promises a delivery day before the order exists";
            continue;
          }
          // Retelling her own words: "você disse que precisa receber até sábado". Only
          // "você" as the one who said it, and nothing after it that starts a claim.
          const recount = /\b(?:voce|vc)\s+(?:me\s+)?(?:falou|disse|comentou|contou|mencionou|escreveu)\b/.exec(phrase);
          if (
            recount &&
            !/\b(?:e|entao|mas)\b|\bque\s+(?:cheg|receb)/.test(
              phrase.slice(recount.index + recount[0].length) + td.slice(at, at + m[0].length),
            ) &&
            !/\bdar?\s+(?:tempo|sim|certo)\b|\b(?:cheg|receb)\w*|\bsim\b/.test(
              td.slice(at + m[0].length).split(/[.!?\n]/)[0]!,
            )
          )
            continue;
          return "promises a delivery day before the order exists";
        }
      }

      /**
       * Each path has its own window, and the prepaid one only exists because someone
       * looked. Until 2026-09-08 the rule here was "say no window on the prepaid path",
       * on the reasoning that freight varies by region — true, and about price, not about
       * time. The operator walked the checkout and found the carrier does state a window.
       *
       * A path with no configured window still refuses every claim, which is the right
       * default: better mute than inventing a date the carrier never agreed to.
       */
      /**
       * Each window is judged against the path ITS OWN sentence names, and only falls
       * back to the conversation's path when it names none. The comparison message the
       * prompt teaches carries both windows on purpose — one per option — and a gate
       * that picked a single path from context rejected the correct half of it, which
       * meant the message the agent is told to write could never pass.
       */
      for (const m of t.matchAll(/(\d{1,2})\s*(?:a|e|ate)\s*(\d{1,2})\s*(dias|semanas)/g)) {
        const at = m.index ?? 0;
        // `pathOf` decides whose range this is, as it does for every count.
        const found = pathOf(at, at + m[0].length);
        const named = found.by === "name" || found.by === "after" || found.path === "prepay" ? found.path : null;
        // M-08 review: a range in weeks is a range in days, 7 each.
        const min = Number(m[1]) * (m[3] === "semanas" ? 7 : 1);
        const max = Number(m[2]) * (m[3] === "semanas" ? 7 : 1);
        for (const path of named === "both" ? (["cod", "prepay"] as const) : [named ?? ctx.paymentPath]) {
          const [min_, max_] =
            path === "cod"
              ? [codDaysMin, codDaysMax]
              : [ctx.config.delivery.prepayDaysMin, ctx.config.delivery.prepayDaysMax];
          if (min_ == null || max_ == null)
            return `states a range on the ${path} path, which has an average and not a range`;
          if (min < min_ || max > max_)
            return `delivery window ${min}-${max} days contradicts the configured ${min_}-${max_} on ${path}`;
        }
      }
      return null;
    },
  },
  {
    name: "invented_testimonial",
    remedy: "rewrite",
    briefing: (c) =>
      `Só cite depoimento entre aspas se ele estiver na lista de depoimentos reais que você ` +
      `recebeu. Sem essa lista, não atribua fala nenhuma a cliente nenhuma. Quando ela pedir ` +
      `depoimento, e só então, você pode indicar a seção de depoimentos do nosso site. ` +
      (c.socialProof?.satisfiedCustomers != null
        ? `O único número de clientes que existe é "mais de ${c.socialProof.satisfiedCustomers} ` +
          `clientes satisfeitas"; nenhum outro.`
        : `Não cite número de clientes nem de vendas.`),
    // A quote is only a testimonial when someone is credited with saying it. Reading
    // every quoted string as one made the gate veto ordinary writing — repeating the
    // customer's own question back to her, naming the product the way the page does —
    // and each veto is a paid rewrite for a sentence that was already correct.
    check: (text, ctx) => {
      const known = (ctx.knownTestimonials ?? []).map(norm);
      // Testimonials only when she asks (R16.7, the residue of grafo §36): the section of the site, the
      // word, "o que as clientes dizem", or a known testimonial quoted, when her message asked none.
      if (ctx.askedTestimonial === false) {
        const nt = norm(text);
        if (
          /\bdepoiment\w*|\bavaliac\w*\s+(?:d[ea]s?\s+|das\s+nossas\s+)?(?:clientes?|compradoras?)\b|\bo\s+que\s+(?:as|nossas|outras)\s+(?:clientes?|compradoras?)\s+(?:dizem|falam|acham|contam|comentam)\b/.test(nt) ||
          known.some((k) => k.length >= 12 && nt.includes(k)) ||
          [...text.matchAll(/[“”"]([^“”"]{12,})[“”"]/g)].some((m) => known.some((k) => k.includes(norm(m[1]!))))
        )
          return "brings up testimonials she did not ask for";
      }
      for (const m of text.matchAll(/[\u201c\u201d"]([^\u201c\u201d"]{12,})[\u201c\u201d"]/g)) {
        const before = norm(text.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0));
        const attributed =
          /\b(cliente|compradora|menina|moca|ela|disse|falou|contou|comentou|relatou|escreveu|mandou|depoimento|avaliacao)\b/.test(
            before,
          );
        if (!attributed) continue;
        if (!known.some((k) => k.includes(norm(m[1]!))))
          return "quotes a testimonial that is not in the knowledge base";
      }

      // A testimonial said without quotes is the same testimonial: "uma cliente me disse que
      // amou o colete" credits a customer with words nobody can show (2026-09-24). One named
      // customer and a speech verb followed by "que"; a quote right after is judged above.
      // R13.6: no invented social proof, one customer or many ("as clientes dizem que…").
      const SUBJ = String.raw`\b(?:uma|outra|essa|minha|minhas|as|muita|muitas|varias|a\s+ultima|a\s+maioria\s+das|tem)\s+(?:cliente|compradora|menina|moca|mulher|consumidora)s?\b`;
      const said = new RegExp(
        String.raw`${SUBJ}[^.!?]{0,30}?\b(?:me\s+)?(?:disse|diz|dizem|falou|fala|falam|contou|conta|contam|comentou|comenta|comentam|relatou|escreveu|mandou|elogiou|elogiam)\s+(?:\S+\s+){0,2}?que\b(?!\s*[\u201c\u201d"])|${SUBJ}\s+(?:ja\s+)?(?:amou|amaram|adorou|adoraram|adoram|aprovam|aprovaram|recomendam|recomendou|compr\w*)\b`,
      ).exec(norm(text));
      if (said) return "reports what a customer said, and no testimonial backs it";

      // A customer count is social proof too, and an invented one is the same lie as an
      // invented quote. Only the configured number passes (2026-09-24). A small count of
      // people, orders or sales is not a claim ("os seus 2 pedidos"), so those need "mil".
      const t = norm(text);
      const allowed = ctx.config.socialProof?.satisfiedCustomers;
      // The configured number passes only as "N clientes satisfeitas" — never as sales
      // velocity ("500 clientes compraram hoje"), which R13.6 forbids.
      if (
        /\bvend(?:emos|eu|eram)\b[^.!?]{0,20}?\d[\d.]*\s*(?:mil\b\s*)?(?:(?:pecas|unidades|coletes|vezes)\b|[.!?]|$)|\d[\d.]*\s*(?:mil\s+)?(?:(?:pecas|unidades|coletes)\s+)?vendid\w*|\b\d{1,3}\s*%\s+d[ao]s\s+(?:clientes|compradoras|mulheres|pessoas)|\b\d+\s+em\s+cada\s+\d+|\b\d[\d.]*\s+avaliac\w*|\bnota\s+\d|\d[.,]\d\s+estrelas|\b\d[\d.]*\s+(?:delas|dessas|destas)\b|\bmais\s+vendid\w*|\b(?:campea|lider)\w*\s+de\s+vendas|\b(?:zero|nenhuma)\s+(?:devoluc|reclamac)\w*|\b(?:clientes?|compradoras?|mulheres)\b[^.!?]{0,40}\bsendo\s+\d/.test(t)
      )
        return "states a customer count nobody configured";
      for (const m of t.matchAll(
        /(?:\b(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*(mil|milhoes?)\b)?|\b(mil|milhares|centenas|dezenas|milhoes|quinhent\w*|trezent\w*|duzent\w*))\s+(?:de\s+)?(clientes?|compradoras?|consumidoras?|mulheres|pessoas|vendas|pedidos|coletes\s+vendidos|unidades\s+vendidas)\b/g,
      )) {
        if (m[3]) return "states a customer count nobody configured";
        const scale = m[2] ? (m[2] === "mil" ? 1000 : 1_000_000) : 1;
        const value = Number(m[1]!.replace(/\./g, "")) * scale;
        const crowd = /^(clientes?|compradoras?|consumidoras?|mulheres)$/.test(m[4]!);
        const after = t.slice((m.index ?? 0) + m[0].length);
        const claim = /^\s*(?:ja\s+)?(?:compr|us|aprov|recomend|vend|amar|ador)\w*/.test(after);
        if (!crowd && value < 1000 && !claim && !/\b(?:mais\s+de|quase|cerca\s+de)\s*$|\+\s*$/.test(t.slice(0, m.index ?? 0))) continue;
        // …and with no clock or other number beside it: "satisfeitas só essa semana",
        // "hoje, mais de 500…", "…, 98% recomendam" are velocity again (third review).
        if (
          crowd &&
          value === allowed &&
          /^\s*satisfeit/.test(after) &&
          !/\b(?:hoje|ontem|agora|semana|mes|ano|compr\w*)\b|\d\s*%|\bso\s+(?:em|no|na|nesta|neste|essa|esse|esta|este)\b/.test(sentenceAt(t, m.index ?? 0))
        )
          continue;
        return "states a customer count nobody configured";
      }
      return null;
    },
  },
  {
    name: "humanity_claim",
    remedy: "rewrite",
    briefing: () =>
      `Nunca afirme ser uma pessoa. Dizer "não sou uma pessoa, sou a assistente virtual da marca" ` +
      `é a resposta certa; o proibido é o contrário — negar ser robô. E nunca diga que já ` +
      `chamou, avisou ou passou a conversa para alguém do time, nem que uma pessoa vem falar ` +
      `com ela: você não tem como fazer isso. Pode perguntar se ela quer que alguém do time a chame. ` +
      `E não anuncie o que você é: virtual, IA, robô, bot ou assistente virtual só aparece quando a ` +
      `mensagem dela pergunta o que você é. Sem a pergunta, apresente-se só pelo seu nome e pela marca.`,
    check: (text, ctx) => {
      const t = norm(text);

      // Claiming a person was called, when nobody was (prompt-specialist probes,
      // 2026-09-24; Sandra R1: "já chamei" with no handoff). The model cannot call anyone —
      // only the turn's code can, and its fixed line ("Já avisei o time…") runs with
      // `layer: "auto"`, which is why that layer is exempt: there the claim is the fact.
      // Offers stay open: "quer que eu chame alguém do time?", "posso chamar uma pessoa".
      if (ctx.layer === "agent") {
        const WHO = String.raw`(?:uma?\s+|o\s+|a\s+|nossa\s+|nosso\s+)?(?:atendente|pessoa|humano|time|equipe|colega|supervisor\w*|gerente|responsavel|alguem|suporte|atendimento)`;
        const TO = String.raw`(?:(?:pra|para|pro|ao|a)\s+)?`;
        const PERSON = String.raw`(?:uma?\s+|o\s+|a\s+|nossa\s+|nosso\s+)?(?:atendente|pessoa|humano|time|equipe|colega|supervisor\w*|gerente|responsavel|alguem)`;
        const DESK = String.raw`(?:o\s+|nosso\s+)?(?:suporte|atendimento)`;
        const claims = [
          new RegExp(String.raw`\b(?:ja\s+)?(?:chamei|avisei|acionei|transferi|encaminhei|notifiquei|passei|vou\s+(?:chamar|avisar|acionar|transferir|encaminhar|passar))\s+(?:\S+\s+){0,3}?${TO}${WHO}\b`),
          new RegExp(String.raw`\b(?:deixei|registrei)\s+(?:\S+\s+){0,3}?(?:com|pra|para|pro)\s+${WHO}\b|\b(?:elas?|eles?)\s+(?:ja\s+)?(?:te\s+(?:chamam|chama|respondem|retornam)|vao\s+te\s+(?:chamar|retornar|responder))\b`),
          new RegExp(String.raw`\b(?:estou|to|ja\s+to|ja\s+estou)\s+(?:chamando|avisando|acionando|transferindo|passando)\s+${TO}${WHO}\b`),
          new RegExp(String.raw`\b(?:deixei\s+avisad\w*|pedi\s+(?:pra|para)|vou\s+pedir\s+(?:pra|para))\s+${TO}${WHO}\b`),
          new RegExp(String.raw`\b${PERSON}(?:\s+do\s+(?:time|atendimento))?\s*,?\s+(?:ja\s+)?(?:chega|vai\s+(?:te\s+)?(?:chamar|falar|responder|atender|entrar|retornar)|te\s+(?:chama|responde|atende|retorna)|ja\s+(?:foi\s+(?:avisad|notificad|acionad)\w*|sabe|esta\s+vindo))\b`),
          // The support desk exists, and "o suporte te atende todos os dias" is what the
          // prompt teaches. Only a desk that is already on its way to her is a claim.
          new RegExp(String.raw`\b${DESK}\s+(?:ja\s+)?(?:vai\s+(?:te\s+)?(?:chamar|entrar)|ja\s+(?:foi\s+(?:avisad|notificad|acionad)\w*|sabe|esta\s+vindo))\b`),
        ];
        for (const r of claims) {
          const m = r.exec(t);
          if (!m) continue;
          const before = t.slice(Math.max(0, m.index - 40), m.index);
          // An offer or a condition is not a claim: "se quiser, alguém do time te chama".
          if (/\b(?:se\s+(?:quiser|preferir|precisar)|quer\s+que|posso|prefere\s+que)\b[^.!?]*$/.test(before)) continue;
          if (deniedJustBefore(t, m.index)) continue;
          return "claims a person was called, and nobody was";
        }
      }

      // Denying being a bot is itself the violation, so this one is read as written:
      // the negation is the offence, not an exemption.
      if (/\bnao\s+sou\s+(um\s+|uma\s+)?(rob[oa]|bot|ia|maquina)\b/.test(t))
        return "claims to be a human being";

      // The rest claim to BE a person — and "não sou uma pessoa, sou a assistente
      // virtual da marca" is the exact sentence the prompt requires when she asks.
      // Vetoing it left the agent unable to answer "você é um robô?", which is the
      // most predictable question it will ever get.
      const claims = [
        /\bsou\s+(uma\s+)?(pessoa|humana|gente)\b/g,
        /\bsou\s+(?:eu\s+)?(?:de\s+verdade|real|de\s+carne\s+e\s+osso)\b/g,
        /\beu\s+mesma\s*,?\s+(?:uma\s+)?(?:pessoa|humana|gente|de\s+verdade|real)\b/g,
      ];
      for (const pattern of claims) {
        for (const m of t.matchAll(pattern)) {
          if (!negatedAt(t, m.index ?? 0)) return "claims to be a human being";
        }
      }

      // Q10, line 2 (grafo §58): she never announces she is virtual unless her message asked what
      // she is. Read as written, negation included — "não sou uma IA" is line 1's lie anyway. "Loja
      // virtual" is the shop, not her; "não sou uma pessoa…" only exists as line 3's answer, so the
      // whole honest sentence passes asked or not. "Mensagem automática dos Correios" is the carrier.
      if (
        ctx.layer === "agent" &&
        ctx.askedIdentity === false &&
        !/\bnao\s+sou\s+(?:\S+\s+){0,3}?(?:pessoa|humana|gente)\b|\bnao\s+(?:uma\s+)?(?:pessoa|humana|gente)\b|\bnao\s+sou\s+de\s+verdade\b/.test(t) &&
        /\b(?:assistente|atendente|vendedora|consultora|agente|secretaria)\s+(?:virtual|digital|automatic[ao]|eletronic[ao]|de\s+(?:ia|inteligencia\s+artificial))\b|\binteligencia\s+artificial\b|\bsou\s+(?:uma?\s+|a\s+|o\s+)?(?:ia|robo\w*|bot|chatbot|maquina|programa|virtual)\b|\b(?:uma|um)\s+(?:ia|robo\w*|bot|chatbot)\b|\b(?:sou|aqui\s+e|isso\s+(?:aqui\s+)?e|este\s+e|esta\s+e|esse\s+e|essa\s+e)\s+(?:um\s+|uma\s+|o\s+|a\s+)?(?:atendimento|mensagem|resposta)\s+automatic[ao]\b(?!\s+d[oa]s?\s+(?:correios?|transportadora|entregador\w*|rastreio|logzz|coinzz)\b)/.test(t)
      )
        return "announces she is virtual (assistente virtual, IA, robô) when her message did not ask what she is";
      return null;
    },
  },
  {
    /**
     * Saying she did something to an order (persona round 2026-10-05, Lu: "já deixo cancelado
     * pra você"). The agent cancels, refunds and changes nothing — cancellation and returns go
     * to a person (R16.9), and a cancellation she was told happened is a package that still
     * arrives and a delivery she refuses. Only the agent's own text is read: the code's fixed
     * lines (`layer: "auto"`) say what the code did. How she cancels, an offer and a denial pass.
     */
    name: "order_action_claim",
    remedy: "rewrite",
    briefing: () =>
      `Você não cancela, não estorna e não altera pedido nenhum. Nunca diga que cancelou, que ` +
      `vai cancelar, que deixou cancelado, que estornou ou que mudou algo no pedido dela. Pode ` +
      `perguntar se ela quer que alguém do time a chame para isso.`,
    check: (text, ctx) => {
      if (ctx.layer !== "agent") return null;
      const t = norm(text);
      const claims = [
        /\b(?:cancelei|estornei|reembolsei)\b/,
        /\b(?:ja|eu)\s+(?:te\s+)?cancelo\b/,
        /\bvou\s+(?:ja\s+)?(?:te\s+)?(?:cancelar|estornar|reembolsar)\b/,
        /\b(?:deixo|deixei|ta|esta|fica|ficou|foi)\s+(?:\S+\s+){0,2}?cancelad[oa]\b/,
        /\b(?:fiz|fizemos)\s+o\s+(?:estorno|reembolso|cancelamento)\b/,
        /\b(?:alterei|mudei|troquei|atualizei|corrigi|vou\s+(?:alterar|mudar|trocar|atualizar|corrigir))\s+(?:\S+\s+){0,4}?pedido\b/,
      ];
      for (const r of claims) {
        const m = r.exec(t);
        if (!m) continue;
        const before = t.slice(Math.max(0, m.index - 40), m.index);
        if (/\b(?:se\s+(?:quiser|preferir|precisar)|quer\s+que|posso|prefere\s+que)\b[^.!?]*$/.test(before)) continue;
        if (deniedJustBefore(t, m.index)) continue;
        return "claims an action on her order the agent cannot take";
      }
      return null;
    },
  },
  {
    /**
     * The shop sells a garment, not a treatment. "Corrige a postura", "trata hérnia",
     * "indicado para pós-operatório" are medical claims about a product that has no
     * medical registration — the kind of sentence a sales model writes without being
     * asked, and the kind that turns a return into a complaint. Reporting what the
     * customer feels is still allowed; promising what the product does to her body is
     * not, which is the same line `weight_loss_claim` draws. Support while worn is a fact the site
     * publishes ("Segura a postura", `Comparison.tsx`) and the operator asked the agent to use it
     * (2026-09-29, R16.6): "ajuda na postura", "dá apoio à postura" pass; correcting it does not.
     */
    name: "health_claim",
    remedy: "rewrite",
    briefing: () =>
      `O produto é uma peça de roupa, não um tratamento. Pode dizer que, além de modelar, ele ` +
      `ajuda na postura e dá apoio enquanto está vestido. Não diga que cura, trata, corrige ou ` +
      `melhora dor, postura, coluna, hérnia, circulação, varizes ou celulite, e não o indique ` +
      `para pós-operatório nem uso médico.`,
    check: (text) => {
      const t = norm(text);
      const claims = [
        /\b(cura|curar|trata|tratar|corrige|corrigir|resolve|resolver|elimina)\s+(?:(?:a|o|as|os|sua|seu|suas|seus|de|da|do)\s+){0,3}(dor|dores|postura|hernia|coluna|circulacao|lordose|escoliose|varizes|celulite|barriga|flacidez)/g,
        /\b(pos[\s-]?operatorio|pos[\s-]?cirurgic\w*|cirurgia\s+plastica|fisioterap\w*|ortopedic\w*|medicinal|terapeutic\w*|uso\s+medico)\b/g,
        /\bmelhora\s+(?:a\s+|sua\s+)?(circulacao|postura|coluna|respiracao)\b/g,
        // The pain promise next to the posture value R16.6 allows (independent review, finding 15).
        // "Incômodo" only of the back, or on its own: "tira o incômodo da barriga marcando na roupa"
        // is the look, not the body (second review, 2026-09-29, finding 9).
        /\b(alivia\w*|acaba\s+com|tira|diminui\w*|reduz\w*|some\s+com|melhora)\s+(?:(?:a|o|as|os|sua|seu|suas|seus|essa|esse|de|da|do)\s+){0,3}(dor|dores|incomodo(?=\s*(?:[.,;:!?]|$)|\s+(?:n[ao]s?|d[ao]s?)\s+(?:costas|coluna|lombar|pernas|ombros?|pescoco|quadril)\b))\b/g,
        // The pain as the subject that goes away, and the relief as a noun (finding 9): "a dor nas
        // costas some", "a dor diminui", "dá um alívio na dor".
        /\b(?:dor|dores)\b(?:\s+(?:n[ao]s?|d[ao]s?|de|lombar|lombares)(?:\s+(?:costas|coluna|lombar|barriga|pernas|ombros?|pescoco|quadril))?)?\s+(?:(?:ja|logo|vai|vao|tambem)\s+)*(?:some|somem|sumir|sumiu|desaparece\w*|diminui\w*|passa|passam|passar|melhora\w*|alivia\w*|acaba|acabam|reduz\w*|vai\s+embora)\b/g,
        /\balivio\s+(?:(?:n[ao]s?|d[ao]s?|pra|para|de)\s+)?(?:(?:a|o|as|os|sua|seu|suas|seus)\s+)?(?:dor|dores|costas|coluna|lombar)\b/g,
      ];
      for (const pattern of claims) {
        for (const m of t.matchAll(pattern)) {
          if (!negatedAt(t, m.index ?? 0)) return "makes a medical claim about a garment";
        }
      }
      return null;
    },
  },
  {
    /**
     * Invented stock and invented deadlines. This is the single thing a sales model
     * reaches for unprompted — nobody taught it, it just knows the genre — and it is
     * the one claim the operation can never back, because nothing here counts units or
     * runs a countdown. Under Brazilian consumer law an urgency that does not exist is
     * misleading advertising, and it costs the trust the COD funnel runs on.
     */
    name: "scarcity_claim",
    remedy: "rewrite",
    briefing: (c) =>
      c.scarcity?.allowUnverified || c.scarcity?.unitsLeft != null || c.scarcity?.offerEndsAt
        ? `Urgência: não cite estoque, unidades restantes nem prazo de oferta. O aviso de estoque ` +
          `sai numa mensagem pronta, só quando ela disser que vai pensar ou deixar pra depois.`
        : `Não cite estoque acabando nem prazo de oferta: a loja não te deu número nenhum, e ` +
          `urgência inventada é publicidade enganosa.`,
    check: (text, ctx) => {
      const t = norm(text);

      // Real urgency is allowed to be said. A declared unit count lets her name that
      // number, and a declared end date lets her say the offer ends — the gate exists
      // to stop the model inventing either, not to stop the shop selling.
      const declared = ctx.config.scarcity;
      // The stock is said only when she puts the purchase off (R16.5): anywhere else a count, the
      // last units or an ending offer is refused, even the declared ones.
      if (ctx.postponing !== true) {
        // A superset of the claims below (independent review, finding 11), plus the forms the review
        // passed on the production config (finding 12). A count only when it is of stock: "resta 1 dia
        // pra devolver" and "restam 2 tamanhos" are not (finding 17).
        const NOT_STOCK = String.raw`(?!\s*(?:dias?\s+(?:pra|para)\s+(?:(?:voce|vc)\s+)?(?:devolver|trocar)|tamanhos?|cores?|opc\w*|formas?|duvidas?)\b)`;
        // "Só tenho 2 perguntas" and "só tem 1 jeito de pagar" are not stock (second review, finding
        // 6): after "só tenho/tem", and after a count in words, only a stock noun, a size, or the end
        // of the sentence makes it one ("tenho só mais 12.", "restam apenas doze unidades").
        const STOCK = String.raw`(?=\s*(?:(?:unidades?|pecas?|coletes?|cintas?|kits?|(?:em|no)\s+estoque|(?:d[oa]s?|n[oa]s?)\s+(?:tamanho\s+)?(?:p|m|g|gg|xgg)|(?:no|do)\s+tamanho|pra\s+pronta\s+entrega|disponive\w*|sobrando|restando|aqui|hoje|agora|separad\w*)\b|[.!?]|$))`;
        const WORDS = String.raw`(?:uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|qu?atorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b`;
        const anyStock =
          new RegExp(String.raw`\b(?:resta|restam|restando|sobra|sobram|sobrou|sobraram|sobrando)\s+(?:(?:so|apenas|somente)\s+)?(?:mais\s+)?(?:\d{1,4}\b${NOT_STOCK}|${WORDS}${STOCK})`).test(t) ||
          new RegExp(String.raw`\b(?:(?:so|apenas|somente)\s+(?:tem|temos|tenho)|(?:tem|temos|tenho)\s+(?:so|apenas|somente))\s+(?:mais\s+)?(?:\d{1,4}\b|${WORDS})${STOCK}`).test(t) ||
          new RegExp(String.raw`\bultim[ao]s?\s+(?:(?:\d{1,4}|${WORDS})\s+)?(?:unidades?|pecas?|coletes?|cintas?|kits?)\b`).test(t) ||
          // "Últimos dias/horas" is a deadline unless it looks back ("nos últimos dias muita gente
          // pediu", "e nos últimos dias também vale") with no offer in its sentence (finding 6).
          /(?<!\bn[oa]s\s+)\bultim[ao]s?\s+(?:dias?|horas?)\b/.test(t) ||
          sentencesIn(t).some((s) => /\bultim[ao]s?\s+(?:dias?|horas?)\b/.test(s) && /\b(?:promoc\w*|ofertas?|precos?|descontos?|condic\w*|cupom)\b/.test(s)) ||
          /\bpoucas?\s+(?:unidades?|pecas?|coletes?)\b/.test(t) ||
          /\b(?:estoque|lote|unidades|pecas)\b(?:(?!\b(?:nao|nunca)\b)[^.!?]){0,20}?\b(?:acaband\w*|esgot\w*|no\s+fim|limitad\w*|quase|baixo|voando)\b/.test(t) ||
          // The verb before the noun: "tá acabando o estoque" (finding 7).
          /\b(?:acaband\w*|esgotand\w*|no\s+fim)\s+(?:(?:o|a|os|as|nosso|nossa|do|da)\s+)?(?:estoque|lote|unidades|pecas|coletes)\b/.test(t) ||
          /\besgotad\w*\b/.test(t) ||
          /\b(?:promocao|oferta|desconto|condicao|preco)\s+(?:acaba|termina|expira|vence)\b/.test(t) ||
          // "Esse desconto é só hoje", "o preço vale só até amanhã" (finding 7).
          sentencesIn(t).some((s) => /\b(?:so|apenas|somente)\s+(?:(?:por|pra|para)\s+)?(?:hoje|amanha|essa\s+semana|este\s+fim\s+de\s+semana|ate\s+(?:hoje|amanha|meia|o\s+fim|domingo|sexta|sabado))\b/.test(s) && /\b(?:promoc\w*|ofertas?|precos?|descontos?|condic\w*|cupom|valor|kits?)\b/.test(s)) ||
          /\bvale\s+(?:so\s+|apenas\s+|somente\s+)?ate\s+(?:hoje|amanha|o\s+fim|meia)/.test(t) ||
          /\bacaba\s+em\s+\d/.test(t) ||
          /\bcorre\s+que\s+(?:acaba|vai\s+acabar)\b/.test(t) ||
          /\bvagas?\s+limitad[ao]s?\b/.test(t);
        return anyStock ? "cites stock or a deadline outside the reply to her putting the purchase off" : null;
      }
      if (declared?.allowUnverified) return null;
      const unitsLeft = declared?.unitsLeft ?? undefined;
      const endsAt = declared?.offerEndsAt ? new Date(declared.offerEndsAt) : null;
      const offerStillOpen = endsAt !== null && endsAt.getTime() > ctx.now.getTime();

      // A true claim clears ITSELF, never the sentence around it. These used to `return
      // null` for the whole gate, so "restam 12 unidades e a promoção acaba em 2 horas"
      // passed with the countdown — a real number buying a pass for an invented one.
      const unitsOk =
        unitsLeft !== undefined &&
        (() => {
          const said = [
            ...t.matchAll(/\b(?:so\s+)?(?:resta|restam|sobrou|sobraram|tem)\s+(\d{1,4})\b/g),
          ];
          return said.length > 0 && said.every((m) => Number(m[1]) === unitsLeft);
        })();
      const deadlineOk =
        offerStillOpen &&
        /\b(promocao|oferta|condicao|desconto)\s+(acaba|termina|expira|vence)\b/.test(t);

      const claims = [
        /\bso\s+(resta|restam|sobrou|sobraram|tem)\s+\d/,
        /\bultim[ao]s?\s+(unidades?|pecas?|dias?|horas?)\b/,
        /\bestoque\s+(acabando|limitado|quase|baixo)\b/,
        /\b(promocao|oferta|desconto|condicao)\s+(acaba|termina|expira|vence)\b/,
        /\bacaba\s+em\s+\d/,
        /\bcorre\s+que\s+(acaba|vai\s+acabar)\b/,
        /\bvagas?\s+limitad[ao]s?\b/,
      ];
      const UNIT_CLAIMS = new Set([0, 1, 2]); // the three that a true `unitsLeft` covers
      const DEADLINE_CLAIMS = new Set([3, 4, 5]); // and the ones a live end date covers
      for (const [i, r] of claims.entries()) {
        if (!r.test(t)) continue;
        if (unitsOk && UNIT_CLAIMS.has(i)) continue;
        if (deadlineOk && DEADLINE_CLAIMS.has(i)) continue;
        return "invents stock or a deadline nothing tracks";
      }
      return null;
    },
  },
  {
    /**
     * The warranty is a number the operation committed to, and any other number is a
     * commitment nobody made. "30 dias para devolver" and "troca quantas vezes quiser"
     * both create an obligation the shop has to honour or refuse in front of a customer
     * who was told otherwise.
     */
    name: "warranty_promise",
    remedy: "rewrite",
    briefing: (c) =>
      `A garantia é de ${c.delivery.warrantyDays} dias após o recebimento para trocar ou ` +
      `devolver, e na devolução o dinheiro volta sem custo nenhum pra ela. Nenhum outro ` +
      `prazo, e nada de "quantas vezes quiser", troca ilimitada ou garantia sem prazo.` +
      ` ${EXCHANGE_FREIGHT_LINE}` +
      (c.support?.email ? ` Para trocar ou devolver, ela escreve para ${c.support.email}.` : ``),
    check: (text, ctx) => {
      const t = norm(text);
      if (/\b(sem\s+prazo|quantas\s+vezes\s+quiser|troca\s+ilimitada|garantia\s+vitalicia|pode\s+devolver\s+quando\s+quiser)\b/.test(t))
        return "promises a warranty with no limit";
      if (claimsExchangeFree(t)) return "says the size exchange is free, and its freight is hers";

      /**
       * The delivery window's own numbers, and where they sit.
       *
       * "Entrega em 1 a 3 dias e você tem 7 dias para trocar" is the sentence the prompt
       * asks for — both halves in one breath — and it was vetoed in production: the `5`
       * of the delivery range sits inside forty characters of "trocar", so the warranty
       * gate read it as a five-day warranty and refused the agent's own script. It cost a
       * rewrite and the fallback on the turn where the customer said "quero comprar",
       * which is the most expensive turn there is.
       *
       * A warranty is never a range in this operation — it is one number — so any digit
       * that belongs to an "N a M dias" span belongs to logistics, not to this gate.
       */
      const deliverySpans = [...t.matchAll(/\d{1,2}\s*(?:a|e|ate)\s*\d{1,2}\s*dias/g)].map(
        (m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const,
      );
      const insideDeliveryWindow = (at: number): boolean =>
        deliverySpans.some(([from, to]) => at >= from && at < to);

      const accented = text.normalize("NFC").toLowerCase();
      const aligned = accented.length === t.length;
      // Not "garantir o seu / a sua / o pedido": that is securing the purchase ("vale garantir o seu
      // logo", R16.5), and read as a warranty it paired "5 dias úteis" of the prepaid deadline with it.
      // Only that object: "posso garantir 30 dias" is the warranty promise, and the bare infinitive
      // exempted it (independent review, finding 1).
      // The root is `garant`, not `garanti`: "a gente garante 30 dias" passed (second review, finding
      // 8). And securing the purchase is exempt only while no "por/com/de" gives it a count of days in
      // its clause: "posso garantir o seu colete por 30 dias" is the warranty promise.
      const SECURING = /garantir\s+(?:o\s+seu|a\s+sua|o\s+(?:seu\s+)?pedido|o\s+(?:seu\s+)?colete)\b/;
      const window = /(troc|devol|garant(?!ir\s+(?:o\s+seu|a\s+sua|o\s+(?:seu\s+)?pedido|o\s+(?:seu\s+)?colete)\b)|arrepend|reembols|estorn|dinheiro\s+de\s+volta)/;
      for (const m of t.matchAll(/(\d{1,3})\s*dias?/g)) {
        const at = m.index ?? 0;
        if (insideDeliveryWindow(at)) continue;
        const around = t.slice(Math.max(0, at - 40), at + 40);
        const clauseBefore = t.slice(Math.max(0, at - 80), at).split(/[,;:.!?\n]/).pop()!;
        const securedFor =
          SECURING.test(clauseBefore + t.slice(at, at + 80).split(/[,;:.!?\n]/)[0]!) &&
          /\b(?:por|com|de|durante)\s+(?:(?:ate|mais|uns|cerca\s+de)\s+)?$/.test(clauseBefore);
        if (!window.test(around) && !securedFor) continue;
        // The forty characters cross clauses: "7 dias de garantia, e a média do antecipado é de 5
        // dias" paired the 5 with "garantia" (2026-09-28). A number whose own clause is a path's
        // average and names no return is the delivery's, and `delivery_promise` judges it. The clause
        // runs past the number too: "na entrega em média você tem 3 dias pra trocar" names its return
        // after it (2026-09-29), up to the next "mas" or "e" (and): "a média é de 5 dias e a troca é em 7
        // dias" gives the return to the 7, not to the 5 (grafo §32). Never at "é" (is), which `norm` spells
        // the same: "em média 3 dias é o prazo pra trocar" is the 3's. The accent is read from the text
        // itself, and only while it lines up with `t` character for character; otherwise no "e" cuts.
        const rest = t.slice(at).split(/[,;.!?\n]/)[0]!;
        const and = [...rest.matchAll(/\b(?:e|mas)\b/g)].find((c) => c[0] === "mas" || (aligned && accented[at + (c.index ?? 0)] === "e"));
        const own = t.slice(0, at).split(/[,;.!?\n]/).pop()! + (and ? rest.slice(0, and.index) : rest);
        if (/\bmedia\b/.test(own) && /\b(?:antecipa\w*|adianta\w*|pix|boleto|cartao|entrega)\b/.test(own) && !window.test(own)) continue;
        // "Você recebe em até 3 dias, com 7 dias pra devolver" was read as a three-day
        // warranty (Jussara R1, Karol R2, Tati R2, 2026-09-24): the delivery deadline sat
        // within forty characters of "devolver". A number is the delivery's when a delivery
        // verb governs it through filler words only ("recebe o colete em casa em até",
        // "escolhe um dos próximos") and nothing after it, up to the clause's end, is about
        // a return or a refund — "receber em até 30 dias o seu dinheiro" stays a warranty.
        if (
          /\b(?:cheg|receb|entreg(?!ador)|escolh)\w*\s+(?:(?:o|a|seu|sua|colete|pedido|ele|em|casa|ate|dentro|de|dos?|um|uma|nos?|os|proximos?)\s+){0,5}$/.test(
            t.slice(Math.max(0, at - 60), at),
          ) &&
          !/(troc|devol|garanti|arrepend|dinheiro|de\s+volta|reembols|estorn|valor)/.test(
            t.slice(at + m[0].length).split(/[,;:.!?\n]|\b(?:e|mas)\b/)[0]!,
          ) &&
          // …nor a return window given later in the clause without the word "dias":
          // "recebe em até 3 dias e troca em 3 também".
          !/(troc|devol|garanti|arrepend|reembols|estorn)\w*\s+(?:(?:em|de|ate|por)\s+)*\d{1,3}\b(?!\s*dias?\b)/.test(
            t.slice(at + m[0].length).split(/[,;:.!?\n]/)[0]!,
          )
        )
          continue;
        if (Number(m[1]) !== ctx.config.delivery.warrantyDays)
          return `warranty of ${m[1]} days is not the configured ${ctx.config.delivery.warrantyDays}`;
      }
      return null;
    },
  },
  {
    /**
     * Freight is the difference between the two offers, and blurring it breaks whichever
     * one the customer picks. Cash on delivery charges her no freight (R$ 0,00 on the
     * Logzz offer); prepaid has it calculated by region inside the checkout. "Frete grátis"
     * is true on the first only (2026-09-28, below), and on the prepaid path it is a number
     * the carrier has not agreed to.
     */
    /**
     * This gate used to forbid "frete grátis" and now forbids denying it. The world
     * changed under it, in both offers at once: the operator zeroed the freight on the
     * delivery offer (`freight: "0.00"`) and the prepaid one always shipped free
     * nationwide (`settingsFreight: []`, checked across the 27 states). So the sentence
     * the gate was protecting the customer from became simply true.
     *
     * Which flips where the harm is. The lie is no longer "grátis" — it is any sentence
     * that puts a shipping cost on her, because she then meets a cheaper total than she
     * was told and doubts everything else she was told. Same gate, opposite direction,
     * and one flag decides: the day a freight comes back, the old refusal returns with
     * it.
     *
     * That day came: on 2026-09-10 the operator flipped the flag back. The prepaid
     * freight is the customer's again, calculated by region inside the checkout rather
     * than quoted here, which is why the prepaid path can name no freight number at all.
     * Cash on delivery did not change — the freight stays inside the R$ 129,90 collected
     * at the door. So "frete grátis" is false on both paths once more, and the gate is
     * back to forbidding it.
     *
     * And on 2026-09-22 the operator made it the standing decision: the operation does
     * not offer free shipping. Which moved the default for the ABSENT key. It used to be
     * `!== false` — absent meant free, because free was the truth when the key was born
     * and production's `BUSINESS_CONFIG` did not have it yet. Now the truth is "not
     * free", so the test is `=== true`: absent or `false` both forbid "frete grátis", and
     * only an explicit `true` in the secret brings the free branch back. `price_promise`
     * reads the flag the same way (`!== true` forbids calling the prepaid price "o total"),
     * and so does the prompt — the same promise written twice.
     *
     * On 2026-09-28 the operator split it by path: "com pagamento na entrega o frete de fato
     * é grátis", and the prepaid checkout does charge it by region. `codFreeShipping` (absent
     * = free on delivery, `!== false`) lets "frete grátis" through only in one of the whole
     * sentences `canonicalFree` lists (2026-09-29, grafo §32); the prompt teaches the first word for word.
     */
    name: "shipping_promise",
    remedy: "rewrite",
    briefing: (c) =>
      c.delivery.freeShipping === true
        ? `O frete é GRÁTIS nos dois caminhos, e isso é verdade — pode dizer, é o seu melhor ` +
          `argumento. O que você não pode é cobrar frete dela: nada de "o frete é à parte", ` +
          `"mais o frete" ou qualquer valor de entrega.`
        : c.delivery.codFreeShipping !== false
          ? `No pagamento na entrega o frete é grátis. Para dizer isso, use esta frase, com estas ` +
            `palavras, numa frase só dela ("Pagando na entrega o frete é grátis: você paga só ${money(c.prices.codBrl)} quando receber."). ` +
            `Qualquer outra frase com "grátis", "sem frete" ou "não paga frete" volta pra reescrita, ` +
            `e, na mesma mensagem, toda frase que falar do antecipado, do pix, do cartão online, do site ` +
            `diz que ali o frete é calculado no checkout ("No pix também." volta). No antecipado o ` +
            `frete é calculado por região dentro do checkout: nunca diga que é grátis e nunca cite ` +
            `valor de frete.`
          : `Nunca diga "frete grátis". No pagamento na entrega o frete já está dentro do preço; ` +
            `no antecipado ele é calculado por região dentro do checkout.`,
    check: (text, ctx) => {
      const t = norm(text);
      // Every shape of "there is no shipping cost", because each one is now true and each
      // one turns off the charge rules below. "Sem frete a mais: R$ 129,90" was reading as
      // a shipping amount purely because the denial used a word this list did not know.
      const saysFree =
        /\bfrete\b[^.!?]{0,24}\b(gratis|gratuito|zero|free|por\s+nossa\s+conta|de\s+gra[cs]a)\b/.test(t) ||
        /\b(gratis|gratuito|por\s+nossa\s+conta)\b[^.!?]{0,16}\bfrete\b/.test(t) ||
        /\bfrete\b[^.!?]{0,12}\b(nao\s+)?(custa\s+nada|e\s+zero)\b/.test(t);
      // "Sem frete", "nada de frete", "nenhum frete", "esquece o frete": the noun denied,
      // not the verb. "Não esqueça o frete" is the reminder that it exists, and stays out.
      const freightDenials = [
        ...t.matchAll(
          /\b(?:sem|nao\s+tem|nao\s+ha|zero\s+de)\s+frete\b|(?<!\bnao\s+(?:se\s+)?)\b(?:nada\s+de|nenhum|zero|livre\s+de|isent\w*\s+de|esquec\w*)\s+(?:o\s+)?frete\b/g,
        ),
      ];
      const claimsFree = saysFree || freightDenials.length > 0;

      if (ctx.config.delivery.freeShipping !== true) {
        // Cash on delivery ships free (operator, 2026-09-28; `codFreeShipping`, absent = on):
        // "pagando na entrega o frete é grátis" is true and sells, and the prepaid checkout
        // charges the freight by region, so the same words next to the prepaid offer are the
        // lie. Each free claim is judged by its whole sentence, and it passes when:
        //
        // - it is denied ("no pix não tem frete grátis", "o frete do antecipado não é
        //   grátis") — the honest prepaid answer, vetoed until 2026-09-28;
        // - or cash on delivery ships free and the sentence is one of `canonicalFree`'s, word
        //   for word (2026-09-29, grafo §32): an allow-list of whole sentences, because every
        //   attempt to prove from free text that the rest of the sentence stays at the door
        //   (§29–§31) let the next shape through. A bare "frete grátis" stays vetoed on BOTH
        //   paths. `ctx.paymentPath` cannot vouch for it: "cod" is what the turn passes when she
        //   has chosen nothing, which is also the turn where she asks "e no pix, tem frete?";
        //   the welcome, handoff and farewell calls pass "cod" always. A sentence that names the
        //   door is true on either path, as `delivery_promise` lets "na entrega você recebe em 1
        //   a 3 dias" pass on both.
        //
        // And, with `codFreeShipping: false` (the 2026-09-22 world), "nenhum frete A MAIS na porta":
        // the freight inside the price, nothing added at the door. That denial is released when
        // qualified ("a mais", "extra", "somado", "adicional" right after `frete`), its sentence
        // says nothing about the prepaid offer (not its name, pix, card, checkout, link, nor its
        // price), and it is about the door, said in so many words ("na entrega", "na porta"). While
        // the delivery ships free it is one more free claim, held to `canonicalFree` like the rest:
        // the same free-text proof let "na entrega nenhum frete a mais, e no site também" through.
        const codFree = ctx.config.delivery.codFreeShipping !== false;
        const { prepayBrl, codBrl } = ctx.config.prices;
        const kits = ctx.config.kits ?? [];
        const canonical = canonicalFree([codBrl, ...kits.filter((k) => k.path === "cod").map((k) => k.priceBrl)], ctx.paymentPath === "prepay");
        // The price she pays for the pieces of this conversation: a kit's, when the turn has one.
        const unitPrice = kits.find((k) => k.path === "cod" && k.units === ctx.units)?.priceBrl ?? codBrl;
        // Where delivery does not reach her the canonical sentence is itself a lie (`charge_promise`
        // vetoes it there), so the remedy teaches the prepaid line instead (second review, finding 3).
        const beyondCod = ctx.codUnavailable === true
          ? `promises free shipping where she only has the prepaid path: the delivery does not reach her postcode, and the prepaid checkout charges freight by region; say it as "O frete é calculado por região no checkout, antes de você pagar." and never that it is free`
          : `promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só ${money(unitPrice)} quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region`;
        // A sentence that names another payment: by its words, or by a price only the prepaid offer
        // has ("Na oferta de R$ 116,91 também.", revisão do PR #39, achado 3).
        const codPrices = [codBrl, ...kits.filter((k) => k.path === "cod").map((k) => k.priceBrl)];
        const prepaidPrices = [prepayBrl, ...kits.filter((k) => k.path === "prepay").map((k) => k.priceBrl)].filter((v) => !codPrices.includes(v));
        // Read without "não paga nada antes/adiantado" (it denies paying first: the door, said
        // otherwise) and without the agreement "isso mesmo" (not "o mesmo"): persona round
        // 2026-10-05, Jussara — "Isso mesmo, você não paga nada antes, só quando o colete chegar"
        // beside the canonical sentence was read as the free extended to the prepaid offer, twice,
        // and the conversation went to a person by cost at the moment she said yes.
        const plain = (s: string): string => s.replace(NOTHING_NOW_ALL, " ").replace(AGREEMENT, " ");
        const names = (raw: string): boolean => {
          const s = plain(raw);
          return s.search(PREPAY_NAME) !== -1 || OTHER_PAYMENT.test(s) || moneyMatches(s).some((x) => prepaidPrices.includes(x.value));
        };
        // Honest about the other payment: the free denied (`FREE_DENIED`, `BARE_FREE_DENIED`), or the
        // freight said to be charged there. Not any "não" in the sentence: "No pix também, não se
        // preocupe." denies the worry, not the free (revisão do PR #39, achado 2).
        const honest = (s: string): boolean => s.search(FREE_DENIED) !== -1 || BARE_FREE_DENIED.test(s) || FREIGHT_CHARGED.test(s);
        const claims: Array<{ at: number; end?: number }> = [];
        for (const m of t.matchAll(FREE_WORD)) {
          const at = m.index ?? 0;
          const before = t.slice(Math.max(0, at - 40), at);
          if (
            /\bfrete\b[^.!?]{0,24}$/.test(before) ||
            (/^(?:gratis|gratuit[oa]|por\s+nossa\s+conta|de\s+gra[cs]a)$/.test(m[0]) && /^[^.!?]{0,16}\bfrete\b/.test(t.slice(at + m[0].length))) ||
            (/^(?:gratis|gratuit[oa]|de\s+gra[cs]a|custa\s+nada)$/.test(m[0]) && /\bentrega\b[^.!?,]{0,12}$/.test(before))
          )
            claims.push({ at });
        }
        for (const m of t.matchAll(FREIGHT_DENIAL)) claims.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
        // Sentence boundaries once, as `sentenceAt` draws them: a long reply with hundreds of
        // claims cost one scan of its sentence per claim (990 ms at 16k characters, 2026-09-29).
        const stop = (i: number): boolean =>
          t[i] === "\n" || (/[.!?]/.test(t[i] ?? "") && (i + 1 >= t.length || /\s/.test(t[i + 1]!)));
        const starts = [0];
        for (let i = 0; i < t.length; i++) if (stop(i)) starts.push(i + 1);
        const startOf = (at: number): number => {
          let lo = 0;
          let hi = starts.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid]! <= at) lo = mid;
            else hi = mid - 1;
          }
          return starts[lo]!;
        };
        // The free word with no `frete` beside it, in a sentence that names another payment: "No pix
        // também é grátis." passed on every config (revisão do PR #39, achado 4). Not the exchange or
        // the return (`RETURN_FREE`), nor the free word denied right before it ("no pix não é grátis").
        const cut = new Map<number, string>();
        // For each sentence, the index of the last question before it that names a way to pay (another
        // one, or the delivery), or -1. A question that names none is skipped: in "E no pix? Não sai
        // grátis? Sai sim, é grátis." the pix is still what is asked.
        const lastQuestion: number[] = [];
        for (let i = 0, q = -1; i < starts.length; i++) {
          lastQuestion.push(q);
          const s = t.slice(starts[i]!, starts[i + 1]);
          if (s.trimEnd().endsWith("?") && (names(s) || s.search(COD_NAME) !== -1)) q = i;
        }
        for (const m of t.matchAll(PAYMENT_FREE)) {
          const at = m.index ?? 0;
          const start = startOf(at);
          let sentence = cut.get(start);
          if (sentence === undefined) {
            let end = start;
            while (end < t.length && !stop(end)) end++;
            sentence = t.slice(start, end);
            cut.set(start, sentence);
          }
          // Or the answer to a question that named it: "E no pix? É grátis também!", "No pix o frete
          // é à parte? Não, também é grátis." (independent review, findings 4 and 13). The question is
          // the last one before it that names a payment (`lastQuestion`), not the sentence right before ("No pix? Boa
          // pergunta. É grátis também!"), and naming the delivery in the answer frees nothing ("E no
          // pix? Também é grátis, igual na entrega."): only the canonical sentence or an honest one
          // answers it (second review, 2026-09-29, finding 2).
          const q = lastQuestion[starts.indexOf(start)]!;
          const answersOther =
            q >= 0 && names(t.slice(starts[q]!, starts[q + 1]!)) && !(codFree && canonical.test(canonicalShape(sentence))) && !honest(sentence);
          if (!names(sentence) && !answersOther) continue;
          if (RETURN_FREE.test(t.slice(start, at))) continue;
          // What is free named right after the free word, and it is not the freight: "é sem custo
          // nenhum a devolução", "é sem custo nenhum pra você gerar o código" (second review, finding 10).
          // The size exchange stays out: it is not free (R17.1).
          if (FREE_OWNED_AFTER.test(t.slice(at + m[0].length))) continue;
          if (/\b(?:nao|nunca)\s+(?:e|sai|fica|vai\s+ser|sera|esta)\s+$/.test(t.slice(Math.max(0, at - 20), at))) continue;
          claims.push({ at });
        }
        claims.sort((a, b) => a.at - b.at);
        // Keyed by the sentence's start; each sentence is cut and judged once.
        const freeOnDelivery = new Set<number>();
        const judged = new Map<number, string>();
        const denied = [...t.matchAll(FREE_DENIED)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
        let d = 0;
        for (const claim of claims) {
          while (d < denied.length && denied[d]![1] <= claim.at) d++;
          if (d < denied.length && denied[d]![0] <= claim.at) continue;
          const start = startOf(claim.at);
          if (freeOnDelivery.has(start)) continue;
          let sentence = judged.get(start);
          if (sentence === undefined) {
            let end = start;
            while (end < t.length && !stop(end)) end++;
            sentence = t.slice(start, end);
            judged.set(start, sentence);
            if (codFree && canonical.test(canonicalShape(sentence))) {
              freeOnDelivery.add(start);
              continue;
            }
          }
          if (
            !codFree &&
            claim.end !== undefined &&
            /^\s+(?:a\s+mais|extra|somado|adicional)\b/.test(t.slice(claim.end)) &&
            // The prepaid offer named by its word, its means of payment, or its price.
            !/\b(?:antecip\w*|adiantad\w*|pix|cartao|boleto|checkout|link)\b/.test(sentence) &&
            !(prepayBrl !== codBrl && moneyMatches(sentence).some((x) => x.value === prepayBrl)) &&
            /\b(?:na|da)\s+(?:porta|entrega)\b|\bentregador\b/.test(sentence)
          )
            continue;
          return codFree ? beyondCod : "promises free shipping, which neither offer has";
        }
        // The same promise by reference, which no free word carries. "O frete do pix é igual
        // ao da entrega" meant "included" until 2026-09-28 and now means "free"; either way
        // the prepaid checkout charges it. And the other sentences once a delivery claim passed
        // (2026-09-29, grafo §33): every one that names another payment (`PREPAY_NAME`,
        // `OTHER_PAYMENT`) extends the free to it — "No pix também.", "Isso também vale se você
        // pagar no pix.", "E no pix? Sim!", "Faz o pix de R$ 116,91. Frete grátis na entrega." —
        // unless it denies ("No pix não tem frete grátis") or says the freight is charged there
        // (`FREIGHT_CHARGED`, the prompt's prepaid line). A closed rule, with no word limit: the
        // six-word one let the longer extensions through. "Isso mesmo!" names no payment and passes.
        if (SAME_AS_DELIVERY.test(t)) return "says the freight is the same as on delivery, and the prepaid checkout charges it by region";
        if (freeOnDelivery.size > 0) {
          const sentence = (i: number): string => t.slice(starts[i]!, i + 1 < starts.length ? starts[i + 1]! - 1 : t.length);
          for (const [i, start] of starts.entries()) {
            if (freeOnDelivery.has(start)) continue;
            const s = sentence(i);
            // The sentence before, when it is neither the free one nor an honest one: "E antes? Também!".
            const prev = i > 0 && !freeOnDelivery.has(starts[i - 1]!) ? sentence(i - 1) : "";
            const prevOther = prev !== "" && !honest(prev) && (names(prev) || PAYISH.test(prev));
            if (!names(s) && !(ALSO.test(plain(s)) && (PAYISH.test(plain(s)) || prevOther))) continue;
            if (honest(s)) continue;
            return beyondCod;
          }
        }
        // The branch used to stop here, and stopping here dropped every charge rule
        // below with it — including the one about naming an amount. Which handed the
        // prepaid path the worst sentence available: neither offer has a citable freight
        // number (cash on delivery has it inside the price, prepaid has it computed by
        // region inside the checkout), and yet "o frete do antecipado é R$ 12,99" passed
        // every gate, because `price_promise` only checks whether a number is one of the
        // configured prices — and a configured price read as freight is still a lie.
        //
        // What is forbidden is an amount ATTRIBUTED to the freight, which is narrower
        // than an amount near the word. "São R$ 129,90 mais o frete" is the honest
        // prepaid sentence — product price, freight extra, value unnamed — and so is
        // "o frete já está dentro do preço: são R$ 129,90 na entrega". Both put a number
        // in the same clause as `frete`; neither says what the freight costs.
        //
        // And the verb has to be the freight's. "O frete não está incluído, mas o produto
        // sai R$ 12,99 mais barato" puts no number on the freight — it names the saving,
        // which `price_promise` vetoes on its own since exit A: "sai" belongs to "o produto". So a new subject with its own article
        // between `frete` and the verb ends the attribution. Only the article form counts
        // — "o frete DO produto sai R$ 15" is a complement, still the freight — and a bare
        // clause break does not either: "é à parte, mas sai R$ 15" is still the freight.
        //
        // Nor does an article that a preposition or a relative `que` owns: "o frete PARA
        // o pedido é de R$ 12,99" and "o frete, QUE o produto não inclui, sai R$ 15" keep
        // the freight as the subject of the main verb. The lookbehind is the narrowest cut
        // that tells them apart — it touches only the article, so "mas com o desconto o
        // produto sai R$ 12,99" still finds its real subject two words later.
        //
        // `antecipado` and `total` open a new subject the same way ("o frete é calculado
        // no checkout e o antecipado sai R$ 116,91"); "do antecipado" is a contraction and
        // never matches the bare article, so "o frete do antecipado custa R$ 15" stays the
        // freight's. `valor` is narrower, because "o frete tem o valor de R$ 15" is the
        // freight naming its own price: it is a new subject only right after a clause
        // break (comma, "e", "mas") and with the price verb glued to it — "o valor dele é"
        // is still the freight. The saving under any subject is `price_promise`'s veto
        // (exit A, 2026-09-22), not this gate's.
        //
        // The new subject is looked for on BOTH sides of the verb: "o frete já está
        // dentro, e o total é R$ 129,90" reaches the conjunction `e` first, and read it as
        // the freight's "é" with the amount ten characters later.
        //
        // One exception, the one the free branch below has as `claimsFree`: in a sentence whose
        // free claim passed as cash on delivery, the amount beside `frete` is the product's —
        // "pagando na entrega, levando 2 peças o frete é grátis e sai R$ 233,82". `price_promise`
        // still holds it to a delivery price, and "R$ 15 de frete" is vetoed everywhere.
        const attributedToShipping =
          [...t.matchAll(ATTRIBUTED_TO_SHIPPING)].some((m) => !freeOnDelivery.has(startOf(m.index ?? 0))) ||
          /\br\$\s*[\d.,]+\s*(reais)?\s*de\s+frete\b/.test(t);
        if (attributedToShipping) {
          return "names a shipping amount, and neither offer has a citable one";
        }
        // The saving given as a price ("o frete é à parte, e o produto sai R$ 12,99", "o
        // preço cai no antecipado PARA R$ 12,99") used to be checked here too. Since exit A
        // (2026-09-22) `price_promise` vetoes every occurrence of the saving, in both
        // `freeShipping` branches, so this gate no longer looks at it.
        return null;
      }
      // Free shipping is the fact. Saying it is fine; charging for it is the new lie.
      //
      // The charge has to be about the shipping, not merely near it: "o frete é grátis,
      // você paga só os R$ 129,90 na entrega" is the sentence this funnel most wants said,
      // and a bare "você paga" within thirty characters was enough to veto it.
      for (const m of t.matchAll(
        /\bfrete\b[^.!?,]{0,30}?\b(a\s*parte|separado|por\s+fora|nao\s+(esta\s+)?inclu\w*|calculad\w*|depende\w*|varia\w*|conforme|por\s+regiao|por\s+(sua|tua)\s+conta|por\s+conta\s+(dela|do\s+cliente|sua)|voce\s+paga|paga\s+depois|nao\s+e\s+(gratis|gratuito))\b/g,
      )) {
        // The negation sits between "frete" and the charge — "o frete NÃO é cobrado à
        // parte" is the honest answer to the question this funnel gets most. So the
        // clause check has to look at the charge, not at the word that introduced it.
        const chargeAt = (m.index ?? 0) + m[0].length - m[1]!.length;
        if (!negatedAt(t, chargeAt)) return "tells her she pays shipping, which she does not";
      }
      for (const m of t.matchAll(/\b(paga|pagar|cobra|cobrar|custa)\b[^.!?]{0,12}?\bo?\s*frete\b/g)) {
        if (!negatedAt(t, m.index ?? 0)) return "tells her she pays shipping, which she does not";
      }
      for (const m of t.matchAll(/\bmais\s+o\s+frete\b/g)) {
        if (!negatedAt(t, m.index ?? 0)) return "adds a shipping charge that does not exist";
      }
      // An amount ATTRIBUTED to shipping is a charge even without those words. Proximity
      // alone is not enough: "R$ 129,90 com frete incluído" and "por R$ 129,90 — e o frete
      // é grátis" both put a number beside the word and both are true.
      // `claimsFree` guards this: "Frete grátis, R$ 129,90 na entrega" is the exact
      // sentence the prompt now instructs, and the amount beside the word is the PRODUCT
      // price. Vetoing it would send every correct reply into the rewrite loop and out
      // the other side as a handoff.
      if (
        !claimsFree &&
        (/\bfrete\b[^.!?,]{0,12}?\br\$\s*[\d.,]+/.test(t) ||
          /\br\$\s*[\d.,]+[^.!?]{0,12}?\bde\s+frete\b/.test(t))
      ) {
        return "names a shipping amount, and shipping is free on both paths";
      }
      return null;
    },
  },
  {
    /**
     * One product, one channel. There is no second item to sell and no counter to pick
     * it up from — an order for either is an order nobody can fill, and the customer
     * finds out at the door.
     */
    name: "unavailable_offer",
    remedy: "rewrite",
    briefing: (c) =>
      `A venda é de um produto só, o Colete Cinta Modeladora, e é toda online, pelo site e ` +
      `por esta conversa, com o colete indo direto pra casa dela. Não ofereça calcinha, ` +
      `sutiã, legging, short nem qualquer outro item.` +
      (c.store?.physicalStorePlanCity
        ? ` Se ela perguntar por loja física: ainda não temos, a venda é só online, mas temos ` +
          `planos de abrir uma loja em ${c.store.physicalStorePlanCity}.`
        : ``),
    check: (text) => {
      const t = norm(text);
      if (/\b(calcinha|sutia|legging|body\b|macacao|camisola|pijama|meia\b|short\s+modelador|modelador\s+de\s+perna|cinta\s+de\s+bra[cç]o)\b/.test(t))
        return "offers a product the shop does not sell";
      // Inviting her to pick up or visit stays hard: she would travel to a store that does
      // not exist. Only a denial that governs the verb passes ("não tem como retirar").
      // Second review (2026-09-24): also a store given an address ("a loja fica no Brás",
      // "temos loja em São Paulo"), and every "vem/passa/pega aqui".
      const PLACE = String.raw`(?:loja|balcao|endereco|local|escritorio|galpao|showroom|deposito|ponto\s+de\s+retirada|aqui|la|com\s+a\s+gente|pessoalmente)`;
      for (const m of t.matchAll(
        new RegExp(
          [
            String.raw`\b(?:retir\w*|busca\w*)\b[^.!?,;:]{0,24}\b${PLACE}\b`,
            String.raw`\bpega\w*\s+(?:aqui|la|com\s+a\s+gente|no\s+nosso|na\s+nossa)\b`,
            String.raw`\bretirad\w*\s+(?:em|no|na)\b`,
            String.raw`\b(?:pode|podem|da\s+pra)\s+(?:buscar|retirar)\b`,
            String.raw`\b(?:pode|podem|da\s+pra)\s+(?:vir|ir|passar)\s+(?:(?:la|aqui|ai)\s+)?(?:e\s+|pra\s+|para\s+)?(?:buscar|retirar|pegar|provar|experimentar|conhecer|visitar)\b`,
            String.raw`\b(?:passa|passe|vem|venha)\s+(?:aqui|la)\b(?!\s+(?:seu|sua|o|a|teu|tua)\b)`,
            String.raw`\b(?:temos|tem)\s+(?:um\s+|uma\s+|nosso\s+|nossa\s+)?(?:showroom|deposito|galpao|escritorio|ponto\s+de\s+retirada)\b`,
            String.raw`\bcombin\w*\s+(?:a\s+)?retirad\w*`,
            String.raw`\b(?:venha|vem|vir|passa|passe|passar)\s+(?:(?:la|aqui|ai)\s+)?(?:e\s+)?(?:buscar|retirar|pegar|provar|experimentar|conhecer|visitar)\b`,
            String.raw`\bpode\s+(?:vir|passar)\s*(?:aqui|la)?\s*(?:[.!,]|$)`,
            String.raw`\btem\s+como\s+retirar\b`,
            String.raw`\bte\s+encontr\w*\b`,
            String.raw`\b(?:te\s+espero|vem|venha|vir|passa|passe|passar|ir)\s+(?:\S+\s+){0,2}?(?:na|no|ate\s+a|ate\s+o)\s+(?:nossa\s+|nosso\s+)?(?:loja|showroom|escritorio|galpao)\b`,
            String.raw`\bloja(?:\s+fisica)?\b[^.!?,;]{0,30}?\b(?:fica|esta|localizad\w*)\s+(?:na|no|em)\b(?!\s+(?:site|planejamento|breve|construcao|obras))`,
            String.raw`\b(?:temos|tem)\s+(?:uma\s+)?loja(?:\s+fisica)?(?:\s+sim)?,?\s+(?:em|no|na)\b`,
            String.raw`\bloja\b[^.!?]*\b(?:ja\s+)?(?:temos|tem)\s+uma\s+(?:em|no|na)\b`,
          ].join("|"),
          "g",
        ),
      )) {
        if (!deniedJustBefore(t, m.index ?? 0)) return "offers pickup at a store that does not exist";
      }
      return null;
    },
    // Mentioning a store is soft since 2026-09-24: those vetoes were almost all the honest
    // denial. Inviting her to come is `check` above, and still vetoes.
    warn: (text, ctx) => {
      const t = norm(text);
      const city = ctx.config.store?.physicalStorePlanCity;
      for (const m of t.matchAll(/\b(loja\s+fisica|nossa\s+loja|nossas\s+lojas)\b/g)) {
        const at = m.index ?? 0;
        if (deniedJustBefore(t, at)) continue;
        // The denial after the noun: "loja física ainda não temos".
        if (/^\s*(?:ainda\s+)?(?:nao|nem)\s+(?:temos|tem|existe)\b/.test(t.slice(at + m[0].length))) continue;
        if (
          city &&
          /\b(?:planos?\s+de|vamos|pretend\w*|queremos)\s+abrir\s+$/.test(t.slice(Math.max(0, at - 30), at)) &&
          sentenceAt(t, at).includes(norm(city))
        )
          continue;
        return "mentions a store that does not exist";
      }
      return null;
    },
  },
  {
    /**
     * At the door she pays once, to the courier. Installments belong to the prepaid
     * checkout, and only the checkout knows which it offers — so on the cash-on-delivery
     * path the agent has nothing to promise.
     */
    name: "installment_promise",
    remedy: "rewrite",
    briefing: (c) =>
      (maxInstallments(c) != null
        ? `No pagamento na entrega ela paga uma vez só, ao entregador — ali não tem parcelamento. ` +
          `No antecipado, no cartão pelo checkout, dá pra parcelar em até ${maxInstallments(c)}x; ` +
          `nunca mais que isso.`
        : `No pagamento na entrega ela paga uma vez só, ao entregador. Não fale em parcelar, em "3x" ` +
          `nem em dividir o valor.`) + ` E nunca diga "sem juros".`,
    /**
     * Operator, 2026-09-24: installments exist only on the prepaid card checkout, up to
     * `prepayMaxInstallments`, and "sem juros" is never said, in any wording.
     *
     * A WHITELIST, after a second review found thirteen ways a blacklist of door words let
     * "também na entrega" through. An installment passes only when all of this holds:
     * - nothing left in the message, once its refusal clauses are set aside ("na entrega
     *   não dá pra parcelar", "na entrega você paga uma vez só"), is about the door;
     * - its sentence names the prepaid path affirmatively ("no antecipado", "no cartão pelo
     *   checkout") — not "não precisa antecipar", not "antecipar não precisa";
     * - it joins no two paths ("ou") and extends to none ("também", "igual", "idem");
     * - its count is within the configured one.
     * `ctx.paymentPath` is not read: production passes "cod" on every turn.
     */
    check: (text, ctx) => {
      const t = norm(text);
      const NUM = String.raw`(\d{1,2}|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|dezoito|vinte\s+e\s+quatro|vinte)`;
      const TOKEN = new RegExp(
        String.raw`\b(\d{1,2})\s*x\b|\b(?:em\s+(?:ate\s+)?${NUM}\s+(?:vezes|parcel\w*)|${NUM}\s+parcel\w*)\b|\bparcel\w*|\bdivid\w*\s+em\s+${NUM}\b|\bdivid\w*`,
        "g",
      );
      if (
        /\bsem\s+(?:\S+\s+){0,2}?juros?\b|\b(?:livre|isent[oa]s?)\s+de\s+juros?\b|\bnao\s+(?:\S+\s+){0,2}?(?:pag|cobr|incid|tem|ha)\w*\s+(?:nenhum\s+)?juros?\b|\bjuros?\s+(?:(?:sao|e|fica\w*)\s+)?(?:zero|zerad\w*)\b|\b(?:zero|0\s*%?)\s+(?:de\s+)?juros?\b|\bnenhum\s+juros?\b/.test(t) ||
        (/\bsem\s+(?:nenhum\s+)?acrescimo\b/.test(t) && TOKEN.test(t))
      )
        return `says "sem juros", which the operation never promises`;
      TOKEN.lastIndex = 0;

      const WORDS: Record<string, number> = {
        duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
        dez: 10, onze: 11, doze: 12, dezoito: 18, vinte: 20,
      };
      const countOf = (m: RegExpMatchArray): number | undefined => {
        const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
        if (raw === undefined) return undefined;
        return /^\d+$/.test(raw) ? Number(raw) : raw.startsWith("vinte e") ? 24 : WORDS[raw];
      };
      const ONCE = /\bpag\w*\s+(?:so\s+)?(?:uma\s+vez|a\s+vista)\b|\be\s+a\s+vista\b|\buma\s+vez\s+so\b/;
      // Third review: the door is judged where the installment is, not across the whole
      // message. "…e chega em média em 5 dias" is the parcel, not how she pays; `cheg`/
      // `receb` count only when tied to paying ("paga quando chegar", "12x ao receber").
      const DOOR = new RegExp(
        String.raw`\bentreg\w*|\bmotoboy\b|\bmaquininha\b|\bpag\w*\s+depois\b|\bno\s+ato\b|\bna\s+porta\b|\bna\s+hora\b|\bpessoalmente\b|` +
          String.raw`\b(?:pag\w*|parcel\w*|cartao|credito|\d{1,2}\s*x)\b(?:\s+\S+){0,3}?\s+(?:quando|ao|no|na\s+hora\s+que)\s+(?:o\s+colete\s+)?(?:cheg|receb)\w*|` +
          String.raw`\b(?:quando|ao|no)\s+(?:o\s+colete\s+)?(?:cheg|receb)\w*(?:\s+\S+){0,3}?\s+(?:pag\w*|parcel\w*|cartao|credito|\d{1,2}\s*x)\b`,
      );
      const EXTEND = /\b(?:tambem|igual|idem|mesmo\s+jeito|tanto|qualquer|ambos|ambas|nos\s+dois|nas\s+duas|aceit\w*|credito)\b/;
      const affirmed: Array<{ count: number | undefined; segment: string; sentence: string }> = [];
      const extended: string[] = [];
      // `sentencesIn`, not a split on every dot: "R$ 129.90" cut "antecipado" off from its
      // installments and vetoed a true sentence (code ladder review, 2026-09-24).
      for (const raw of sentencesIn(t)) {
        // A bare question ("Quer parcelar?") promises nothing. One with a count or a door
        // in it does: "sabia que dá pra parcelar em 12x na entrega?".
        const question =
          raw.trim().endsWith("?") &&
          !DOOR.test(raw) &&
          [...raw.matchAll(TOKEN)].every((m) => countOf(m) === undefined);
        const sentence = question ? "" : raw;
        if (!sentence) continue;
        const keptSentence: string[] = [];
        for (const segment of sentence.split(/;|\b(?:mas|porem)\b|,?\s*\be\s+(?=(?:no|na|pagando|quem)\b)/)) {
          const kept: string[] = [];
          const found: Array<number | undefined> = [];
          for (const clause of segment.split(/[,:]/)) {
            const tokens = [...clause.matchAll(TOKEN)];
            const live = tokens.filter((m) => !deniedJustBefore(clause, m.index ?? 0));
            if (live.length === 0 && (tokens.length > 0 || ONCE.test(clause))) continue; // a refusal
            kept.push(clause);
            for (const m of live) found.push(countOf(m));
          }
          keptSentence.push(...kept);
          // The door is read on the whole segment, refusal clause included: "na entrega
          // você paga uma vez só, em 12x no cartão" is one promise, not a refusal plus one.
          for (const count of found) affirmed.push({ count, segment, sentence: "" });
          if (EXTEND.test(kept.join(" , "))) extended.push(segment);
        }
        for (const a of affirmed) if (a.sentence === "") a.sentence = keptSentence.join(" , ");
      }
      if (affirmed.length === 0) return null;

      const max = maxInstallments(ctx.config);
      for (const { segment } of affirmed)
        if (DOOR.test(segment)) return "promises installments on the cash-on-delivery path";
      for (const segment of extended)
        if (DOOR.test(segment) || /\b(?:tambem|igual|idem|mesmo\s+jeito|tanto|qualquer|ambos|ambas|nos\s+dois|nas\s+duas)\b/.test(segment))
          return "extends installments beyond the prepaid card checkout";
      if (max == null) return "promises installments, and none are configured";
      const PREPAY =
        /(?<!\b(?:nao|sem|nem)\s+(?:\S+\s+){0,2})\b(?:antecip\w*|adiantad\w*|pagar\s+antes|pagamento\s+antes)\b(?!\s+(?:nao|nem)\b)|\bcartao\b[^.!?]{0,24}\bcheckout\b|\bcheckout\b[^.!?]{0,24}\bcartao\b/;
      for (const { count, segment, sentence } of affirmed) {
        if (/\bou\b/.test(segment)) return "joins two payment paths around an installment";
        if (!PREPAY.test(sentence)) return "promises installments without tying them to the prepaid checkout";
        if (count !== undefined && count > max) return `promises ${count} installments, above the configured ${max}`;
      }
      return null;
    },
  },
  {
    name: "business_hours",
    remedy: "defer",
    check: (_t, ctx) => {
      if (ctx.layer === "auto") return null; // layer 1 runs 24/7 by decision R4.4
      const { openHour, closeHour } = ctx.config.hours;
      const h = hourIn(ctx.now, ctx.config.hours.timeZone ?? BUSINESS_TZ);
      return h >= openHour && h < closeHour
        ? null
        : `agent reply outside the ${openHour}:00-${closeHour}:00 window`;
    },
  },
  {
    name: "pacing",
    remedy: "defer",
    check: (_t, ctx) => {
      const p = ctx.pacing;
      if (!p) return null;
      if (p.sentLastHour >= p.hourlyLimit) return "hourly send limit reached";
      if (p.sentToday >= p.dailyLimit) return "daily send limit reached";
      return null;
    },
  },
  {
    name: "identical_template",
    remedy: "rewrite",
    briefing: () =>
      `Não repita ao pé da letra uma mensagem que você já mandou nesta conversa.`,
    // Soft since 2026-09-24: a repeated line costs nothing that a veto into the canned
    // fallback does not cost more.
    warn: (text, ctx) =>
      (ctx.recentOutbound ?? []).includes(text.trim())
        ? "identical text already sent recently"
        : null,
  },
  {
    /**
     * The ambiguity that costs a sale without ever being a lie.
     *
     * The operator caught it in a live transcript: "para o tamanho G, a entrega fica na
     * janela de 3 a 5 dias e o frete é grátis. Você prefere pagar R$ 129,90 na entrega ou
     * antecipar por R$ 110,41?" Every clause there is true. Read as a whole it says the
     * window applies to both, and it does not — the two paths have different windows.
     *
     * She either asks again, which is the agent's failure, or she does not and expects
     * the wrong date, which is the refusal at the door. So when a message puts BOTH paths
     * in front of her, any delivery window in it has to say which one it belongs to.
     * A message about a single path needs no label; the ambiguity only exists in the
     * comparison.
     */
    name: "unattributed_window",
    remedy: "rewrite",
    briefing: () =>
      `Comparando as duas formas de pagamento, ou você dá o prazo DAS DUAS, cada um ` +
      `colado na sua opção, ou não dá prazo nenhum. Prazo em uma só ela lê como valendo ` +
      `para as duas — e os prazos são diferentes.`,
    // Soft since 2026-09-24: every window in it is still judged by `delivery_promise`;
    // this one only asks for a label, and its vetoes ended in the canned fallback.
    warn: (text) => {
      const t = norm(text);
      const bothPaths =
        /\b(na\s+entrega|pagamento\s+na\s+entrega)\b/.test(t) &&
        /\b(antecipa\w*|adianta\w*|pagar\s+antes)\b/.test(t);
      if (!bothPaths) return null;

      // A window is any way of naming when it arrives, not only "N a M dias". The block
      // the prompt itself teaches — "você escolhe um dos próximos 3 dias" — is a deadline
      // in every sense that matters to her, and reading only the range form meant the
      // gate demanded a label from the prepaid side while giving the delivery side a pass.
      const WINDOW =
        /(\d{1,2})\s*(?:a|e|ate)\s*(\d{1,2})\s*dias|proximos?\s+\d{1,2}\s*dias|em\s+ate\s+\d{1,2}\s*dias|media\s+(?:de\s+)?\d{1,2}\s*dias/;
      // Sentence by sentence, and never a character past the boundary. A window read
      // with a fixed lookahead borrows the label from the NEXT block — which is how a
      // message with a deadline on one side only first passed this gate.
      const sentences = t.split(/[.!?\n]+/).filter((x) => WINDOW.test(x));
      if (sentences.length === 0) return null;

      // "Agendada" is not a label: it is our word, not hers, and the message that failed
      // in production opened with "a entrega é agendada para 3 a 5 dias" before offering
      // both — which she reads as applying to both.
      const labelled = { cod: false, prepay: false };
      for (const sentence of sentences) {
        const isCod = /\bna\s+entrega\b/.test(sentence);
        const isPrepay = /\b(antecipa\w*|adianta\w*|pagar\s+antes)\b/.test(sentence);
        if (!isCod && !isPrepay) {
          return "states a delivery window while offering both paths, without saying which";
        }
        if (isCod) labelled.cod = true;
        if (isPrepay) labelled.prepay = true;
      }
      // And a deadline given for one path only is the same ambiguity wearing a label:
      // she compares two blocks, one has a date and the other does not, and fills the
      // gap with the number she just read.
      if (!labelled.cod || !labelled.prepay) {
        return "gives a delivery window for one path while offering both, leaving the other blank";
      }
      return null;
    },
  },
  {
    /**
     * This gate had the wrong half of the problem, and the operator caught it in a
     * transcript: it forbade NAMING a size before the region was checked, so a customer
     * who asked "uso 42, qual o meu?" got a request for her postcode instead of an
     * answer. That reads as a form, not as a person.
     *
     * Which size fits her and whether it reaches her are two different questions. The
     * first is the published table — deterministic, ours, and the honest answer to what
     * she just asked. The second is the region, and only the second needs checking.
     *
     * So the veto moved to where the risk actually is: claiming the size is AVAILABLE,
     * in stock, or on its way to her, before anything answered that. Saying "o seu é o
     * G" is a fitting. Saying "o G tá disponível pra você" is a promise.
     */
    name: "unverified_size",
    remedy: "rewrite",
    briefing: () =>
      `Indicar o tamanho pela tabela é livre e é o que ela quer ouvir — responda na hora. ` +
      `O que você não pode antes de conferir o CEP dela é dizer que TEM, que está ` +
      `disponível, reservado ou a caminho.`,
    check: (text, ctx) => {
      if (ctx.sizeChecked !== undefined) return null;
      // "Você tem 7 dias pra trocar de tamanho": that "tem" takes the days, not the size — the
      // warranty is not stock (2026-09-28). Only the count and the return verb go.
      const t = norm(text).replace(/\b(?:tem|tera)\s+(?:ate\s+)?\w+\s+(?:dias?|semanas?)\s+(?:(?:corridos|uteis)\s+)?(?:pra|para)\s+(?:troc|devolv)\w*/g, " ");
      // "tem no seu tamanho", "o G está disponível", "temos o GG em estoque",
      // "já reservei o M", "o seu tamanho chega em", "tava guardando seu M" (persona round
      // 2026-10-05, Karol). Never the fitting itself, nor "guarda essa dica".
      const CLAIMS_STOCK =
        /\b(tem|temos|tenho|ha|disponivel|disponiveis|em\s+estoque|reserv\w+|garantid\w+|separei|separad\w+|guardand\w*|guardei|guardad\w+)\b[^.!?]{0,28}\b(tamanho|p|m|g|gg|xgg)\b/;
      const STOCK_AFTER =
        /\b(tamanho|p|m|g|gg|xgg)\b[^.!?]{0,28}\b(disponivel|em\s+estoque|reservad\w+|garantid\w+|separad\w+|guardad\w+|ta\s+ai|chega\s+(hoje|amanha))\b/;
      for (const re of [CLAIMS_STOCK, STOCK_AFTER]) {
        const m = re.exec(t);
        if (m && !negatedAt(t, m.index)) {
          return "claims the size is in stock or on its way before any check answered";
        }
      }
      return null;
    },
  },
  {
    /**
     * Persona round 3 (2026-09-24, Cleide): the region lookup had failed — the Coinzz
     * endpoint began answering with a redirect to its home page — and the agent said
     * "Chega sim aí em Manaus" and sent the cash-on-delivery link. Nothing had checked.
     * With no answer for her postcode, whether delivery reaches her is unknown, and the
     * checkout is where it gets confirmed when she types the CEP.
     *
     * What stays allowed is the honest shape: a condition or a check ("o checkout confirma
     * se chega aí", "deixa eu ver se entrega no seu CEP") and a denial. The exemption is
     * read in the claim's own comma-bounded phrase, so "não se preocupe, chega sim aí"
     * is still the claim.
     */
    name: "coverage_claim",
    remedy: "rewrite",
    briefing: () =>
      `Enquanto a região dela não foi consultada, nunca afirme que a entrega alcança a cidade ` +
      `ou o CEP dela: diga que o checkout confirma isso quando ela digitar o CEP.`,
    check: (text, ctx) => {
      if (ctx.regionKnown !== false) return null;
      const t = norm(text);
      // Exempt: a condition or denial ATTACHED right before the claim ("se chega aí",
      // "quando chega aí", "não sei se chega aí"); the checkout named BEFORE the claim in
      // its own phrase ("o checkout confirma a entrega no seu CEP"); and "entrega" as a
      // NOUN — after an article or a preposition ("a entrega aqui é agendada", "o dia da
      // entrega lá mesmo"). Code review, 2026-09-24, three times: the first version vetoed
      // six honest lines (two vetoes on the link turn send the fallback without the link);
      // the second let "Quando você fizer o pedido chega sim aí" through; the third let
      // "digitar o CEP no checkout e chega aí" and "Pelo checkout chega sim aí" through.
      // So the phrase is also cut at " e " and " que " — a new clause starts there — and a
      // claim with "sim" in it is an affirmation the checkout rule never excuses.
      const exempt = (at: number, claim: string): boolean => {
        const before =
          ((t.slice(0, at).split(/[:;.!?\n]/).pop() ?? "").split(PHRASE_COMMA).pop() ?? "").split(/\s(?:e|que)\s/).pop() ??
          "";
        if (/\b(se|nao|nem|quando)\s+$/.test(before)) return true;
        if (/\bsim\b/.test(claim)) return false;
        return (
          /\b(checkout|confirma\w*|digita\w*|ve|mostra\w*)\b/.test(before) ||
          /\b(a|o|da|do|de|na|no|pela|pelo|sua|para|pra|com)\s+$/.test(before)
        );
      };
      const VERB = String.raw`(?:chega|chegam|chegamos|entrega|entregamos|entregam|atende|atendemos)`;
      const CLAIMS = [
        /\b(?:chega|chegam|chegamos)\s+sim\b/g,
        /\b(?:chega|chegam|chegamos|entrega|entregamos|entregam)\s+(?:sim\s+)?(?:ai|aqui|la)(?:\s+sim)?\b/g,
        /\b(?:atende|atendemos)\s+(?:sim\s+)?(?:ai|la)(?:\s+sim)?\b/g,
        new RegExp(String.raw`\b${VERB}\b[^.!?\n]{0,25}\b(?:seu|teu|esse|nesse|desse)\s+cep\b`, "g"),
        new RegExp(String.raw`\b${VERB}\s+(?:sim\s+)?(?:na|pra|para|em)\s+sua\s+(?:cidade|regiao)\b`, "g"),
      ];
      for (const re of CLAIMS) {
        for (const m of t.matchAll(re)) {
          if (!exempt(m.index ?? 0, m[0])) return "affirms delivery reaches her before the region lookup answered";
        }
      }
      // "chega em Manaus": a capitalised place right after the verb, read on the original
      // text because `norm` lowercases it. A weekday is not a place ("atende Segunda a
      // Sábado"), and neither is "Até".
      const NOT_A_PLACE = String.raw`(?!(?:At[eé]|Segunda|Ter[cç]a|Quarta|Quinta|Sexta|S[aá]bado|Domingo)(?:\s|$|[,.!?-]))`;
      for (const m of text.matchAll(
        new RegExp(
          String.raw`\b(?:[Cc]hega|[Cc]hegam|[Cc]hegamos|[Ee]ntrega|[Ee]ntregamos|[Aa]tende|[Aa]tendemos)\s+(?:sim\s+)?(?:em|no|na|pra|para)\s+(?:tod[oa]\s+(?:o\s+|a\s+)?)?${NOT_A_PLACE}[A-ZÀ-Ú][a-zà-ú]+` +
            String.raw`|\b[Aa]tend(?:e|emos)\s+${NOT_A_PLACE}[A-ZÀ-Ú][a-zà-ú]+`,
          "g",
        ),
      )) {
        // `norm` keeps the length (it strips combining marks from NFD, and the source is
        // NFC), so the index carries over — but read the phrase on the normalised prefix.
        const prefix = norm(text.slice(0, m.index));
        if (!exempt(prefix.length, norm(m[0]))) return "affirms delivery reaches her city before the region lookup answered";
      }
      return null;
    },
  },
];

export interface GateResult {
  allowed: boolean;
  traces: GateTrace[];
}

/**
 * Runs the whole chain and returns every verdict, not just the first block —
 * the trace is what makes a refused message explainable afterwards.
 */
export const runGates = (text: string, ctx: GateContext): GateResult => {
  const traces: GateTrace[] = [];
  let allowed = true;

  for (const gate of gates) {
    const reason = gate.check?.(text, ctx) ?? null;
    const soft = reason === null ? (gate.warn?.(text, ctx) ?? null) : null;
    if (reason !== null) {
      traces.push({ gate: gate.name, verdict: "block", detail: reason });
      allowed = false;
    } else if (soft !== null) {
      traces.push({ gate: gate.name, verdict: "warn", detail: soft });
    } else {
      traces.push({ gate: gate.name, verdict: "pass" });
    }
  }
  return { allowed, traces };
};

export const gateNames = gates.map((g) => g.name);

/**
 * Every content rule, in the agent's own language, ready to go into the system prompt.
 * This is the whole point of `briefing`: the chain stops being a wall the agent finds by
 * walking into it, and becomes the brief it writes against.
 *
 * Order follows the chain, so the rules that cost money when broken — what the shop
 * charges, what it promises — arrive first, where a model reading a long prompt still
 * weighs them.
 */
export const gateBriefing = (config: GateConfig): string[] =>
  gates
    .filter((g) => g.remedy === "rewrite")
    .map((g) => g.briefing?.(config))
    .filter((line): line is string => Boolean(line));

/** The remedy each gate carries, by name. */
export const gateRemedies: Readonly<Record<string, Remedy>> = Object.freeze(
  Object.fromEntries(gates.map((g) => [g.name, g.remedy])),
);

/**
 * Precedence when more than one gate blocks. `stop` wins over everything: rewriting a
 * price would produce a correct message sent to someone who asked never to hear from
 * us again.
 *
 * Between the other two, **`rewrite` outranks `defer`**, and the order matters more
 * than it looks. `defer` is not a harsher verdict, it is a later one — the message is
 * fine, the clock is not. Ranking it above `rewrite` meant a reply written at 3am with
 * a wrong price got stored unfixed, re-gated at dawn, blocked again by the same price
 * and silently canceled: no message, no handoff, nobody told. Fixing the content first
 * and deferring the corrected text is the only order that ends with something sendable.
 */
const SEVERITY: Record<Remedy, number> = { defer: 0, rewrite: 1, stop: 2 };

/**
 * What to do about a gate result: null when nothing blocked, otherwise the strictest
 * remedy among the gates that did. This is the whole decision — the caller rewrites,
 * schedules or stops, and never has to know which gate fired to choose.
 */
export const remedyFor = (result: GateResult): Remedy | null =>
  result.traces
    .filter((t) => t.verdict === "block")
    .map((t) => gateRemedies[t.gate])
    .filter((r): r is Remedy => r !== undefined)
    .reduce<Remedy | null>(
      (worst, r) => (worst === null || SEVERITY[r] > SEVERITY[worst] ? r : worst),
      null,
    );
