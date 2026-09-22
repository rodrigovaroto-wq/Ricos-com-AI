import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import {
  money,
  prepayPriceLine,
  prepayWindowLine,
  systemPrompt,
  type PromptConfig,
} from "@/agent/prompt.js";
import { config as base, ctx } from "./fixtures.js";

/**
 * The system prompt is the text that decides the most behaviour and, until 2026-09-22,
 * the one no test touched (achado A, R11.9): it said "never offer a discount, the two
 * paths cost the same" and "10% off" in the same text, and "O FRETE É GRÁTIS nos dois
 * caminhos" as fixed text while the gate already read `freeShipping`. Prompt and gate are
 * the same promise written twice — these tests hold them to each other.
 */

/** The four corners that matter: freight on or off, prepaid discount on or off. */
const variant = (freeShipping: boolean, discount: boolean): PromptConfig => ({
  ...base,
  prices: discount
    ? { ...base.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }
    : { ...base.prices, prepayBrl: base.prices.codBrl, prepayDiscountPercent: 0 },
  delivery: { ...base.delivery, freeShipping },
});

const corners = [
  { name: "frete pago, com desconto", config: variant(false, true) },
  { name: "frete pago, sem desconto", config: variant(false, false) },
  { name: "frete grátis, com desconto", config: variant(true, true) },
  { name: "frete grátis, sem desconto", config: variant(true, false) },
] as const;

const build = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null);

/** The prompt joins indented source lines with a space, so runs of spaces are layout. */
const flat = (text: string) => text.replace(/\s+/g, " ");

/** The affirmative claim, in any case — "Nunca diga \"frete grátis\"" does not match. */
const AFFIRMS_FREE_SHIPPING = /frete\s+[eé]\s+gr[aá]tis/i;

describe("frete: o prompt lê delivery.freeShipping como o gate lê", () => {
  it("com freeShipping false, não instrui dizer que o frete é grátis", () => {
    const prompt = build(variant(false, true));
    expect(prompt).not.toMatch(AFFIRMS_FREE_SHIPPING);
    expect(prompt).toContain("NO ANTECIPADO o frete é calculado por região");
  });

  it("com freeShipping true, instrui", () => {
    const prompt = build(variant(true, true));
    expect(prompt).toContain("O FRETE É GRÁTIS nos dois caminhos");
  });

  // The `BUSINESS_CONFIG` trap: a key absent from the secret arrives undefined. Since
  // 2026-09-22 the operation offers no free shipping, so both the gate and the prompt read
  // it with `=== true` — absent means NOT free on both sides.
  it("com a chave ausente, lê como não grátis — o mesmo `=== true` do gate", () => {
    const { freeShipping: _, ...delivery } = base.delivery;
    const prompt = build({ ...base, delivery });
    expect(prompt).not.toMatch(AFFIRMS_FREE_SHIPPING);
    expect(prompt).not.toContain("O FRETE É GRÁTIS nos dois caminhos");
    expect(prompt).toContain("NO ANTECIPADO o frete é calculado por região");
  });

  // The saving rule is about what the AGENT says: `price_promise` demands the freight
  // caveat whenever she cites the R$ saving, not only when the customer raises it.
  // "Se ela citar economia" read as the customer's move and invited the saving as a tactic.
  it("a ressalva do frete vale sempre que a agente cita a economia em reais", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).not.toContain("Se ela citar economia");
    expect(prompt).toContain("Sempre que você citar a economia em reais entre os dois caminhos");
    expect(prompt).toContain("O percentual sozinho pode");
  });

  // Achado A, pinned: the paragraph was fixed text and the flag changed nothing. If it
  // ever comes back as fixed text, the paid-freight prompt carries it and this fails.
  it("regressão do achado A: o parágrafo de frete grátis não é texto fixo", () => {
    for (const { config } of corners.filter((c) => c.config.delivery.freeShipping === false)) {
      expect(build(config)).not.toContain("O FRETE É GRÁTIS nos dois caminhos");
    }
    // And the reason it matters: that sentence is vetoed under the same config.
    const verdict = runGates("O frete é grátis nos dois caminhos.", ctx({ config: variant(false, true) }));
    expect(verdict.allowed).toBe(false);
  });
});

describe("desconto: o prompt lê prices.prepayDiscountPercent", () => {
  it("com desconto, não proíbe desconto nem diz que custam o mesmo", () => {
    const prompt = build(variant(false, true));
    expect(prompt).not.toContain("Nunca ofereça desconto");
    expect(prompt).not.toContain("custam o mesmo");
    expect(prompt).toContain("10% abaixo do preço da entrega");
  });

  it("sem desconto, proíbe e diz que custam o mesmo", () => {
    const prompt = build(variant(false, false));
    expect(prompt).toContain("Nunca ofereça desconto");
    expect(prompt).toContain("custam o mesmo");
    expect(prompt).not.toContain("abaixo do preço da entrega");
  });
});

