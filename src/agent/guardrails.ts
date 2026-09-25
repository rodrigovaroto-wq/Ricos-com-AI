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
     * it free (`=== true`), in every gate and in the prompt alike.
     */
    freeShipping?: boolean;
    /**
     * Whether a same-day modality ("Express", "hoje em até 4 horas") really exists. It is
     * up in no region as of 2026-09-24, so absent reads as off: the briefing never
     * mentions it and the gate refuses same-day and Express, whatever the region query said.
     */
    expressActive?: boolean;
  };
  hours: { openHour: number; closeHour: number; timeZone?: string };
  coupon: { percent: number; active: boolean };
  cod: { physicalOnDeliveryActive: boolean };
  /** Where she writes to exchange or return. Absent, the briefing names no address. */
  support?: { email?: string };
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
/** An amount the sentence gives as the freight's own. Compiled once; see `shipping_promise`. */
const ATTRIBUTED_TO_SHIPPING = new RegExp(
  `\\bfrete\\b(?:${NOT_NEW_SUBJECT}[^.!?]){0,40}?\\b(e|fica|custa|sai|sera|vai\\s+dar|de|em\\s+torno\\s+de|cerca\\s+de|uns|aproximadamente)\\b(?:${NOT_NEW_SUBJECT}[^.!?]){0,12}?\\br\\$\\s*[\\d.,]+`,
);

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
    /(para|pare|parem|pode\s+parar)\s+de\s+(me\s+)?(mandar|enviar|encher)/,
    /nao\s+me\s+(mande|manda|envie|envia)\s+mais/,
    /me\s+(tira|tire|remove|remova|exclui|exclua|apaga|apague)\s+d\w{0,4}\s+lista/,
    /(descadastrar|desinscrever|sair\s+da\s+lista)/,
    /\bnao\s+tenho\s+interesse\b.*\bnao\s+me\s+(chame|procure)\b/,
  ];
  if (explicit.some((r) => r.test(t))) return "explicit";

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

