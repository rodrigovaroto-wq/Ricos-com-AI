/**
 * Only the slice of the business config the gates actually read. Declared here, and
 * not imported, so this file has zero imports and runs byte-identical in Deno (the
 * Edge Function) and in vitest — one source of truth, no copy to drift.
 * `BusinessConfig` satisfies it structurally.
 */
export interface GateConfig {
  prices: { codBrl: number; prepayBrl: number; anchorBrl: number; prepayDiscountPercent: number };
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
     * OPTIONAL, and absent means free. That is not laziness, it is the shape of this
     * deployment: production reads the whole config from a `BUSINESS_CONFIG` secret that
     * overrides the fallback wholesale, so a key added in code is simply missing there
     * until someone edits the secret. Required-and-missing read as `false`, which quietly
     * reinstated the old veto in production while every test here passed. The default has
     * to be the truth, and today the truth is free.
     */
    freeShipping?: boolean;
  };
  hours: { openHour: number; closeHour: number; timeZone?: string };
  coupon: { percent: number; active: boolean };
  cod: { physicalOnDeliveryActive: boolean };
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

export type Verdict = "pass" | "block";

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
  /**
   * The checkout returned a same-day modality for her postcode ("Express — receba hoje
   * em até 4 horas"). Only then is "hoje" a fact rather than the broken promise that
   * produces a refusal at the door.
   */
  sameDayWindow?: boolean;
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

export const hourIn = (at: Date, timeZone: string): number =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(at),
  );

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
  return /\bsem\b(?:\s+\S+){0,2}\s*$/.test(clause.split(",").pop() ?? "");
};

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