/**
 * Every sentence the prompt teaches her to say about price and freight, read out of the
 * prompt's own text for that config — never copied here — and run through the chain the
 * reply will meet. A prompt that teaches a vetoed sentence is a rewrite loop by design:
 * every conversation burns a retry on it, and one that runs out lands on the canned reply.
 *
 * Each exemplar is asserted to be IN the prompt first, so a wording change that moves it
 * fails here loudly instead of testing a sentence the prompt no longer teaches.
 */
type Path = "cod" | "prepay";
const BOTH: readonly Path[] = ["cod", "prepay"];
const COD: readonly Path[] = ["cod"];

/**
 * `paths` is where she says it. A cash-on-delivery sentence ("Entrega em 1 a 3 dias") is
 * a lie on the prepaid path and `delivery_promise` rightly vetoes it there; the prepaid
 * presentation is said while she is still on the delivery path, so it runs on both.
 */
const exemplars = (c: PromptConfig): Array<{ text: string; paths: readonly Path[] }> => {
  const cod = money(c.prices.codBrl);
  const list = [
    // Tactics block, the anchor.
    { text: `o preço cheio publicado é ${money(c.prices.anchorBrl)}.`, paths: BOTH },
    // Tactics block, risk reversal.
    { text: `ela não paga nada agora e tem ${c.delivery.warrantyDays} dias pra devolver.`, paths: BOTH },
    // "Uma oferta só": the cash-on-delivery offer.
    {
      text: `ela escolhe um dos próximos ${c.delivery.codDaysMax} dias, recebe em casa e paga ${cod} na mão do entregador.`,
      paths: COD,
    },
    // The prepaid path, presented as a way out.
    {
      text: `${prepayPriceLine(c)}, chega em qualquer lugar do país. ${prepayWindowLine(c).replace(/,$/, ".")}`,
      paths: BOTH,
    },
    // The price paragraph: the delivery half, then the prepaid half.
    { text: `Preço: ${cod} pago na entrega ao entregador, em dinheiro ou cartão.`, paths: COD },
    {
      text: `Entrega em ${c.delivery.codDaysMin} a ${c.delivery.codDaysMax} dias, agendada — quem escolhe o dia é ela, no checkout.`,
      paths: COD,
    },
    { text: `${c.delivery.warrantyDays} dias para trocar ou devolver.`, paths: BOTH },
    { text: `Quem prefere pagar antes paga ${prepayPriceLine(c)}, ${prepayWindowLine(c)}`, paths: BOTH },
  ];
  if (c.delivery.freeShipping === true) {
    list.push(
      { text: `O FRETE É GRÁTIS nos dois caminhos`, paths: BOTH },
      { text: `o valor que você diz é o valor final, sem nada somado na porta nem no checkout.`, paths: BOTH },
    );
  } else {
    list.push({
      text: `NO PAGAMENTO NA ENTREGA o frete já está dentro do preço: ela paga ${cod} na mão do entregador e mais nada.`,
      paths: COD,
    });
  }
  return list;
};

/** The quoted model sentences in the prompt that carry a price — the gate briefing's own. */
const quotedPriceExamples = (prompt: string): string[] =>
  [...prompt.matchAll(/\("([^"]*R\$[^"]*)"\)/g)].map((m) => m[1]!);

describe("toda frase-exemplo de preço e frete passa a cadeia de gates", () => {
  describe.each(corners)("$name", ({ config }) => {
    const prompt = flat(build(config));

    it.each(exemplars(config))("ensina e aprova: $text", ({ text, paths }) => {
      expect(prompt).toContain(text);
      for (const paymentPath of paths) {
        const verdict = runGates(text, ctx({ config, paymentPath }));
        const blocked = verdict.traces.filter((t) => t.verdict === "block");
        expect({ paymentPath, blocked }).toEqual({ paymentPath, blocked: [] });
      }
    });

    it("os exemplos entre aspas com valor, no briefing dos gates, também passam", () => {
      const quoted = quotedPriceExamples(prompt);
      for (const sentence of quoted) {
        const verdict = runGates(sentence, ctx({ config, paymentPath: "prepay" }));
        expect({ sentence, blocked: verdict.traces.filter((t) => t.verdict === "block") }).toEqual({
          sentence,
          blocked: [],
        });
      }
    });
  });

  // The quoted-example scan must not be vacuous where the gate does teach one.
  it("o briefing com frete pago e desconto ensina a economia com a ressalva", () => {
    expect(quotedPriceExamples(build(variant(false, true)))).toContain(
      "R$ 12,99 a menos no produto, e o frete é calculado no checkout",
    );
  });
});
