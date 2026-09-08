/**
 * Only the slice of the business config the gates actually read. Declared here, and
 * not imported, so this file has zero imports and runs byte-identical in Deno (the
 * Edge Function) and in vitest — one source of truth, no copy to drift.
 * `BusinessConfig` satisfies it structurally.
 */
export interface GateConfig {
  prices: { codBrl: number; prepayBrl: number; anchorBrl: number; prepayDiscountPercent: number };
  delivery: { codDaysMin: number; codDaysMax: number; warrantyDays: number };
  hours: { openHour: number; closeHour: number; timeZone?: string };
  coupon: { percent: number; active: boolean };
  cod: { physicalOnDeliveryActive: boolean };
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
 * Every amount in the text, with where it sits. Two shapes, because customers and the
 * agent use both: "R$ 129,90" and the bare "129,90 reais". The second used to be
 * invisible, so "custa 200 reais" — a number the operation does not have — passed the
 * price gate untouched.
 */
const moneyMatches = (text: string): Array<{ value: number; at: number }> =>
  [...text.matchAll(/r\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)|\b([\d.]+,\d{2}|\d+)\s*reais\b/gi)].map(
    (m) => ({
      value: Number((m[1] ?? m[2]!).replace(/\./g, "").replace(",", ".")),
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
 * She asked for a person (§Q12). This is the third door into handoff, and the only
 * one she opens herself — the other two (a veto the rewrites could not fix, and the
 * cost ceiling) are the system giving up. It is deliberately narrower than a search
 * for "pessoa" or "atendente": "tem uma pessoa que usa e amou" is not a request, and
 * a false positive here silences a sale the agent was closing.
 */
export const wantsHuman = (text: string): boolean => {
  const t = norm(text);
  const art = "(?:(?:o|a|os|as|um|uma)\\s+)?";
  // The trailing guard is the whole difference between a request and a topic:
  // "falar com uma pessoa QUE já comprou" is another customer she wants to hear
  // about, not an attendant she wants to reach.
  const who =
    "(?:pessoa|humano|humana|atendente|gerente|vendedor[ae]?|suporte|alguem)(?!\\s+que\\b)";

  // Refusing a bot IS asking for a person, and it starts with "nao" — so it is
  // settled before the negation guard below, which would otherwise swallow it.
  if (
    new RegExp(
      `\\bnao\\s+(quero|queria)\\s+(falar|conversar)\\s+com\\s+${art}(rob[oa]|bot|ia|maquina|atendimento\\s+automatico)\\b`,
    ).test(t)
  ) {
    return true;
  }

  // "não quero falar com uma pessoa agora, prefiro resolver aqui" is a refusal, and
  // handoff is irreversible: reading it backwards ends the conversation she wanted.
  if (new RegExp(`\\bnao\\s+(quero|queria|gostaria\\s+de)\\s+(falar|conversar)\\s+com\\s+${art}${who}`).test(t)) {
    return false;
  }

  const asks = [
    new RegExp(`\\b(quero|queria|posso|pode|gostaria\\s+de)\\s+(falar|conversar)\\s+com\\s+${art}${who}\\b`),
    new RegExp(`\\bfalar\\s+com\\s+${art}${who}\\s+(de\\s+verdade|real)\\b`),
    new RegExp(`\\bme\\s+(passa|passe|transfere|transfira)\\s+(pra|para)\\s+${art}${who}\\b`),
    new RegExp(`\\b(tem|existe|ha)\\s+(algum\\s+|alguma\\s+)?${who}\\s+(ai|disponivel|dispon[ií]vel|pra\\s+falar|para\\s+falar)\\b`),
    /\b(atendimento|suporte)\s+humano\b/,
  ];
  return asks.some((r) => r.test(t));
};

interface Gate {
  name: string;
  remedy: Remedy;
  /** Returns a reason to block, or null to pass. */
  check: (text: string, ctx: GateContext) => string | null;
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
    check: (text, ctx) => {
      const { codBrl, prepayBrl, anchorBrl, prepayDiscountPercent } = ctx.config.prices;
      const allowedPrices = new Set([codBrl, prepayBrl, anchorBrl, +(codBrl - prepayBrl).toFixed(2)]);
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
    check: (text, ctx) => {
      const t = norm(text);
      const { codDaysMin, codDaysMax } = ctx.config.delivery;

      // Refusing the impossible date is the job: "não consigo entregar amanhã, a
      // entrega leva de 3 a 5 dias" is the right answer to the most common question
      // in this funnel, and it used to be vetoed for containing the words it denies.
      if (ctx.stage !== "logistics") {
        for (const m of t.matchAll(
          /(chega|entrega|recebe|receber).{0,24}(amanha|hoje|24\s*h|no\s+mesmo\s+dia)/g,
        )) {
          if (!negatedAt(t, m.index ?? 0)) return "promises same-day or next-day delivery";
        }
      }

      // Any "N a M dias" claim has to sit inside the configured window.
      for (const m of t.matchAll(/(\d{1,2})\s*(?:a|e|ate)\s*(\d{1,2})\s*dias/g)) {
        const min = Number(m[1]);
        const max = Number(m[2]);
        if (ctx.paymentPath === "cod" && (min < codDaysMin || max > codDaysMax))
          return `delivery window ${min}-${max} days contradicts the configured ${codDaysMin}-${codDaysMax}`;
      }
      // Prepaid freight varies by region: a firm window there is a promise we cannot keep.
      if (ctx.paymentPath === "prepay" && /\d{1,2}\s*(?:a|e|ate)\s*\d{1,2}\s*dias/.test(t))
        return "states a firm delivery window on the prepaid path, where freight varies by region";
      return null;
    },
  },
  {
    name: "invented_testimonial",
    remedy: "rewrite",
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
    check: (text) => {
      const t = norm(text);
      const claims = [
        /\b(cura|curar|trata|tratar|corrige|corrigir|resolve|resolver|elimina)\s+(?:a\s+|o\s+|as\s+|os\s+|sua\s+|seu\s+|de\s+)?(dor|dores|postura|hernia|coluna|circulacao|lordose|escoliose|varizes|celulite)/g,
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
    check: (text) => {
      const t = norm(text);
      const claims = [
        /\bso\s+(resta|restam|sobrou|sobraram|tem)\s+\d/,
        /\bultim[ao]s?\s+(unidades?|pecas?|dias?|horas?)\b/,
        /\bestoque\s+(acabando|limitado|quase|baixo)\b/,
        /\b(promocao|oferta|desconto|condicao)\s+(acaba|termina|expira|vence)\b/,
        /\bacaba\s+em\s+\d/,
        /\bcorre\s+que\s+(acaba|vai\s+acabar)\b/,
        /\bvagas?\s+limitad[ao]s?\b/,
      ];
      return claims.some((r) => r.test(t)) ? "invents stock or a deadline nothing tracks" : null;
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
    check: (text, ctx) => {
      const t = norm(text);
      if (/\b(sem\s+prazo|quantas\s+vezes\s+quiser|troca\s+ilimitada|garantia\s+vitalicia|pode\s+devolver\s+quando\s+quiser)\b/.test(t))
        return "promises a warranty with no limit";
      const window = /(troc|devolv|garanti|arrepend)/;
      for (const m of t.matchAll(/(\d{1,3})\s*dias?/g)) {
        const at = m.index ?? 0;
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
    name: "shipping_promise",
    remedy: "rewrite",
    check: (text) => {
      const t = norm(text);
      return /\bfrete\b[^.!?]{0,24}\b(gratis|gratuito|zero|free|por\s+nossa\s+conta|de\s+gra[cs]a)\b/.test(t) ||
        /\b(gratis|gratuito|por\s+nossa\s+conta)\b[^.!?]{0,16}\bfrete\b/.test(t)
        ? "promises free shipping, which neither offer has"
        : null;
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
    check: (text, ctx) =>
      (ctx.recentOutbound ?? []).includes(text.trim())
        ? "identical text already sent recently"
        : null,
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