/** The one place money is written for a human to read inside this file. */
const money = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;
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
      c.cod.physicalOnDeliveryActive
        ? `Ela paga só quando o colete chegar na mão dela, ao entregador — isso está ligado na loja e você pode dizer.`
        : `NÃO diga que ela paga na entrega: o pagamento na entrega está DESLIGADO na loja agora.`,
    check: (text, ctx) => {
      const t = norm(text);
      const promisesDoorPayment =
        /(paga|pagar|pagamento)\s+(so\s+)?(na|no\s+momento\s+da)\s+entrega/.test(t) ||
        /nao\s+paga\s+nada\s+agora/.test(t) ||
        /paga\s+(direto\s+)?(pro|para\s+o)\s+entregador/.test(t);
      return promisesDoorPayment && !ctx.config.cod.physicalOnDeliveryActive
        ? "promises payment at the door while `Físico na entrega` is off"
        : null;
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
        const N = "(\\d|um|uma|dois|duas|tres|quatro|cinco)";
        const NOT_COUNT = "(?!\\s*(?:ou\\s+\\d+\\s+)?(?:x|vezes|dias?|horas?|parcelas?|uteis|cart\\w*|sem\\s+juros|no\\s+cartao)\\b)";
        const counts: Array<{ at: number; units: number }> = [];
        const add = (re: RegExp) => {
          for (const u of sentence.matchAll(re)) {
            const w = u.slice(1).find((x) => x !== undefined)!;
            counts.push({ at: u.index ?? 0, units: UNIT_WORDS[w] ?? Number(w) });
          }
        };
        add(
          new RegExp(
            `\\b${N}\\s+(?:pecas?|unidades?|coletes?)\\b|\\bkits?\\s+de\\s+${N}\\b|\\b(?:o|a|os|as)\\s+de\\s+${N}\\b${NOT_COUNT}|\\be\\s+${N}\\s+(?:por|sai\\w*|saem|fica\\w*|custa\\w*)\\b`,
            "g",
          ),
        );
        // Changing her mind inside a kit conversation (fifth review): "as duas", "levando 3".
        add(new RegExp(`\\b(?:as|os)\\s+(duas|dois|tres)\\b|\\blev\\w*\\s+(?:so\\s+)?${N}\\b${NOT_COUNT}`, "g"));
        if (counts.length > 0) add(new RegExp(`\\bem\\s+${N}\\b${NOT_COUNT}`, "g"));
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
        ? `O cupom de ${c.coupon.percent}% está ativo e você pode citá-lo.`
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
      const DAY_WORDS: Record<string, number> = {
        dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
        oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
      };
      const DELIVERY_TALK = /\b(?:prazo|cheg\w*|entreg\w*|receb\w*|lev[ae]\w*|demor\w*|envi\w*|despach\w*|post\w*)\b/;
      const PREPAY_WORD = /\b(?:antecipa\w*|adianta\w*)\b/;
      for (const m of t.matchAll(
        /\b(\d{1,2}(?:[.,]\d{1,2})?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s*dias?\b/g,
      )) {
        const at = m.index ?? 0;
        const before = t.slice(Math.max(0, at - 30), at);
        const after = t.slice(at + m[0].length, at + m[0].length + 80);
        // The end of a range ("1 a 3 dias") is the range check's to judge.
        if (/\d\s*(?:a|e|ate)\s*$/.test(before)) continue;
        const sentence =
          t.slice(0, at).split(/[.!?\n]/).pop()! + t.slice(at).split(/[.!?\n]/)[0]!;
        const days = DAY_WORDS[m[1]!] ?? Number(m[1]!.replace(",", "."));
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
          // Never stripped when the count is that verb's own time complement: "quando o colete
          // chegar em 7 dias" is a deadline (eighth review).
          const anchor =
            /\b(?:(?:apos|depois\s+d[eo]|depois\s+que|a\s+partir\s+d[eo](?:\s+quando)?|contad[oa]s?\s+d[eo]|de\s+quando|quando)\s+(?:(?:o\s+colete|o|voce|ele|a\s+senhora)\s+)?(?:receb|cheg)\w*|(?:apos|depois\s+d[ae]|a\s+partir\s+d[ae])\s+(?:a\s+)?entrega)(?![\s,]*(?:(?:em|ate|so)\s*)*$)/g;
          // After the count the anchor can end the sentence ("…pra devolver a partir da entrega.").
          const anchorAfter =
            /\b(?:(?:apos|depois\s+d[eo]|depois\s+que|a\s+partir\s+d[eo](?:\s+quando)?|contad[oa]s?\s+d[eo]|de\s+quando|quando)\s+(?:(?:o\s+colete|o|voce|ele|a\s+senhora)\s+)?(?:receb|cheg)\w*|(?:apos|depois\s+d[ae]|a\s+partir\s+d[ae])\s+(?:a\s+)?entrega)/g;
          const DELIVERY = /\b(?:cheg\w*|receb\w*|entreg\w*|lev[ae]\w*|demor\w*|envi\w*|despach\w*|sai\w*)\b/;
          const RET = /\b(?:garantia|troc\w*|devol\w*|arrepend\w*)\b/;
          // A new clause opens at punctuation or at "e/mas" + a new subject; never at "é"
          // ("a garantia é de 7 dias" normalizes "é" to "e").
          const CL = /[,;:.!?\n]|\s(?:e|mas)\s+(?=(?:voce|ela|eu|a|o|no|na|se|tem)\b)/;
          // Two delivery-looking words that are not delivery (loop review, 2026-09-25): getting
          // her money back ("e recebe seu dinheiro de volta") and asking the CEP to look the
          // delivery up ("me passa seu CEP pra eu ver a entrega aí"). Both came from Malu's own
          // honest warranty lines on the prepaid path, vetoed into rewrites.
          const notDelivery = (x: string) =>
            x
              .replace(/\breceb\w*\s+(?:(?:o|a|seu|sua)\s+){0,2}(?:dinheiro(?:\s+de\s+volta)?|reembols\w*|estorno)\b/g, " ")
              // Only as the purpose of asking the CEP or address (second review: "dá pra ver
              // a entrega em casa nesse tempo" is a deadline).
              .replace(/\b(?:cep|endereco)\b[^.!?]{0,20}?\b(?:ver|conferir|checar|consultar|calcular)\s+(?:como\s+fica\s+)?(?:a\s+)?entrega\b(?![^.!?]*\b(?:cheg\w*|leva\w*|demor\w*|dias?|tempo|prazo)\b)/g, " ");
          const sentenceBefore = t.slice(0, at).split(/[.!?\n]/).pop()!.replace(anchor, " ");
          const clause = notDelivery(sentenceBefore.split(CL).pop()! + t.slice(at).split(CL)[0]!.replace(anchorAfter, " "));
          const rest = notDelivery(t.slice(at + m[0].length).split(/[.!?\n]/)[0]!.replace(anchorAfter, " "));
          const segment = sentenceBefore.split(/[,;]/).pop()!;
          const purposeAfter =
            /^\s*(?:corridos|uteis)?[\s,]*(?:(?:pra|para)\s+(?:trocar|devolver|troca|devolu\w*|se\s+arrepender)|de\s+(?:garantia|arrependimento|prazo\s+(?:pra|para)\s+(?:troca|devol)))/.test(rest);
          // The return word in the 7's own comma segment ("pode devolver em até 7 dias", after
          // "se não gostar do que chegou,"), or earlier in a sentence that never talks delivery.
          const returnBefore =
            (RET.test(segment) && !DELIVERY.test(segment)) ||
            (RET.test(sentenceBefore) && !DELIVERY.test(sentenceBefore) && /\b(?:tem|tera|sao|de|fica)\s*$/.test(segment));
          if (!DELIVERY.test(clause) && !DELIVERY.test(rest) && (purposeAfter || returnBefore)) continue;
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
        const CLAUSE = /[,;:.!?\n]|\s(?:e|mas)\s/;
        const clause = t.slice(0, at).split(CLAUSE).pop()! + t.slice(at).split(CLAUSE)[0]!;
        // A prepaid path named before the count, by any of its names — the same names the
        // range check reads (third review: "No pix chega em 2 dias" passed on the delivery
        // path). "Cartão" only with its own preposition: "dinheiro ou cartão" is the door.
        const prepaidNamedBefore =
          /\b(?:pix|boleto|transferencia|online|a\s+vista|pelo\s+link|pag\w*\s+(?:antes|agora|adiantado|hoje|ja)|(?:no|pelo|com|via)\s+(?:cartao|credito|debito)|link\s+de\s+pagamento)\b/.test(
            sentence.slice(0, sentence.length - t.slice(at).split(/[.!?\n]/)[0]!.length),
          );
        // On the prepaid path a sentence that names no path is about the prepaid delivery
        // only when its own clause talks delivery ("você recebe em até 3 dias").
        const prepaid =
          PREPAY_WORD.test(sentence) ||
          prepaidNamedBefore ||
          (ctx.paymentPath === "prepay" && !/\bna\s+entrega\b/.test(sentence) && DELIVERY_TALK.test(clause));
        const averageShaped =
          /\b(?:media|torno|cerca|aproximad\w*)\s+(?:de\s+)?$/.test(before) || /^\s*uteis\b/.test(after);
        if (!prepaid && !(averageShaped && DELIVERY_TALK.test(sentence))) continue;
        if (avg == null) return "states a prepaid deadline, and none is configured";
        if (Number(days) !== avg) {
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
      for (const m of t.matchAll(/(\d{1,2})\s*(?:a|e|ate)\s*(\d{1,2})\s*dias/g)) {
        const at = m.index ?? 0;
        const sentence =
          t.slice(0, at).split(/[.!?\n]/).pop()! + t.slice(at).split(/[.!?\n]/)[0]!;
        // When the sentence names BOTH paths, the range belongs to the one named closest
        // before it (M-01, persona round 4, Cleide: "no pagamento na entrega você recebe em
        // 1 a 3 dias, no antecipado o prazo varia…" was judged as prepay and vetoed three
        // times → fallback) — but ONLY when the prepaid path gets its own window in the
        // sentence (varia / média / região) and nothing equates or extends one path to the
        // other. Second review, 2026-09-24: proximity alone let "no antecipado ou na entrega,
        // chega em 1 a 3 dias" and "na entrega é 1 a 3 dias; no antecipado também" through —
        // invented prepaid deadlines. Otherwise the old rule: any prepaid mention → prepaid.
        const PREPAY = /\b(antecipa\w*|adianta\w*)\b/;
        const prepayOwnWindow = /\b(?:antecipa\w*|adianta\w*)\b[^.!?\n]{0,40}\b(?:varia\w*|media|regiao)\b/.test(sentence);
        // Any equating word in the sentence still counts, with one exemption (code review,
        // 2026-09-24: "na entrega você também escolhe o dia e recebe em 1 a 3 dias, no
        // antecipado o prazo varia por região" fell to the fallback): a "também escolhe /
        // agenda / marca" before any mention of the prepaid path, in a clause that
        // says "na entrega" and brings in no second option. Second review, twice: wider exemptions let "…, e pagando antes
        // também chega em 1 a 3 dias" and "na entrega ou no boleto, chega em 1 a 3 dias"
        // through — "ou", "igual", "mesmo" next to "na entrega" always tie in another path.
        const EQ =
          "(?:ou|tambem|igual\\w*|mesm\\w*|idem|que\\s+nem|tanto|quanto|como|mais\\s+rapido|em\\s+relacao|nao\\s+muda|sem\\s+esperar|nao\\s+precisa\\s+esperar|todo\\s+mundo|tod[oa]s?|toda\\s+cliente|qualquer|independente|os\\s+dois|as\\s+duas|ambos)";
        // Every name for the prepaid path, for proximity: "pagando antes" or "no Pix" after
        // "na entrega" is the prepaid range, not the delivery one (second review).
        const PREPAY_NAME =
          /\b(?:antecipa\w*|adianta\w*|pag\w*\s+(?:antes|agora)|antes|pix|cartao|credito|debito|boleto|transferencia|online|link|a\s+vista)\b/g;
        const firstPrepay = sentence.search(PREPAY);
        // The exemption holds only when the sentence ends at the prepaid window — nothing
        // but punctuation after "no antecipado o prazo varia por região, em média 5 dias
        // úteis" (an allowlist: 6th round found "…, nada muda" past a word blocklist). Anything else there ("…e chega junto", "…e no depósito 2 a 3 dias") was
        // blocked by the "também" alone before, and would slip through (second review, 5th
        // round: listing more words did not converge).
        const endsAtPrepayWindow =
          firstPrepay !== -1 &&
          /^[\s.,;:!?]*$/.test(
            sentence
              .slice(firstPrepay)
              .replace(PREPAY, "")
              .replace(/,?\s*em\s+media\s+\d+\s+dias(?:\s+uteis)?/g, "")
              .replace(/\bo\s+prazo\b|\bvaria\w*|\bpor\s+regiao\b/g, ""),
          );
        const equated = [...sentence.matchAll(new RegExp(`\\b${EQ}\\b`, "g"))].some((e) => {
          const eAt = e.index ?? 0;
          const clause =
            sentence.slice(0, eAt).split(/[,;:]/).pop()! + sentence.slice(eAt).split(/[,;:]/)[0]!;
          const exempt =
            e[0] === "tambem" &&
            /^tambem\s+(?:escolh|agend|marc)\w*/.test(sentence.slice(eAt)) &&
            endsAtPrepayWindow &&
            !/\b(?:e|ou)\b/.test(sentence.slice(0, eAt).split(/[,;:]/).pop()!) &&
            firstPrepay !== -1 &&
            eAt < firstPrepay &&
            /\bna\s+entrega\b/.test(clause) &&
            !/\b(?:e|ou)\s+(?:na|no|pagando|pelo|pela|de|a|o)\b|\boutr[oa]s?\b|\bopcao\b|\bforma\b|\bjeito\b|\bantes\b|\bpix\b|\bcartao\b|\bboleto\b|\bdois\b|\bduas\b|\bambos\b/.test(
              clause,
            );
          return !exempt;
        });
        const head = t.slice(0, at).split(/[.!?\n]/).pop()!;
        const lastAt = (re: RegExp): number => Math.max(-1, ...[...head.matchAll(re)].map((x) => x.index ?? -1));
        const prepayAt = lastAt(PREPAY_NAME);
        const codAt = lastAt(/\bna\s+entrega\b/g);
        // M-06: proximity gives the range to the delivery only when what follows it, to the
        // end of the sentence, is at most the prepaid window. Without "também" it still let
        // "…na entrega são 1 a 3 dias, e no depósito 2 a 3 dias" and "…, no antecipado varia
        // por região, nada muda" through — a prepaid name off the list, or a tie at the end.
        // Same allowlist as `endsAtPrepayWindow`, plus the connectives that open that clause.
        // Second review: "dias úteis" after the range, "pagamento antecipado", "já" /
        // "enquanto" opening the clause and "conforme / de acordo com / depende da região"
        // are the same window in the model's own words, and vetoing them cost honest turns.
        // M-07: the same rule on both sides of the range, and the prepaid mention must carry
        // its own window ("varia / depende / conforme / em média") — "…1 a 3 dias e no
        // pagamento antecipado." reads as "the same range there". Before the range it is
        // the stretch from the first prepaid mention to "na entrega": "No antecipado varia
        // por região, e no pix e na entrega, 1 a 3 dias" shares the range with the Pix.
        const onlyPrepayWindow = (s: string): boolean => {
          if (!PREPAY.test(s)) return /^[\s.,;:!?()]*$/.test(s.replace(/^\s+uteis\b/, ""));
          if (!/\b(?:varia\w*|depende\w*|conforme|de\s+acordo|media)\b/.test(s)) return false;
          return /^[\s.,;:!?()]*$/.test(
            s
              .replace(/^\s+uteis\b/, "")
              .replace(PREPAY, "")
              // Every average shape the number rule below accepts — its number is checked
              // there, so the window here only has to be a window.
              .replace(/,?\s*(?:em\s+)?(?:media|torno|cerca|aproximadamente)\s+(?:de\s+)?\d{1,2}(?:[.,]\d)?\s*dias?(?:\s+uteis)?/g, "")
              .replace(/\b(?:conforme|de\s+acordo\s+com|depende)\s+(?:d?[aeo]\s+)?(?:(?:sua|seu)\s+)?(?:regiao|cep)\b/g, "")
              .replace(/\bo\s+prazo\b|\bvaria\w*(?:\s+bastante)?|\bpor\s+regiao\b|\b(?:e|mas|no|pagando|pagamento|ja|enquanto)\b/g, ""),
          );
        };
        const tailIsPrepayWindow = onlyPrepayWindow(t.slice(at + m[0].length).split(/[.!?\n]/)[0]!);
        const headPrepay = head.search(PREPAY);
        const headIsPrepayWindow = headPrepay === -1 || onlyPrepayWindow(head.slice(headPrepay, codAt));
        const byProximity =
          PREPAY.test(sentence) && prepayOwnWindow && !equated && tailIsPrepayWindow && headIsPrepayWindow;
        const named: "cod" | "prepay" | null =
          byProximity && codAt > prepayAt
            ? "cod"
            : PREPAY.test(sentence)
              ? "prepay"
              : /\bna\s+entrega\b/.test(sentence)
                ? "cod"
                : null;
        const path = named ?? ctx.paymentPath;
        const [min_, max_] =
          path === "cod"
            ? [codDaysMin, codDaysMax]
            : [ctx.config.delivery.prepayDaysMin, ctx.config.delivery.prepayDaysMax];

        const min = Number(m[1]);
        const max = Number(m[2]);
        if (min_ == null || max_ == null)
          return `states a range on the ${path} path, which has an average and not a range`;
        if (min < min_ || max > max_)
          return `delivery window ${min}-${max} days contradicts the configured ${min_}-${max_} on ${path}`;
      }
      return null;
    },
  },
  {
    name: "invented_testimonial",
    remedy: "rewrite",
    briefing: (c) =>
      `Só cite depoimento entre aspas se ele estiver na lista de depoimentos reais que você ` +
      `recebeu. Sem essa lista, não atribua fala nenhuma a cliente nenhuma. Você pode indicar ` +
      `os depoimentos no nosso site, na seção de depoimentos. ` +
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
      `com ela: você não tem como fazer isso. Pode perguntar se ela quer que alguém do time a chame.`,
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
        /\bsou\s+(uma\s+)?(pessoa|humana|gente\s+de\s+verdade)\b/g,
        /\bpode\s+ficar\s+tranquila,?\s+sou\s+de\s+verdade\b/g,
      ];
      for (const pattern of claims) {
        for (const m of t.matchAll(pattern)) {
          if (!negatedAt(t, m.index ?? 0)) return "claims to be a human being";
        }
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
     * not, which is the same line `weight_loss_claim` draws.
     */
    name: "health_claim",
    remedy: "rewrite",
    briefing: () =>
      `O produto é uma peça de roupa, não um tratamento. Não diga que cura, trata, corrige ou ` +
      `melhora dor, postura, coluna, hérnia, circulação, varizes ou celulite, e não o indique ` +
      `para pós-operatório nem uso médico.`,
    check: (text) => {
      const t = norm(text);
      const claims = [
        /\b(cura|curar|trata|tratar|corrige|corrigir|resolve|resolver|elimina)\s+(?:(?:a|o|as|os|sua|seu|suas|seus|de|da|do)\s+){0,3}(dor|dores|postura|hernia|coluna|circulacao|lordose|escoliose|varizes|celulite|barriga|flacidez)/g,
        /\b(pos[\s-]?operatorio|pos[\s-]?cirurgic\w*|cirurgia\s+plastica|fisioterap\w*|ortopedic\w*|medicinal|terapeutic\w*|uso\s+medico)\b/g,
        /\bmelhora\s+(?:a\s+|sua\s+)?(circulacao|postura|coluna|respiracao)\b/g,
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
        ? `Urgência: use só o que a loja te deu, no bloco de urgência acima. Não invente contagem ` +
          `regressiva em minutos nem número de unidades diferente do declarado.`
        : `Não cite estoque acabando nem prazo de oferta: a loja não te deu número nenhum, e ` +
          `urgência inventada é publicidade enganosa.`,
    check: (text, ctx) => {
      const t = norm(text);

      // Real urgency is allowed to be said. A declared unit count lets her name that
      // number, and a declared end date lets her say the offer ends — the gate exists
      // to stop the model inventing either, not to stop the shop selling.
      const declared = ctx.config.scarcity;
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
      (c.support?.email ? ` Para trocar ou devolver, ela escreve para ${c.support.email}.` : ``),
    check: (text, ctx) => {
      const t = norm(text);
      if (/\b(sem\s+prazo|quantas\s+vezes\s+quiser|troca\s+ilimitada|garantia\s+vitalicia|pode\s+devolver\s+quando\s+quiser)\b/.test(t))
        return "promises a warranty with no limit";

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

      const window = /(troc|devol|garanti|arrepend|reembols|estorn|dinheiro\s+de\s+volta)/;
      for (const m of t.matchAll(/(\d{1,3})\s*dias?/g)) {
        const at = m.index ?? 0;
        if (insideDeliveryWindow(at)) continue;
        const around = t.slice(Math.max(0, at - 40), at + 40);
        if (!window.test(around)) continue;
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
     * one the customer picks. Cash on delivery has it included in the price; prepaid has
     * it calculated by region inside the checkout. "Frete grátis" is true in neither, and
     * on the prepaid path it is a number the carrier has not agreed to.
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
     */
    name: "shipping_promise",
    remedy: "rewrite",
    briefing: (c) =>
      c.delivery.freeShipping === true
        ? `O frete é GRÁTIS nos dois caminhos, e isso é verdade — pode dizer, é o seu melhor ` +
          `argumento. O que você não pode é cobrar frete dela: nada de "o frete é à parte", ` +
          `"mais o frete" ou qualquer valor de entrega.`
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
        // "Nenhum frete A MAIS na porta" is the truth about cash on delivery — the freight
        // is inside the R$ 129,90, nothing is added at the door — and the prompt tells her
        // to say it. On the prepaid path it is the lie: the freight is added in the
        // checkout. So a denial is released only when it is qualified ("a mais", "extra",
        // "somado", "adicional" right after `frete`), its sentence says nothing about the
        // prepaid offer (not its name, pix, card, checkout, link, nor its price), and it
        // is about the door, said in so many words ("na entrega", "na porta").
        // A bare "nenhum frete" stays a promise of free shipping.
        const onlyCodExtraDenied = freightDenials.every((m) => {
          const end = (m.index ?? 0) + m[0].length;
          if (!/^\s+(?:a\s+mais|extra|somado|adicional)\b/.test(t.slice(end))) return false;
          const sentence = sentenceAt(t, m.index ?? 0);
          // The prepaid offer named by its word, its means of payment, or its price.
          if (/\b(?:antecip\w*|adiantad\w*|pix|cartao|boleto|checkout|link)\b/.test(sentence)) return false;
          const { prepayBrl, codBrl } = ctx.config.prices;
          if (prepayBrl !== codBrl && moneyMatches(sentence).some((x) => x.value === prepayBrl)) return false;
          // The sentence itself has to be about the door. `ctx.paymentPath` cannot vouch
          // for it: production passes "cod" on every turn, prepaid conversations included.
          return /\b(?:na|da)\s+(?:porta|entrega)\b|\bentregador\b/.test(sentence);
        });
        if (saysFree || !onlyCodExtraDenied) return "promises free shipping, which neither offer has";
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
        const attributedToShipping =
          ATTRIBUTED_TO_SHIPPING.test(t) || /\br\$\s*[\d.,]+\s*(reais)?\s*de\s+frete\b/.test(t);
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
      const t = norm(text);
      // "tem no seu tamanho", "o G está disponível", "temos o GG em estoque",
      // "já reservei o M", "o seu tamanho chega em". Never the fitting itself.
      const CLAIMS_STOCK =
        /\b(tem|temos|tenho|ha|disponivel|disponiveis|em\s+estoque|reserv\w+|garantid\w+|separei|separad\w+)\b[^.!?]{0,28}\b(tamanho|p|m|g|gg|xgg)\b/;
      const STOCK_AFTER =
        /\b(tamanho|p|m|g|gg|xgg)\b[^.!?]{0,28}\b(disponivel|em\s+estoque|reservad\w+|garantid\w+|separad\w+|ta\s+ai|chega\s+(hoje|amanha))\b/;
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