interface Gate {
  name: string;
  remedy: Remedy;
  /** Returns a reason to block, or null to pass. */
  check: (text: string, ctx: GateContext) => string | null;
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
      `${money(c.prices.prepayBrl)} antecipado, ${money(c.prices.anchorBrl)} de preço cheio, e a ` +
      `diferença entre eles. Nenhum outro número em reais. Os únicos descontos são ` +
      `${c.prices.prepayDiscountPercent}% no antecipado e 40% (o já publicado no site)` +
      `${c.coupon.active ? `, mais ${c.coupon.percent}% do cupom` : ``}. E não prometa desconto ` +
      `sem número: "eu tiro um pouquinho", "faço um precinho", "dou um jeito no valor" ` +
      `comprometem a loja com um preço que ninguém definiu. Recusar um número que ela pediu é ` +
      `permitido, e é o seu trabalho.`,
    check: (text, ctx) => {
      const { codBrl, prepayBrl, anchorBrl, prepayDiscountPercent } = ctx.config.prices;
      // The saving is a citable amount only while there IS one. With the prepaid discount
      // at zero (2026-09-09) the difference is R$ 0,00, and letting that into the set
      // would license "sai por zero reais" — the one sentence a price gate exists for.
      const saving = +(codBrl - prepayBrl).toFixed(2);
      const allowedPrices = new Set([codBrl, prepayBrl, anchorBrl, ...(saving > 0 ? [saving] : [])]);
      const t = norm(text);

      // Saying a number the operation does not have is a promise; refusing it is the
      // job. "Me dá 30% que eu fecho agora" is the most ordinary message in a COD
      // funnel, and the answer to it — "não consigo oferecer 30% de desconto" — used
      // to be vetoed, burning two rewrites and ending in a handoff for a turn the
      // agent had already got right.
      for (const m of moneyMatches(t)) {
        if (allowedPrices.has(m.value) || negatedAt(t, m.at)) continue;
        return `price ${m.value} is not one of the configured values`;
      }

      const allowedPercents = new Set([
        prepayDiscountPercent,
        40, // anchor discount already published on the site
        ...(ctx.config.coupon.active ? [ctx.config.coupon.percent] : []),
      ]);
      // A concession with no number is still a concession. "Eu tiro um pouquinho",
      // "faço um precinho", "dou um jeito no valor" commit the shop to a price nobody
      // set, and the number gate never sees them because there is no number to see.
      for (const m of t.matchAll(
        /\b(tiro|abato|baixo|diminuo)\b[^.!?]{0,20}\b(um\s+pouc\w+|mais|pra\s+voce)\b|\bfa[cç]o\s+um\s+pre[cç]\w+|\bdou\s+um\s+jeit\w+|\bmelhoro\s+(?:o\s+)?(?:pre[cç]o|valor)|\bdeixo\s+mais\s+barato/g,
      )) {
        if (!negatedAt(t, m.index ?? 0)) return "promises a discount with no number behind it";
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
      `e nunca "chega amanhã", "hoje" ou "no mesmo dia" antes de o pedido existir — quem escolhe ` +
      `o dia é ela, no checkout. Duas exceções: se a consulta devolveu a modalidade Express ` +
      `para o CEP dela, "hoje, em até 4 horas" é fato e é o seu melhor argumento; e você ` +
      `sempre pode CONTAR que o Express existe, desde que mande ela conferir a ` +
      `disponibilidade da região dela no checkout. No antecipado` +
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
      for (const m of t.matchAll(/(\d{1,2})\s*dias?\s*ute[il]s?/g)) {
        const at = m.index ?? 0;
        const sentence =
          t.slice(0, at).split(/[.!?\n]/).pop()! + t.slice(at).split(/[.!?\n]/)[0]!;
        // A number inside "N a M dias úteis" is the range, already judged above.
        if (/\d\s*(?:a|e|ate)\s*\d{1,2}\s*dias?\s*ute/.test(sentence)) continue;
        if (avg == null) return "states a prepaid deadline, and none is configured";
        if (Number(m[1]) !== avg) {
          return `prepaid average of ${m[1]} days is not the configured ${avg}`;
        }
        if (!/\b(media|varia\w*|depende\w*|em\s+torno|cerca\s+de|aproximad\w*)\b/.test(sentence)) {
          return "states the prepaid average as a fixed deadline, without saying it varies";
        }
      }

      // Same-day is a promise until the checkout says otherwise. When the availability
      // query came back with an Express window for HER postcode, it is a fact the
      // courier already agreed to — and the strongest sentence this funnel owns.
      if (ctx.stage !== "logistics") {
        for (const m of t.matchAll(
          /(chega|entrega|recebe|receber).{0,24}(amanha|hoje|24\s*h|no\s+mesmo\s+dia)/g,
        )) {
          if (negatedAt(t, m.index ?? 0)) continue;
          const sameDay = /hoje|no\s+mesmo\s+dia/.test(m[2] ?? "");
          if (sameDay && (ctx.sameDayWindow || defersToCheckout(t))) continue;
          return "promises same-day or next-day delivery";
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
        const named: "cod" | "prepay" | null = /\b(antecipa\w*|adianta\w*)\b/.test(sentence)
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
    briefing: () =>
      `Só cite depoimento entre aspas se ele estiver na lista de depoimentos reais que você ` +
      `recebeu. Sem essa lista, não atribua fala nenhuma a cliente nenhuma.`,
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
      return null;
    },
  },
  {
    name: "humanity_claim",
    remedy: "rewrite",
    briefing: () =>
      `Nunca afirme ser uma pessoa. Dizer "não sou uma pessoa, sou a assistente virtual da marca" ` +
      `é a resposta certa; o proibido é o contrário — negar ser robô.`,
    check: (text) => {
      const t = norm(text);

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
      `A garantia é de ${c.delivery.warrantyDays} dias para trocar ou devolver. Nenhum outro ` +
      `prazo, e nada de "quantas vezes quiser", troca ilimitada ou garantia sem prazo.`,
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

      const window = /(troc|devolv|garanti|arrepend)/;
      for (const m of t.matchAll(/(\d{1,3})\s*dias?/g)) {
        const at = m.index ?? 0;
        if (insideDeliveryWindow(at)) continue;
        const around = t.slice(Math.max(0, at - 40), at + 40);
        if (!window.test(around)) continue;
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
     * and one flag decides: set `freeShipping` false the day a freight comes back and
     * the old refusal returns with it.
     */
    name: "shipping_promise",
    remedy: "rewrite",
    briefing: (c) =>
      c.delivery.freeShipping !== false
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
      const claimsFree =
        /\bfrete\b[^.!?]{0,24}\b(gratis|gratuito|zero|free|por\s+nossa\s+conta|de\s+gra[cs]a)\b/.test(t) ||
        /\b(gratis|gratuito|por\s+nossa\s+conta)\b[^.!?]{0,16}\bfrete\b/.test(t) ||
        /\b(sem|nao\s+tem|nao\s+ha|zero\s+de)\s+frete\b/.test(t) ||
        /\bfrete\b[^.!?]{0,12}\b(nao\s+)?(custa\s+nada|e\s+zero)\b/.test(t);

      if (ctx.config.delivery.freeShipping === false) {
        return claimsFree ? "promises free shipping, which neither offer has" : null;
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
    briefing: () =>
      `A loja vende um produto só, o Colete Cinta Modeladora, e só por aqui. Não ofereça ` +
      `calcinha, sutiã, legging, short nem qualquer outro item, e não existe loja física nem ` +
      `retirada no balcão.`,
    check: (text) => {
      const t = norm(text);
      if (/\b(calcinha|sutia|legging|body\b|macacao|camisola|pijama|meia\b|short\s+modelador|modelador\s+de\s+perna|cinta\s+de\s+bra[cç]o)\b/.test(t))
        return "offers a product the shop does not sell";
      if (/\b(loja\s+fisica|nossa\s+loja|nossas\s+lojas)\b/.test(t) ||
        /\b(retirar|retirada|buscar)\b[^.!?]{0,24}\b(loja|balcao|endereco|local)\b/.test(t))
        return "offers pickup at a store that does not exist";
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
    briefing: () =>
      `No pagamento na entrega ela paga uma vez só, ao entregador. Não fale em parcelar, em "3x" ` +
      `nem em dividir o valor.`,
    check: (text, ctx) => {
      if (ctx.paymentPath !== "cod") return null;
      const t = norm(text);
      return /\b(\d{1,2}\s*x\b|parcel\w*|dividir\s+em\s+\d|em\s+ate\s+\d{1,2}\s*vezes)/.test(t)
        ? "promises installments on the cash-on-delivery path"
        : null;
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
    check: (text, ctx) =>
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
    check: (text) => {
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
    const reason = gate.check(text, ctx);
    if (reason === null) {
      traces.push({ gate: gate.name, verdict: "pass" });
    } else {
      traces.push({ gate: gate.name, verdict: "block", detail: reason });
      allowed = false;
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
