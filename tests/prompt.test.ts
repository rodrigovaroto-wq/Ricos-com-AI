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

  // Exit A (operator decision 2026-09-22): `price_promise` vetoes the saving in reais in
  // any wording, so the prompt says never to cite it — the percentage and the prepaid
  // price instead. Exit C's "sempre que você citar a economia em reais" taught a sentence
  // the gate now vetoes, a rewrite loop by design.
  it("a economia em reais nunca é citada: o prompt manda dizer o percentual e o preço", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).not.toContain("Se ela citar economia");
    expect(prompt).not.toContain("Sempre que você citar a economia em reais");
    expect(prompt).toContain("Nunca cite a economia em reais");
    expect(prompt).toContain("diga o percentual e o preço do antecipado");
  });

  // The number itself must not appear anywhere in the prompt: a prompt that shows it,
  // even in a "never say" example, puts it in front of the model.
  it.each(corners)("o prompt gerado não contém o valor da economia ($name)", ({ config }) => {
    const saving = +(config.prices.codBrl - config.prices.prepayBrl).toFixed(2);
    const prompt = build(config);
    if (saving > 0) {
      expect(prompt).not.toContain(money(saving));
      expect(prompt).not.toContain(money(saving).replace("R$ ", ""));
    }
    // Pin the config of today, so the check is not vacuous: 129,90 − 116,91.
    if (config.prices.prepayBrl === 116.91) expect(money(saving)).toBe("R$ 12,99");
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
  it("o briefing com desconto ensina o percentual com o preço, nos dois ramos do frete", () => {
    for (const freeShipping of [false, true]) {
      expect(quotedPriceExamples(build(variant(freeShipping, true)))).toContain(
        "10% de desconto: R$ 116,91 no antecipado",
      );
    }
  });
});

/**
 * The operator's complaint of 2026-09-24, after reading real Muse replies: the style was
 * staccato ("Uma ideia por frase. Frase curta, ponto final, próxima.") and one reply ended
 * on a question with a floating adjective and an ownerless pronoun. The prompt now asks
 * for comma-linked oral PT-BR, a reread for concordância, and teaches natural questions.
 * What must NOT move: every clarity rule that protects money, and the disclosure rule.
 */
describe("ritmo: vendedora brasileira no WhatsApp, não frase telegráfica", () => {
  it.each(corners)("o ritmo telegráfico saiu do prompt ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).not.toContain("Uma ideia por frase");
    expect(prompt).not.toContain("Frase curta, ponto final, próxima");
    expect(prompt).not.toContain("criança de 8 anos");
  });

  it("o prompt pede vírgula mais que ponto, com um limite que dá pra verificar", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("Vírgula mais que ponto.");
    expect(prompt).toContain("duas frases seguidas com menos de oito palavras cada já soam como robô");
    expect(prompt).toContain(`com "né" no máximo uma vez por mensagem`);
  });

  // Edge: a longer, comma-linked sentence is exactly where a deadline drifts away from its
  // payment path. The clarity rules that protect money stay, in every corner.
  it.each(corners)("as regras de clareza que protegem dinheiro continuam ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain("Todo número tem que dizer a que se refere");
    expect(prompt).toContain("o preço ou o prazo de um caminho nunca divide a frase com os do outro");
    expect(prompt).toContain(`Nada de "modalidade", "adicional", "mediante", "disponibilidade"`);
    expect(prompt).toContain("O pagamento na entrega é O caminho");
    expect(prompt).toContain("O pagamento antecipado é uma SAÍDA, não uma opção.");
  });

  // Negated case: a human tone is not a human claim. The prompt still forbids claiming to
  // be a person, and says the tone is borrowed, not the identity; the gate still reads
  // "não sou robô" as the offence and "não sou uma pessoa" as the right answer.
  it("tom humano não é afirmar ser pessoa", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("Nunca afirma ser uma pessoa");
    expect(prompt).toContain("o tom, não a identidade: você continua sendo a assistente virtual da marca");
    expect(runGates("Não sou robô, tá? Sou a Malu mesmo.", ctx()).allowed).toBe(false);
    expect(runGates("Não sou uma pessoa, sou a assistente virtual da marca, tá?", ctx()).allowed).toBe(true);
  });
});

