/**
 * Only the slice of the business config the gates actually read. Declared here, and
 * not imported, so this file has zero imports and runs byte-identical in Deno (the
 * Edge Function) and in vitest — one source of truth, no copy to drift.
 * `BusinessConfig` satisfies it structurally.
 */
export interface GateConfig {
  prices: { codBrl: number; prepayBrl: number; anchorBrl: number; prepayDiscountPercent: number };
  delivery: { codDaysMin: number; codDaysMax: number };
  hours: { openHour: number; closeHour: number };
  coupon: { percent: number; active: boolean };
  cod: { physicalOnDeliveryActive: boolean };
}

/**
 * The eleven gates every outbound message passes before it reaches the customer.
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

/** Every "R$ 12,34" or "R$ 12.34" in the text, as numbers. */
const moneyIn = (text: string): number[] =>
  [...text.matchAll(/r\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/gi)].map((m) =>
    Number(m[1]!.replace(/\./g, "").replace(",", ".")),
  );

/** Every "15%" in the text, as numbers. */
const percentsIn = (text: string): number[] =>
  [...text.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));

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
    /me\s+(tira|tire|remove|remova)\s+da\s+lista/,
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
  // "para o suporte", "com a atendente": o artigo varia e a ausência dele também.
  const art = "(?:(?:o|a|os|as|um|uma)\\s+)?";
  const who = "(?:pessoa|humano|humana|atendente|gerente|vendedor[ae]?|suporte|alguem)";
  const asks = [
    new RegExp(`\\b(quero|queria|posso|pode|gostaria\\s+de)\\s+(falar|conversar)\\s+com\\s+${art}${who}\\b`),
    new RegExp(`\\bfalar\\s+com\\s+${art}${who}\\s+(de\\s+verdade|real)\\b`),
    new RegExp(`\\bme\\s+(passa|passe|transfere|transfira)\\s+(pra|para)\\s+${art}${who}\\b`),
    /\b(tem|existe|ha)\s+(algum\s+)?(atendente|humano|pessoa)\s+(ai|disponivel|pra\s+falar)\b/,
    /\bnao\s+quero\s+falar\s+com\s+(rob[oa]|bot|ia|maquina)\b/,
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
      const strayPrice = moneyIn(text).find((v) => !allowedPrices.has(v));
      if (strayPrice !== undefined) return `price ${strayPrice} is not one of the configured values`;

      const t = norm(text);
      if (!/desconto|off|economi/.test(t)) return null;
      const allowedPercents = new Set([
        prepayDiscountPercent,
        40, // anchor discount already published on the site
        ...(ctx.config.coupon.active ? [ctx.config.coupon.percent] : []),
      ]);
      const strayPercent = percentsIn(text).find((p) => !allowedPercents.has(p));
      return strayPercent === undefined ? null : `discount of ${strayPercent}% is not configured`;
    },
  },
  {
    name: "coupon_exists",
    remedy: "rewrite",
    check: (text, ctx) =>
      /cupom/i.test(text) && !ctx.config.coupon.active
        ? "mentions a coupon that is not active in Coinzz yet"
        : null,
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

      // The honest sentence the spec REQUIRES — "ele não emagrece" — contains the
      // same stem as the claim it forbids. Blocking the negation would veto the
      // agent for telling the truth, so a claim only counts when it is not negated.
      // The negation has to be in the same clause: "não emagrece" is honest, while
      // "não precisa de academia: ele emagrece" is the claim wearing a disguise.
      const negated = (at: number): boolean => {
        const before = t.slice(Math.max(0, at - 20), at);
        const clause = before.split(/[:;.!?]/).pop() ?? "";
        return /\b(nao|nunca|jamais|sem|nem)\b/.test(clause);
      };

      for (const pattern of claims) {
        for (const match of t.matchAll(pattern)) {
          if (match.index !== undefined && !negated(match.index)) {
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

      if (
        ctx.stage !== "logistics" &&
        /(chega|entrega|recebe|receber).{0,24}(amanha|hoje|24\s*h|no\s+mesmo\s+dia)/.test(t)
      )
        return "promises same-day or next-day delivery";

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
    check: (text, ctx) => {
      const quoted = [...text.matchAll(/[\u201c\u201d"]([^\u201c\u201d"]{12,})[\u201c\u201d"]/g)].map((m) => m[1]!);
      if (quoted.length === 0) return null;
      const known = (ctx.knownTestimonials ?? []).map(norm);
      const invented = quoted.find((q) => !known.some((k) => k.includes(norm(q))));
      return invented === undefined ? null : "quotes a testimonial that is not in the knowledge base";
    },
  },
  {
    name: "humanity_claim",
    remedy: "rewrite",
    check: (text) => {
      const t = norm(text);
      const claims = [
        /\bsou\s+(uma\s+)?(pessoa|humana|gente\s+de\s+verdade)\b/,
        /\bnao\s+sou\s+(um\s+|uma\s+)?(rob[oa]|bot|ia|maquina)\b/,
        /\bpode\s+ficar\s+tranquila,?\s+sou\s+de\s+verdade\b/,
      ];
      return claims.some((r) => r.test(t)) ? "claims to be a human being" : null;
    },
  },
  {
    name: "business_hours",
    remedy: "defer",
    check: (_t, ctx) => {
      if (ctx.layer === "auto") return null; // layer 1 runs 24/7 by decision R4.4
      const h = ctx.now.getHours();
      const { openHour, closeHour } = ctx.config.hours;
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
 * Ranked so that the strictest answer wins when more than one gate blocks: a reply
 * that both quotes a wrong price and goes to someone who opted out is a `stop`, not
 * a rewrite. Rewriting the price would produce a correct message sent to a person
 * who asked never to hear from us again.
 */
const SEVERITY: Record<Remedy, number> = { rewrite: 0, defer: 1, stop: 2 };

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