describe("concordância: a origem do erro sai do prompt e ele manda reler", () => {
  const QUESTIONS = [
    "Tem alguma roupa que você adora e deixou de usar? Me conta qual é.",
    "Qual roupa você anda deixando no armário?",
  ];

  it.each(corners)("o prompt manda reler concordância e pronome antes de mandar ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain("Releia cada frase antes de mandar");
    expect(prompt).toContain("Concordância nominal: o adjetivo tem o gênero e o número da palavra que ele descreve");
    expect(prompt).toContain("Concordância verbal: o verbo concorda com o sujeito");
    expect(prompt).toContain(`troque pelo nome, "o colete", "a roupa"`);
  });

  // The origin: "o vestido que voltou a fechar bonito" taught the adverbial "bonito" that
  // came back as "voltar a usar bonita com ele". The scene stays, the floating word goes.
  it("a cena concreta fica, sem o adjetivo solto que originou o erro", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("o vestido que voltou a fechar, a foto da festa");
    expect(prompt).not.toContain("fechar bonito");
  });

  // Every question the prompt now teaches passes the chain, on both payment paths and in
  // both freeShipping branches. "deixou de usar" is the negated form, and no gate may
  // read it as a claim.
  describe.each(corners)("$name", ({ config }) => {
    const prompt = flat(build(config));
    it.each(QUESTIONS)("ensina e aprova: %s", (text) => {
      expect(prompt).toContain(`"${text}"`);
      for (const paymentPath of BOTH) {
        const verdict = runGates(text, ctx({ config, paymentPath }));
        const blocked = verdict.traces.filter((t) => t.verdict === "block");
        expect({ paymentPath, blocked }).toEqual({ paymentPath, blocked: [] });
      }
    });
  });
});

/**
 * Until 2026-09-24 the tactics block taught `Feche por escolha: "prefere pagar na entrega ou
 * antecipado?"` while the clarity block said "Uma oferta só ... não pergunte qual ela
 * prefere". The operator's decision settles it: cash on delivery is THE path, so the
 * choice-close keeps the choice but never offers the other payment, a fixed day, or a size
 * held for her.
 */
describe("fechamento por escolha: uma oferta só vence", () => {
  const CLOSE = "Posso já seguir com o seu pedido pra pagar na entrega, ou ficou alguma dúvida que eu tiro antes?";

  it.each(corners)("o prompt não ensina mais a escolha entre os dois pagamentos ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).not.toContain("prefere pagar na entrega ou antecipado");
    expect(prompt).toContain("nenhuma delas é o pagamento antecipado, um dia marcado ou um tamanho separado");
    // The rule that won is still there.
    expect(prompt).toContain("Não ofereça alternativa, não monte comparação, não pergunte qual ela prefere");
  });

  // The close is a cash-on-delivery sentence, so it runs on that path only, as the other
  // cash-on-delivery exemplars above do.
  describe.each(corners)("$name", ({ config }) => {
    it("ensina e aprova o fechamento novo", () => {
      expect(flat(build(config))).toContain(`"${CLOSE}"`);
      const verdict = runGates(CLOSE, ctx({ config, paymentPath: "cod" }));
      expect(verdict.traces.filter((t) => t.verdict === "block")).toEqual([]);
    });
  });

  // Failure: the tempting variant that holds a size for her is a promise the gate vetoes,
  // which is why the example names no size.
  it("a variante que separa tamanho é vetada, por isso o exemplo não cita tamanho", () => {
    const verdict = runGates("Posso já reservar o seu M pra pagar na entrega, ou ficou alguma dúvida?", ctx());
    expect(verdict.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("unverified_size");
  });
});
