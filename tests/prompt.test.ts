import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksWhatSheIs, gateBriefing, runGates } from "@/agent/guardrails.js";
import {
  BURST_EXAMPLE,
  DEFAULT_COD_CONFIRM,
  expressLine,
  freightBriefing,
  linkFactLine,
  money,
  noCodMessage,
  prepayWindowLine,
  productFacts,
  systemPrompt,
  twoOptionsMessage,
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

/**
 * The corners that matter: freight free on both paths, on cash on delivery only (the truth
 * since 2026-09-28, and what an ABSENT `codFreeShipping` reads as — the key is omitted, as
 * it arrives from production's secret) or on neither (`codFreeShipping: false`); prepaid
 * discount on or off.
 */
const EXAMPLE_KITS = (JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as PromptConfig).kits ?? [];

const variant = (freeShipping: boolean, discount: boolean, codFreeShipping?: false): PromptConfig => ({
  ...base,
  prices: discount
    ? { ...base.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }
    : { ...base.prices, prepayBrl: base.prices.codBrl, prepayDiscountPercent: 0 },
  delivery: { ...base.delivery, freeShipping, ...(codFreeShipping === false ? { codFreeShipping } : {}) },
});

const corners = [
  { name: "grátis só na entrega, com desconto", config: variant(false, true) },
  { name: "grátis só na entrega, sem desconto", config: variant(false, false) },
  { name: "frete pago nos dois, com desconto", config: variant(false, true, false) },
  { name: "frete pago nos dois, sem desconto", config: variant(false, false, false) },
  { name: "frete grátis, com desconto", config: variant(true, true) },
  { name: "frete grátis, sem desconto", config: variant(true, false) },
] as const;

/** Free on neither path: the only corner where the prompt may not say "frete é grátis" at all. */
const freeNowhere = (c: PromptConfig) => c.delivery.freeShipping !== true && c.delivery.codFreeShipping === false;

/** Every "frete é grátis" in the text has the delivery path named in the 40 characters before it. */
const freeOnlyOnDelivery = (text: string) =>
  [...text.matchAll(/frete\s+[eé]\s+gr[aá]tis/gi)].every((m) => /entrega/i.test(text.slice(Math.max(0, (m.index ?? 0) - 40), m.index)));

const build = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null);

/** The prompt joins indented source lines with a space, so runs of spaces are layout. */
const flat = (text: string) => text.replace(/\s+/g, " ");

/** The affirmative claim, in any case — "Nunca diga \"frete grátis\"" does not match. */
const AFFIRMS_FREE_SHIPPING = /frete\s+[eé]\s+gr[aá]tis/i;

describe("frete: o prompt lê delivery.freeShipping como o gate lê", () => {
  it("com codFreeShipping false, não instrui dizer que o frete é grátis", () => {
    const prompt = build(variant(false, true, false));
    expect(prompt).not.toMatch(AFFIRMS_FREE_SHIPPING);
    expect(prompt).toContain("NO ANTECIPADO o frete é calculado por região");
  });

  // 2026-09-28: cash on delivery ships free. The prompt reads `codFreeShipping` with the
  // gate's own `!== false` — absent is free on delivery — and every time it says "frete é
  // grátis" it names the delivery path, which is the condition the gate lets it through on.
  it("com codFreeShipping ausente, instrui o grátis da entrega, sempre com o caminho", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("NO PAGAMENTO NA ENTREGA O FRETE É GRÁTIS");
    expect(prompt).toContain(`"Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber."`);
    // The gate lets the free claim through only in a canonical sentence (grafo §32): the prompt
    // teaches that one word for word, in a sentence of its own, in both briefings.
    expect(prompt).toContain("Use esta frase, com estas palavras, numa frase só dela:");
    expect(prompt).toContain("use esta frase, com estas palavras, numa frase só dela");
    expect(prompt).toContain("NO ANTECIPADO o frete é calculado por região dentro do checkout");
    expect(prompt).toContain("nunca diga que é grátis");
    expect(prompt).toMatch(AFFIRMS_FREE_SHIPPING);
    expect(freeOnlyOnDelivery(prompt)).toBe(true);
    expect(prompt).not.toContain("O FRETE É GRÁTIS nos dois caminhos");
  });

  // The gate lets the free claim through only in a canonical sentence (grafo §32). Each briefing
  // names ONE sentence to use as it is — the prompt's freight paragraph and the gate's briefing —
  // and it has to be the same sentence, and it has to pass the whole chain on both paths.
  it.each(corners.filter((c) => c.config.delivery.freeShipping !== true && c.config.delivery.codFreeShipping !== false))(
    "a frase que os dois briefings mandam usar é a mesma e passa a cadeia ($name)",
    ({ config }) => {
      const fromPrompt = /numa frase só dela: "([^"]+)"/.exec(flat(freightBriefing(config).join(" ")))?.[1];
      const fromGate = /numa frase só dela \("([^"]+)"\)/.exec(flat(gateBriefing(config).join(" ")))?.[1];
      expect(fromPrompt).toBe(`Pagando na entrega o frete é grátis: você paga só ${money(config.prices.codBrl)} quando receber.`);
      expect(fromGate).toBe(fromPrompt);
      for (const paymentPath of ["cod", "prepay"] as const) {
        const blocked = runGates(fromPrompt!, ctx({ config, paymentPath })).traces.filter((t) => t.verdict === "block");
        expect({ paymentPath, blocked }).toEqual({ paymentPath, blocked: [] });
      }
    },
  );

  // Next to the free sentence, every other sentence that names the prepaid offer has to say the
  // freight is charged there (grafo §33). The prompt teaches the one line that carries the prepaid
  // discount that way, and the kit's own canonical sentence with the kit's price.
  it.each([
    ...corners.filter((c) => c.config.delivery.freeShipping !== true && c.config.delivery.codFreeShipping !== false),
    { name: "com os kits do exemplo", config: { ...variant(false, true), kits: EXAMPLE_KITS } },
  ])(
    "a linha do desconto do antecipado passa ao lado da frase canônica ($name)",
    ({ config }) => {
      const prompt = flat(freightBriefing(config).join(" "));
      const canonical = `Pagando na entrega o frete é grátis: você paga só ${money(config.prices.codBrl)} quando receber.`;
      const combined = /desconto do antecipado na mesma mensagem, use esta frase: "([^"]+)"/.exec(prompt)?.[1];
      if (config.prices.prepayDiscountPercent > 0) {
        expect(combined).toBe(
          `No antecipado o frete é calculado por região no checkout, e você ganha ${config.prices.prepayDiscountPercent}% de desconto: ${money(config.prices.prepayBrl)}.`,
        );
        for (const paymentPath of ["cod", "prepay"] as const) {
          const blocked = runGates(`${canonical} ${combined}`, ctx({ config, paymentPath })).traces.filter((t) => t.verdict === "block");
          expect({ paymentPath, blocked }).toEqual({ paymentPath, blocked: [] });
        }
        // The bare discount line next to it extends the free to the prepaid offer.
        expect(runGates(`${canonical} No pix você ganha ${config.prices.prepayDiscountPercent}% de desconto.`, ctx({ config })).traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("shipping_promise");
      } else expect(combined).toBeUndefined();
      for (const kit of (config.kits ?? []).filter((k) => k.path === "cod")) {
        const line = `"Pagando na entrega o frete é grátis: você paga só ${money(kit.priceBrl)} quando receber."`;
        expect(prompt).toContain(`Levando ${kit.units} peças, o mesmo com o preço do kit: ${line}`);
        for (const paymentPath of ["cod", "prepay"] as const) {
          const blocked = runGates(line.slice(1, -1), ctx({ config, paymentPath, units: kit.units })).traces.filter((t) => t.verdict === "block");
          expect({ paymentPath, units: kit.units, blocked }).toEqual({ paymentPath, units: kit.units, blocked: [] });
        }
      }
    },
  );

  it("o caso dos kits não é vazio", () => expect(EXAMPLE_KITS.filter((k) => k.path === "cod").length).toBeGreaterThan(0));

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
    // Not free on both; free on delivery only, said with the path (2026-09-28).
    expect(freeOnlyOnDelivery(prompt)).toBe(true);
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
    expect(flat(prompt)).toContain("você ganha 10% de desconto, R$ 116,91");
  });

  it("sem desconto, proíbe e diz que custam o mesmo", () => {
    const prompt = build(variant(false, false));
    expect(prompt).toContain("Nunca ofereça desconto");
    expect(prompt).toContain("custam o mesmo");
    expect(prompt).not.toContain("você ganha");
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
    // Tactics block, risk reversal: the delivery named as its condition, so it is true on the
    // prepaid path too, where "ela não paga nada agora" alone is vetoed (operator, 2026-09-29).
    {
      text: `no pagamento na entrega ela não paga nada agora e tem ${c.delivery.warrantyDays} dias após o recebimento pra devolver.`,
      paths: BOTH,
    },
    // The price paragraph. No payment methods listed (operator, 2026-10-06).
    { text: `Preço: ${cod} pago na entrega ao entregador.`, paths: COD },
    {
      text: `Entrega em ${c.delivery.codDaysMin} a ${c.delivery.codDaysMax} dias, agendada — quem escolhe o dia é ela, no checkout.`,
      paths: COD,
    },
    { text: `${c.delivery.warrantyDays} dias após o recebimento para trocar ou devolver.`, paths: BOTH },
  ];
  if (c.delivery.freeShipping === true) {
    list.push(
      { text: `O FRETE É GRÁTIS nos dois caminhos`, paths: BOTH },
      { text: `o valor que você diz é o valor final, sem nada somado na porta nem no checkout.`, paths: BOTH },
    );
  } else if (c.delivery.codFreeShipping !== false) {
    // Said on either path: the sentence names the delivery, as "na entrega você recebe em 1 a
    // 3 dias" does, and the prepaid one names its own.
    list.push(
      { text: `"Pagando na entrega o frete é grátis: você paga só ${cod} quando receber."`, paths: BOTH },
      {
        text: `"No antecipado o frete é calculado por região, e o valor aparece pra você no checkout, antes de pagar."`,
        paths: BOTH,
      },
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
  });

  // Negated case: a human tone is not a human claim. The prompt still forbids claiming to
  // be a person, and says the tone is borrowed, not the identity; the gate still reads
  // "não sou robô" as the offence and "não sou uma pessoa" as the right answer.
  it("tom humano não é afirmar ser pessoa", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("Nunca afirma ser uma pessoa");
    expect(prompt).toContain("o tom, não a identidade: você nunca diz que é uma pessoa.");
    expect(runGates("Não sou robô, tá? Sou a Malu mesmo.", ctx()).allowed).toBe(false);
    expect(runGates("Não sou uma pessoa, sou a assistente virtual da marca, tá?", ctx()).allowed).toBe(true);
  });

  // Q10, line 2 (grafo §58): the prompt no longer primes "assistente virtual" for the opening. It
  // teaches the name and the brand, and "virtual" only when her message asks — the gate's test.
  it("não anuncia: apresenta-se pelo nome e pela marca, e virtual só se ela perguntar", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain(`Quando se apresenta, é "a ${base.agentName}, da ${base.brand}", e só.`);
    expect(prompt).toContain("Nunca diz por conta própria que é virtual, IA, robô, bot ou assistente virtual");
    expect(prompt).not.toContain(`assistente de vendas da ${base.brand}`);
    const opening = `Oi, que bom falar com você, eu sou a ${base.agentName}, da ${base.brand}. Tem alguma roupa que você adora e deixou de usar? Me conta qual é.`;
    expect(runGates(opening, ctx({ askedIdentity: asksWhatSheIs("oi") })).allowed).toBe(true);
    expect(runGates("Não sou uma pessoa, sou a assistente virtual da marca, tá?", ctx({ askedIdentity: asksWhatSheIs("vc é robo?") })).allowed).toBe(true);
    expect(runGates(`Oi, eu sou a ${base.agentName}, assistente virtual da ${base.brand}.`, ctx({ askedIdentity: asksWhatSheIs("oi") })).allowed).toBe(false);
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
 * Until 2026-10-06 the prompt said "Uma oferta só ... não pergunte qual ela prefere" and "O
 * pagamento antecipado é uma SAÍDA, não uma opção" (2026-09-24). The operator reversed it (C1 of
 * the v2 design): where payment at the door reaches her CEP, she gets both options and chooses.
 * The choice-close is that question; it still never offers a fixed day or a size held for her.
 */
describe("fechamento por escolha: as duas opções, ela escolhe", () => {
  const CLOSE = "Qual das duas fica melhor pra você?";

  it.each(corners)("a regra de uma oferta só e a da saída saíram ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).not.toContain("Não ofereça alternativa, não monte comparação, não pergunte qual ela prefere");
    expect(prompt).not.toContain("SAÍDA, não uma opção");
    expect(prompt).not.toContain("O pagamento na entrega é O caminho");
    expect(prompt).not.toContain("continua sendo a saída");
    expect(prompt).toContain("nenhuma delas é um dia marcado ou um tamanho separado");
    expect(prompt).toContain("apresente as duas opções e deixe ela escolher");
  });

  describe.each(corners)("$name", ({ config }) => {
    it("ensina e aprova o fechamento novo nos dois caminhos", () => {
      expect(flat(build(config))).toContain(`"${CLOSE}"`);
      for (const paymentPath of BOTH) {
        expect(runGates(CLOSE, ctx({ config, paymentPath })).traces.filter((t) => t.verdict === "block")).toEqual([]);
      }
    });
  });

  // Failure: the tempting variant that holds a size for her is a promise the gate vetoes,
  // which is why the example names no size.
  it("a variante que separa tamanho é vetada, por isso o exemplo não cita tamanho", () => {
    const verdict = runGates("Posso já reservar o seu M pra pagar na entrega, ou ficou alguma dúvida?", ctx());
    expect(verdict.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("unverified_size");
  });
});

/**
 * The payment step (operator, 2026-10-06; design §5). Region known: both options, three
 * bubbles, each price and window tied to its path. Region without payment at the door: said
 * kindly, prepaid only. "Sim" without a choice: the delivery, confirmed. Every corner of the
 * config, at the stage it is said (pre-sale, region answered).
 */
describe("pagamento: duas opções onde a entrega chega, o antecipado onde não chega", () => {
  const blocked = (text: string, over: Parameters<typeof ctx>[0]) =>
    runGates(text, ctx({ stage: "presale", regionKnown: true, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

  describe.each(corners)("$name", ({ config }) => {
    const prompt = flat(build(config));
    const options = twoOptionsMessage(config);

    it("as duas opções: o prompt ensina os três balões e a mensagem inteira passa", () => {
      expect(options).toHaveLength(3);
      for (const bubble of options) expect(prompt).toContain(`"${bubble}"`);
      expect(blocked(options.join("\n\n"), { config, paymentPath: "cod" })).toEqual([]);
      for (const bubble of options) expect(words(bubble.split(/(?<=[.?!])\s+/).sort((a, b) => words(b) - words(a))[0]!)).toBeLessThanOrEqual(30);
    });

    it("cada número vem do config e cada prazo fica colado no seu caminho", () => {
      expect(options[0]).toContain(money(config.prices.codBrl));
      expect(options[0]).toContain(`chega em ${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} dias`);
      expect(options[0]).not.toContain(money(config.prices.prepayBrl) === money(config.prices.codBrl) ? "\u0000" : money(config.prices.prepayBrl));
      expect(options[1]).toContain(money(config.prices.prepayBrl));
      expect(options[1]).toContain(prepayWindowLine(config).replace(/,$/, ""));
      expect(options[1]).not.toContain(`${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} dias`);
    });

    it("sem entrega no CEP: a frase negada passa no antecipado, e nunca promete pagar na porta", () => {
      const msg = noCodMessage(config);
      expect(prompt).toContain(`"${msg}"`);
      // The reason the repository documents (script 02 §7.2), and no other.
      expect(msg).toContain("Aí na sua região a transportadora ainda não tem pagamento na entrega");
      // Only the prepaid: no window or price of the delivery, no choice question.
      expect(msg).not.toContain(`${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} dias`);
      expect(msg).not.toContain("duas opções");
      expect(blocked(msg, { config, paymentPath: "prepay", codUnavailable: true })).toEqual([]);
    });

    it("\"sim\" sem escolher: fica no pagamento na entrega, confirmando", () => {
      expect(prompt).toContain(`"${DEFAULT_COD_CONFIRM}"`);
      expect(blocked(DEFAULT_COD_CONFIRM, { config, paymentPath: "cod" })).toEqual([]);
    });
  });

  // Negated sentence, the failure that shaped the wording: script 02 §7.2 says "não faz pagamento
  // na entrega", and `charge_promise` reads it as the promise. Not loosened here; pinned, so the day
  // the gate learns the negation this can go back to the script's words.
  it("\"não faz pagamento na entrega\" é vetado onde a entrega não chega; \"não tem\" passa", () => {
    const c = variant(false, true);
    const over = { config: c, paymentPath: "prepay" as const, codUnavailable: true };
    expect(blocked("Aí na sua região a transportadora ainda não faz pagamento na entrega, mas tem o antecipado.", over)).toContain("charge_promise");
    expect(blocked("Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado.", over)).toEqual([]);
  });

  // Operator clarification, 2026-10-06: the "sim" default is the delivery ONLY where it reaches
  // her; elsewhere "sim" is the prepaid, and the prompt says so next to the no-delivery message.
  it("o \"sim\" vira entrega só onde a entrega chega; onde não chega, é o antecipado", () => {
    const prompt = flat(build(variant(false, true)));
    const cod = prompt.indexOf("**O pagamento na entrega chega no CEP dela:**");
    const noCod = prompt.indexOf("**Não chega:**");
    const confirm = prompt.indexOf(DEFAULT_COD_CONFIRM);
    expect(cod).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(cod);
    expect(confirm).toBeLessThan(noCod);
    expect(prompt).toContain("Só neste caso, se ela responder \"sim\" ou \"pode ser\" sem escolher");
    expect(prompt).toContain(`Aqui o "sim" é o antecipado: siga pros dados, sem oferecer nem supor pagamento na entrega`);
    // What she says on that "sim" where delivery does not reach passes; the delivery default is vetoed.
    for (const { config } of corners) {
      expect(blocked("Combinado, fica no antecipado então, e agora pra deixar o pedido no seu nome, me passa seu nome completo?", { config, paymentPath: "prepay", codUnavailable: true })).toEqual([]);
    }
  });

  // Failure: what the no-delivery branch must never say, and why the prompt says so.
  it("onde a entrega não chega, pagar na porta e \"não paga nada agora\" são vetados", () => {
    const c = variant(false, true);
    expect(blocked("Pagando na entrega você paga só quando receber.", { config: c, paymentPath: "prepay", codUnavailable: true })).toContain("charge_promise");
    expect(blocked(DEFAULT_COD_CONFIRM, { config: c, paymentPath: "prepay", codUnavailable: true })).toContain("charge_promise");
  });

  // Edge, and the reason the prepaid half is ONE sentence (design §5.1): its window in a second
  // sentence names the prepaid without its freight, and the free claim leaks to it.
  it("o prazo do antecipado numa frase separada vaza o grátis e é vetado", () => {
    const c = variant(false, true);
    const split = `${twoOptionsMessage(c)[0]}\n\nNo antecipado você ganha 10% de desconto, R$ 116,91. No antecipado, o prazo varia por região, em média 5 dias úteis.`;
    expect(blocked(split, { config: c, paymentPath: "cod" })).toContain("shipping_promise");
  });

  it("sem desconto, as opções não falam de desconto", () => {
    expect(twoOptionsMessage(variant(false, false)).join(" ")).not.toMatch(/desconto/);
    expect(noCodMessage(variant(false, false))).not.toMatch(/desconto/);
  });
});

/**
 * Round-1 findings from a real Muse run, 2026-09-24. Asked "tem loja física?", she said
 * "A gente não tem loja física, a venda é só por aqui…" — honest, and vetoed:
 * `unavailable_offer` reads "loja física" as an offer even when denied, and loosening it
 * failed four review rounds. The prompt teaches the answer without the words instead.
 */
const STORE_ANSWER = "Aqui a venda é toda online, pelo site e por esta conversa, e o colete vai direto pra sua casa.";

/** Every double-quoted example the prompt teaches her to say (ends in . ? or !). */
const quotedSentences = (prompt: string): string[] =>
  [...prompt.matchAll(/"([^"]{12,}[.?!])"/g)].map((m) => m[1]!);

/** The same examples cut into sentences: the ceiling is per sentence, not per quote. */
const taughtSentences = (prompt: string): string[] =>
  quotedSentences(prompt).flatMap((q) => q.split(/(?<=[.?!])\s+/));

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("loja, endereço, retirada: resposta sem as palavras que o gate lê", () => {
  it.each(corners)("o prompt ensina a resposta e diz quais palavras evitar ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain(`"${STORE_ANSWER}"`);
    expect(prompt).toContain(`sem as palavras "loja", "retirada" e "balcão", nem pra negar`);
  });

  describe.each(corners)("$name", ({ config }) => {
    it("a resposta ensinada passa a cadeia nos dois caminhos", () => {
      for (const paymentPath of BOTH) {
        const verdict = runGates(STORE_ANSWER, ctx({ config, paymentPath }));
        const blocked = verdict.traces.filter((t) => t.verdict === "block");
        expect({ paymentPath, blocked }).toEqual({ paymentPath, blocked: [] });
      }
    });
  });

  // Negated case. Until the gate change of 2026-09-24 the honest denial was vetoed, which
  // is why the block above avoids the words; `unavailable_offer` now reads the negation.
  // The block stays until that gate change passes its second review — then it can go.
  // The store half of the gate became a warning in the same change, so the affirmed offer
  // no longer blocks: it reaches her and leaves a trace. Pinned so the prompt is the only
  // thing keeping it out — and so a return to a veto is seen here.
  it("a negação honesta que a Muse escreveu passa; o convite para retirar na loja veta", () => {
    for (const paymentPath of BOTH) {
      const verdict = runGates("A gente não tem loja física, a venda é só por aqui e pelo site.", ctx({ paymentPath }));
      expect(verdict.traces.filter((t) => t.verdict !== "pass")).toEqual([]);
    }
    const offer = runGates("Pode retirar na nossa loja física, fica no centro.", ctx());
    expect(offer.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("unavailable_offer");
  });
});

describe("tamanho da frase e pontuação da pergunta", () => {
  it("o prompt dá o teto de 30 palavras junto do piso de oito", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("nenhuma frase passa de 30 palavras");
    expect(prompt).toContain("duas frases seguidas com menos de oito palavras cada");
  });

  // Edge: the prompt must obey its own ceiling — an example over 30 words teaches the
  // opposite of the rule. Not vacuous: the scan finds the store answer and the close.
  it.each(corners)("nenhuma frase que o prompt manda dizer passa de 30 palavras ($name)", ({ config }) => {
    const sentences = taughtSentences(flat(build(config)));
    expect(sentences).toContain(STORE_ANSWER);
    const over = sentences.filter((s) => words(s) > 30);
    expect(over).toEqual([]);
  });

  it("toda pergunta termina em ?, inclusive a do né — e o exemplo passa a cadeia", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain(`Toda pergunta termina em "?", inclusive a que termina em "né"`);
    expect(prompt).toContain(`"fica mais fácil assim, né?"`);
    for (const c of corners) {
      expect(runGates("fica mais fácil assim, né?", ctx({ config: c.config })).allowed).toBe(true);
    }
  });
});

describe("sem bordão e sem a mesma pergunta em toda mensagem", () => {
  it.each(corners)("frase pronta de vendedora tem teto na conversa inteira ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain(`como "sendo bem sincera" ou "você deve estar pensando que...", aparece no máximo uma vez na conversa inteira`);
  });

  it("a primeira frase responde o que ela perguntou", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("Se ela fez uma pergunta, a primeira frase da sua mensagem responde a ela.");
  });

  it("a pergunta da roupa é feita no máximo uma vez; quando ela quer, a pergunta leva ao pedido", () => {
    const prompt = flat(build(variant(false, true)));
    expect(prompt).toContain("A pergunta sobre a roupa ou a história dela é feita no máximo uma vez na conversa inteira");
    expect(prompt).toContain("Quando ela disser que quer, a sua pergunta leva ao pedido");
    // Still one question per message, which the tactic above already said.
    expect(prompt).toContain("Uma pergunta por mensagem, e nunca a mesma pergunta duas vezes com as mesmas palavras.");
  });
});

/** Grafo §60 (operador, 2026-10-06): a escada fixa saiu; quem interpreta a resposta solta é a Malu. */
describe("resposta solta: conversa, nunca \"não entendi\"", () => {
  it.each(corners)("o prompt ensina responder o desvio e voltar à pergunta ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain("responda isso primeiro e depois volte à sua pergunta com outras palavras");
    expect(prompt).toContain(`Um "ah ok", "hm" ou "kkk" pede uma continuação curta e calorosa do assunto que está aberto`);
    expect(prompt).toContain(`"??" quer dizer que a sua última mensagem não ficou clara`);
    expect(prompt).toContain(`Nunca escreva "não entendi"`);
  });
});

describe("pronome: nunca \"com ele\" no fim da pergunta", () => {
  it.each(corners)("a regra concreta está no prompt ($name)", ({ config }) => {
    expect(flat(build(config))).toContain(`Nunca termine uma pergunta com "com ele": diga "com o colete".`);
  });

  it.each(corners)("nenhuma pergunta que o prompt ensina termina em \"com ele?\" ($name)", ({ config }) => {
    const questions = quotedSentences(flat(build(config))).filter((s) => s.endsWith("?"));
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.filter((q) => /com ele\?$/i.test(q))).toEqual([]);
  });

  // Negated edge: the rule names "com ele" to forbid it; the only occurrence in the prompt
  // is inside that prohibition, never inside something she is taught to say.
  it("\"com ele\" só aparece dentro da proibição", () => {
    const prompt = flat(build(variant(false, true)));
    const hits = [...prompt.matchAll(/com ele\b/g)].map((m) => prompt.slice(m.index! - 30, m.index! + 10));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("termine uma pergunta com");
  });
});

/**
 * Operator decisions of 2026-09-24, after persona rounds 1 and 2 (0 of 12 reached the
 * link). The goal is an adaptive Malu: fewer rigid rules, more judgment, and only the money
 * and legal truths held fixed. Every block below reads the config, and an absent key drops
 * the line — the `BUSINESS_CONFIG` trap: a new key arrives absent in production.
 */
const FULL: PromptConfig = {
  ...variant(false, true),
  prices: { ...variant(false, true).prices, prepayMaxInstallments: 12 },
  support: { email: "contato@encorpa-fashion.com.br" },
  socialProof: { satisfiedCustomers: 500 },
  store: { physicalStorePlanCity: "São Paulo" },
};

/** Both freight branches of the fully configured shop, for the gate checks. */
const FULL_CORNERS = [
  { name: "grátis só na entrega", config: FULL },
  { name: "frete grátis", config: { ...FULL, delivery: { ...FULL.delivery, freeShipping: true } } },
] as const;

/** The prompt without the gate briefing: what THIS file teaches, apart from guardrails.ts. */
const own = (c: PromptConfig) => flat(systemPrompt(c, [], null));

const blockedOn = (text: string, config: PromptConfig, paymentPath: Path) =>
  runGates(text, ctx({ config, paymentPath }))
    .traces.filter((t) => t.verdict === "block")
    .map((t) => t.gate);

/** Asserts the prompt teaches `text` and that no gate vetoes it, on the given paths. */
const teachesAndPasses = (text: string, paths: readonly Path[] = BOTH) => {
  for (const { config } of FULL_CORNERS) {
    expect(flat(build(config))).toContain(text);
    for (const paymentPath of paths) {
      expect({ paymentPath, blocked: blockedOn(text, config, paymentPath) }).toEqual({ paymentPath, blocked: [] });
    }
  }
};

describe("tamanho da mensagem: até uns 30 palavras, e mais vira outro balão", () => {
  // Operator, 2026-10-06: up to three bubbles, one subject each, her questions in the order she
  // asked. A blank line is what `splitBubbles` cuts on (index.ts), so that is what the prompt teaches.
  it("até três balões, um assunto cada, separados por linha em branco", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("No máximo três balões, separados por uma linha em branco: cada parágrafo chega nela como um balão separado.");
    expect(prompt).toContain("Cada balão trata de um assunto só e tem até uns 30 palavras");
    expect(prompt).toContain("primeiro as perguntas dela, na ordem em que ela perguntou, depois o que ela informou, e no fim a sua pergunta");
  });

  it("o exemplo do operador está no prompt, cada balão com até 30 palavras, e passa nos dois caminhos", () => {
    const prompt = own(FULL);
    expect(BURST_EXAMPLE).toHaveLength(3);
    for (const bubble of BURST_EXAMPLE) {
      expect(prompt).toContain(`"${bubble}"`);
      expect(words(bubble)).toBeLessThanOrEqual(30);
    }
    for (const { config } of FULL_CORNERS) {
      for (const p of BOTH) expect({ p, blocked: blockedOn(BURST_EXAMPLE.join("\n\n"), config, p) }).toEqual({ p, blocked: [] });
    }
  });

  // Edge: splitting must never cut a sentence; every bubble stands alone.
  it("nenhum balão corta uma frase no meio", () => {
    expect(own(FULL)).toContain("Nunca corte uma frase no meio pra caber, todo balão é completo e faz sentido sozinho.");
  });

  // Failure it replaces: "duas ou três frases" left the length to the model, and the
  // persona rounds measured a median of 49 words per message.
  it("a regra vaga de antes saiu", () => {
    const prompt = own(FULL);
    expect(prompt).not.toContain("duas ou três frases resolvem quase tudo");
    expect(prompt).not.toContain("use o espaço que precisar");
    expect(prompt).not.toContain("a mensagem inteira tem até uns 30 palavras");
  });
});

describe("a pergunta da roupa uma vez só, e o bloco de preço uma vez por assunto", () => {
  it("depois que ela respondeu, a resposta dela vira argumento", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("depois que ela respondeu, use a resposta dela no argumento");
    expect(prompt).toContain("em vez de perguntar de novo. Se ela não respondeu, não insista.");
  });

  it("preço, pagamento na entrega e garantia vão uma vez por assunto", () => {
    expect(own(FULL)).toContain(
      "Preço, pagamento na entrega e os 7 dias vão uma vez por assunto.** Se você já disse e ela não perguntou de novo, a próxima mensagem fala de outra coisa.",
    );
  });

  // Failure it replaces: the risk-reversal tactic told her to repeat the argument.
  it("a reversão de risco não manda mais repetir em toda mensagem", () => {
    const prompt = own(FULL);
    expect(prompt).not.toContain("repita com palavras novas, nunca iguais");
    expect(prompt).toContain("use quando ela hesitar, com palavras novas, e não em toda mensagem");
  });
});

describe("\"vou pensar\": resposta calorosa, sem link", () => {
  const LATER = "Sem problemas, estou aqui se tiver mais alguma dúvida.";

  it("ensina a resposta e ela passa a cadeia nos dois caminhos e nos dois fretes", () => {
    teachesAndPasses(`"${LATER}"`.slice(1, -1));
  });

  // C7 (operator, 2026-10-06): no link without her data any more, so "vou pensar" carries none.
  it("o prompt manda não escrever link, e não promete mais um link automático", () => {
    expect(own(FULL)).toContain("Não escreva link nenhum: o link só vai com os dados dela.");
    expect(own(FULL)).not.toContain("vai junto automaticamente");
  });

  // Failure: the prompt must not carry a URL she could copy as if it were the checkout.
  it.each(corners)("o prompt não tem URL nenhuma que ela possa copiar ($name)", ({ config }) => {
    expect(build(config)).not.toMatch(/https?:\/\//);
  });
});

describe("garantia: sempre \"após o recebimento\"", () => {
  const FEAR =
    "Não precisa ter medo de errar. Se não gostar do que chegou, pode devolver em até 7 dias após o recebimento e a gente devolve o seu dinheiro sem custo nenhum.";

  it("toda vez que o prompt cita os dias de garantia, diz a partir de quando contam", () => {
    const prompt = own(FULL);
    const hits = [...prompt.matchAll(/7 dias(?! vão uma vez)/g)].map((m) => prompt.slice(m.index!, m.index! + 30));
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.filter((h) => !h.startsWith("7 dias após o recebimento"))).toEqual([]);
  });

  // Negated sentence, twice over ("não precisa", "se não gostar"): no gate reads it as a claim.
  it("a frase do medo de errar, com negação dupla, passa a cadeia", () => {
    teachesAndPasses(FEAR);
  });

  it("os dias vêm do config", () => {
    const c = { ...FULL, delivery: { ...FULL.delivery, warrantyDays: 10 } };
    expect(own(c)).toContain("pode devolver em até 10 dias após o recebimento");
    expect(own(c)).not.toContain("7 dias");
  });

  // Failure: a longer window than the config is still vetoed.
  it("um prazo de garantia maior que o do config é vetado", () => {
    expect(blockedOn("Você tem 30 dias após o recebimento pra devolver.", FULL, "cod")).toContain("warranty_promise");
  });
});

describe("pessoa do time: só o código decide o handoff", () => {
  it("o prompt proíbe dizer que chamou alguém sem a instrução do sistema", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("QUEM CHAMA UMA PESSOA DO TIME É O SISTEMA, NÃO VOCÊ.");
    expect(prompt).toContain("Nunca diga que chamou, avisou ou passou a conversa pra alguém");
  });

  // The opening line used to invite the very promise that failed Sandra in round 1.
  it("a abertura não oferece mais chamar alguém do time", () => {
    const prompt = own(FULL);
    expect(prompt).not.toContain("oferece chamar alguém do time");
    expect(prompt).toContain("diz que é a assistente virtual da marca e continua ajudando");
  });

  // Negated: the honest answer to "é robô?" still passes; claiming to be a person does not.
  it("a resposta honesta ao \"é robô?\" continua aprovada, e a negação que finge pessoa, vetada", () => {
    expect(runGates("Não sou uma pessoa, sou a assistente virtual da Encorpa, e sigo te ajudando aqui.", ctx()).allowed).toBe(true);
    expect(runGates("Não sou robô não, pode falar comigo.", ctx()).allowed).toBe(false);
  });
});

describe("tamanho: ela ajuda a achar, aceita centímetros e não troca", () => {
  it("pergunta pela calça confortável e pela preferência de caimento", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("que tamanho de calça ela veste e fica confortável, e se gosta da roupa mais soltinha ou mais justinha");
  });

  // The failure of round 1 (Marcinha): the prompt said "não peça medida em centímetros" and
  // the model refused the waist she offered, though the table is by waist.
  it("aceita a cintura em centímetros quando ela oferece, e nunca recusa medida", () => {
    const prompt = own(FULL);
    expect(prompt).not.toContain("nem medida em centímetros");
    expect(prompt).toContain("se ela mandar a medida da cintura em centímetros, aceite: o sistema converte");
    expect(prompt).toContain("Nunca recuse uma medida que ela deu.");
  });

  it("o tamanho do sistema é fato, e ela não troca depois", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("Nunca converta o tamanho por conta própria");
    expect(prompt).toContain("diga esse tamanho como fato, com a faixa de cintura dele, e não troque por outro depois");
  });

  // Negated: telling her she need not measure is not a size claim.
  it("\"não precisa medir\" passa, e o tamanho dado como disponível antes da consulta é vetado", () => {
    expect(blockedOn("Não precisa medir nada, me diz só o tamanho da calça que você veste.", FULL, "cod")).toEqual([]);
    expect(blockedOn("Temos o seu M disponível, pode confiar.", FULL, "cod")).toContain("unverified_size");
  });
});

describe("Express: só com delivery.expressActive === true", () => {
  const withExpress = (expressActive: boolean | undefined): PromptConfig => {
    const { expressActive: _, ...delivery } = FULL.delivery;
    return { ...FULL, delivery: expressActive === undefined ? delivery : { ...delivery, expressActive } };
  };

  it("ausente, o texto deste arquivo não fala em Express nem em entrega no mesmo dia", () => {
    expect(expressLine(withExpress(undefined))).toBe("");
    expect(own(withExpress(undefined))).not.toMatch(/express|mesmo dia/i);
  });

  it("false também silencia", () => {
    expect(own(withExpress(false))).not.toMatch(/express/i);
  });

  it("true deixa contar que existe, mandando conferir no checkout, sem prometer", () => {
    const prompt = own(withExpress(true));
    expect(prompt).toContain("oferece a entrega Express");
    expect(prompt).toContain("sem prometer que aparece");
  });

  // What the model actually reads includes the gate briefing (guardrails.ts). Until that
  // briefing loses its Express paragraph, this is the one that fails.
  it("o prompt inteiro, com o briefing dos gates, também não fala em Express quando está desligada", () => {
    expect(flat(build(withExpress(undefined)))).not.toMatch(/express/i);
  });
});

describe("as perguntas que mais aparecem, cada uma lendo o config", () => {
  describe("CNPJ e dados da empresa → e-mail do suporte", () => {
    it("configurado, manda para o e-mail", () => {
      expect(own(FULL)).toContain("Peça pra ela mandar um e-mail pra contato@encorpa-fashion.com.br");
    });
    it("ausente, a linha some e ela não aponta e-mail nenhum", () => {
      const { support: _, ...c } = FULL;
      expect(own(c)).not.toContain("CNPJ");
      expect(own(c)).not.toContain("contato@");
    });
    it("a frase passa a cadeia", () => {
      expect(
        blockedOn("Pra dados da empresa, como o CNPJ, é só mandar um e-mail pra contato@encorpa-fashion.com.br.", FULL, "cod"),
      ).toEqual([]);
    });
  });

  describe("loja física → o plano da cidade, só se configurado", () => {
    const PLAN = "Ainda não temos, a loja é só online, mas estamos com planos de abrir uma loja física em São Paulo!";
    it("configurado, ensina a frase do operador", () => {
      expect(own(FULL)).toContain(`"${PLAN}"`);
    });
    it("ausente, volta a resposta sem as palavras que o gate lê, e nada de plano", () => {
      const { store: _, ...c } = FULL;
      expect(own(c)).toContain(`"${STORE_ANSWER}"`);
      expect(own(c)).not.toContain("planos de abrir");
    });
    // Operator-mandated sentence. Vetoed by `unavailable_offer` until the gate learns this
    // negation; the gate specialist is loosening it in the same change.
    it("a frase do operador passa a cadeia nos dois caminhos", () => {
      teachesAndPasses(PLAN);
    });
  });

  describe("depoimento e zap de cliente → privacidade, e o site", () => {
    const SITE = "Se quiser ver alguns depoimentos, é só acessar nosso site e rolar até a seção de depoimentos.";
    it("ensina a frase e ela passa a cadeia", () => {
      teachesAndPasses(SITE);
    });
    it("não inventa depoimento e não diz que não tem", () => {
      expect(own(FULL)).toContain("Não invente depoimento e não diga que não tem");
    });
    it("a recusa por privacidade, negada, passa a cadeia", () => {
      expect(blockedOn("O contato das clientes eu não passo, por privacidade, mas os depoimentos estão no site.", FULL, "cod")).toEqual([]);
    });
  });

  describe("valor do frete e data da entrega → dentro do checkout", () => {
    it("com frete pago, o valor do antecipado aparece no checkout", () => {
      expect(own(FULL)).toContain("Se ela perguntar quanto é, o valor aparece pra ela dentro do checkout, antes de pagar.");
    });
    it("com frete grátis, não existe valor pra conferir", () => {
      expect(own(FULL_CORNERS[1].config)).not.toContain("o valor aparece pra ela dentro do checkout");
    });
    it("a data exata ela confere no checkout, e se insistir você não tem a informação", () => {
      expect(own(FULL)).toContain(
        "Ela confere dentro do checkout. Se insistir, diga que essa informação você não tem aqui, ela aparece no checkout personalizado dela.",
      );
    });
    it("as frases passam a cadeia, e a data inventada é vetada", () => {
      for (const { config } of FULL_CORNERS) {
        for (const p of BOTH) {
          expect(blockedOn("Essa informação eu não tenho aqui, ela aparece no seu checkout personalizado.", config, p)).toEqual([]);
        }
      }
      expect(blockedOn("O valor do frete você confere dentro do checkout, antes de pagar.", FULL, "prepay")).toEqual([]);
      expect(blockedOn("Chega amanhã na sua casa.", FULL, "cod").length).toBeGreaterThan(0);
    });
  });

  describe("\"tá caro\" → garantia, prova social só se configurada", () => {
    const CARO =
      "A qualidade é garantida, são mais de 500 clientes satisfeitas, e você só paga quando recebe, com 7 dias após o recebimento pra devolver.";
    it("configurado, cita o número do config", () => {
      expect(own(FULL)).toContain("são mais de 500 clientes satisfeitas");
    });
    it("ausente, não cita número de clientes", () => {
      const { socialProof: _, ...c } = FULL;
      expect(own(c)).not.toContain("clientes satisfeitas");
      expect(own(c)).toContain("A qualidade é garantida, no pagamento na entrega ela só paga quando recebe");
    });
    it("a resposta passa a cadeia no pagamento na entrega", () => {
      for (const { config } of FULL_CORNERS) expect(blockedOn(CARO, config, "cod")).toEqual([]);
    });
  });

  describe("parcelamento → só no antecipado, sem \"sem juros\"", () => {
    const PARCELA = "No pagamento na entrega não tem parcelamento, mas no antecipado pelo cartão dá pra parcelar em até 12x.";
    it("configurado, diz até quantas vezes no antecipado", () => {
      expect(own(FULL)).toContain("No antecipado pelo cartão ela pode parcelar em até 12x.");
    });
    it("ausente, não cita parcela no antecipado", () => {
      const { prepayMaxInstallments: _, ...prices } = FULL.prices;
      const c = { ...FULL, prices };
      expect(own(c)).not.toContain("12x");
      expect(own(c)).toContain("No pagamento na entrega não tem parcelamento.");
    });
    it("1x não é parcelamento: o prompt lê o config com o mesmo teste do gate", () => {
      const c = { ...FULL, prices: { ...FULL.prices, prepayMaxInstallments: 1 } };
      expect(own(c)).not.toContain("até 1x");
      expect(own(c)).toContain("No pagamento na entrega não tem parcelamento.");
    });
    it("nunca \"sem juros\", e juros só se ela perguntar", () => {
      expect(own(FULL)).toContain(`Nunca diga "sem juros" e não fale de juros por conta própria; se ela perguntar, as condições aparecem no checkout.`);
    });
    // Operator-mandated sentence, said while she is still on the delivery path. The
    // negation "não tem parcelamento" is vetoed by `installment_promise` on that path today.
    it("a frase do operador passa a cadeia nos dois caminhos", () => {
      for (const { config } of FULL_CORNERS) {
        for (const p of BOTH) expect({ p, blocked: blockedOn(PARCELA, config, p) }).toEqual({ p, blocked: [] });
      }
    });
  });

  describe("CPF → nota fiscal, e nada inventado sobre o dado", () => {
    const CPF =
      "Precisamos do CPF para emitir a nota fiscal, como a legislação brasileira exige, e seguimos todas as leis de forma transparente, pra sua segurança.";
    it("ensina a frase e ela passa a cadeia", () => {
      teachesAndPasses(CPF);
    });
    it("proíbe outro motivo e afirmação sobre onde o dado fica", () => {
      expect(own(FULL)).toContain("Não invente outro motivo e não diga onde o dado fica ou deixa de ficar guardado.");
    });
    it("a linha existe mesmo sem nenhuma chave nova no config", () => {
      expect(own(base)).toContain(`"${CPF}"`);
    });
  });

  describe("e-mail → pede, e não insiste", () => {
    // The Logzz checkout has no e-mail field (operator, 2026-10-06): "o checkout pede lá" was false.
    it("sem e-mail, não insiste, e não diz que o checkout pede", () => {
      expect(own(FULL)).toContain("Se ela disser que não tem e-mail, não insista.");
      expect(own(FULL)).not.toContain("o checkout pede o e-mail lá");
    });
    it("nunca a mesma pergunta com as mesmas palavras", () => {
      expect(own(FULL)).toContain("Nunca repita a mesma pergunta com as mesmas palavras.");
    });
    it("a recusa de e-mail aceita com calma passa a cadeia", () => {
      expect(blockedOn("Tudo bem, sem problema, não precisa de e-mail agora.", FULL, "cod")).toEqual([]);
    });
  });

  describe("opt-out com pergunta junto", () => {
    it("responde a pergunta e confirma, e quem para é o sistema", () => {
      expect(own(FULL)).toContain(
        "Responda a pergunta em uma frase e confirme que ela não vai receber mais mensagens. Quem para os envios é o sistema.",
      );
    });
    it("a resposta passa a cadeia enquanto o opt-out não foi gravado", () => {
      expect(
        blockedOn("Custa R$ 129,90 pago na entrega, e pode ficar tranquila que você não vai receber mais mensagens.", FULL, "cod"),
      ).toEqual([]);
    });
    // Edge, and the code's job: once `optedOut` is true the `opt_out` gate vetoes every
    // reply, the answer included. Pinned so a change in that contract is seen here.
    it("com o opt-out já gravado, o gate cala a resposta inteira", () => {
      const verdict = runGates("Custa R$ 129,90 pago na entrega.", ctx({ config: FULL, optedOut: true }));
      expect(verdict.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("opt_out");
    });
  });
});

describe("verdades de dinheiro que não mudam com a adaptação", () => {
  it.each(corners)("preço, desconto, frete e emagrecimento seguem no prompt ($name)", ({ config }) => {
    const prompt = flat(build(config));
    expect(prompt).toContain(`Preço: ${money(config.prices.codBrl)} pago na entrega ao entregador`);
    expect(prompt).toContain("NÃO emagrece");
    expect(prompt).toContain("Preço, desconto ou cupom que não existem.");
    if (freeNowhere(config)) expect(prompt).not.toMatch(AFFIRMS_FREE_SHIPPING);
    else if (config.delivery.freeShipping !== true) expect(freeOnlyOnDelivery(prompt)).toBe(true);
  });
});

/**
 * `coverage_claim` (persona round 3, code review 2026-09-24) is active whenever the region
 * lookup did not answer — including the turn that carries the link, where two vetoes send
 * the fallback without it. So every sentence the prompt teaches must pass it with the
 * region unknown, and (trivially) with it known.
 */
describe("toda frase ensinada passa o coverage_claim, com e sem região", () => {
  it.each(corners)("nenhuma frase ensinada afirma cobertura ($name)", ({ config }) => {
    const prompt = flat(build(config));
    const taught = [...new Set([...quotedSentences(prompt), ...exemplars(config).map((e) => e.text)])];
    expect(taught.length).toBeGreaterThan(5);
    for (const regionKnown of [false, true]) {
      for (const text of taught) {
        const trace = runGates(text, ctx({ config, regionKnown })).traces.find((t) => t.gate === "coverage_claim");
        expect({ regionKnown, text, verdict: trace?.verdict }).toEqual({ regionKnown, text, verdict: "pass" });
      }
    }
  });
});

/**
 * H-2 (operator, 2026-09-25): every price tied to its path, pieces, deadline and link, in
 * the agent's head only — Tati got the delivery link after the prepaid price and asked
 * "continua 116?". The rows read the config; nothing from one row belongs to another.
 */
describe("fatos ligados: preço, caminho, peças, prazo e link", () => {
  const withKits: PromptConfig = {
    ...variant(false, true),
    kits: [
      { path: "cod", units: 2, priceBrl: 233.82, discountPercent: 10, checkoutUrl: "https://x/cod2" },
      { path: "prepay", units: 2, priceBrl: 207.84, discountPercent: 20, checkoutUrl: "https://x/pre2" },
    ],
  };

  it("cada linha fica no seu caminho e lê o config", () => {
    const cod = linkFactLine(withKits, "cod");
    const prepay = linkFactLine(withKits, "prepay");
    expect(cod).toContain(money(withKits.prices.codBrl));
    expect(cod).toContain(`${withKits.delivery.codDaysMin} a ${withKits.delivery.codDaysMax} dias`);
    expect(cod).not.toContain(money(withKits.prices.prepayBrl));
    expect(prepay).toContain(money(withKits.prices.prepayBrl));
    expect(prepay).toContain(prepayWindowLine(withKits).replace(/,$/, ""));
    expect(prepay).not.toContain(money(withKits.prices.codBrl));
    expect(prepay).not.toContain(`${withKits.delivery.codDaysMin} a ${withKits.delivery.codDaysMax} dias`);
  });

  it("kit tem a linha do kit; quantidade sem kit não tem linha", () => {
    expect(linkFactLine(withKits, "cod", 2)).toContain("R$ 233,82");
    expect(linkFactLine(withKits, "prepay", 2)).toContain("R$ 207,84");
    expect(linkFactLine(withKits, "cod", 3)).toBeNull();
  });

  it("o prompt traz as linhas como referência interna, nunca como formato de mensagem", () => {
    const prompt = flat(build(withKits));
    expect(prompt).toContain("FATOS LIGADOS — referência sua, NUNCA formato de mensagem.");
    for (const row of [linkFactLine(withKits, "cod"), linkFactLine(withKits, "prepay", 2)]) {
      expect(prompt).toContain(`[${row}]`);
    }
  });

  it("o link só vai quando ela confirma a compra — está escrito no prompt", () => {
    expect(flat(build(withKits))).toContain("O link só vai quando ela confirmar que quer comprar.");
  });
});

/**
 * Product and logistics facts the operator confirmed on 2026-10-06. Every quoted one passes the
 * chain on both paths; the negated ones ("não tem barbatana", "não dá calor", "boleto não tem")
 * are the cases a text heuristic here has always got wrong.
 */
describe("fatos do colete (operador, 2026-10-06)", () => {
  const FACTS = [
    "É essencialmente de poliéster e elastano, tem forro de algodão e colchetes que não ficam enrolando enquanto você usa.",
    "Não dá calor, ele é feito justamente pra respirar no corpo e não te deixar suando.",
    "O quanto você quiser, ele é preparado pra aguentar o dia inteiro!",
    "Sim, ele é elástico e não limita seus movimentos!",
  ];

  it.each(FACTS)("ensina e aprova nos dois caminhos: %s", (text) => teachesAndPasses(`"${text}"`.slice(1, -1)));

  // Negated sentences, said in her words from the facts block.
  it.each([
    "Não tem barbatana nenhuma, nem de metal nem de plástico.",
    "No antecipado o pagamento é no pix ou no cartão, boleto não tem.",
    "Pode sim, sem problemas, outra pessoa pode receber e pagar no seu lugar.",
    "Se ninguém estiver em casa, o entregador leva o pedido de volta pro centro de distribuição e a entrega não acontece, então escolhe uma data em que você vai estar em casa.",
    "No antecipado o envio é pelos Correios ou por transportadora, conforme a região, com código de rastreio.",
    "Você escolhe a forma que deseja pagar na hora da entrega.",
  ])("a frase dita a partir do fato passa nos dois caminhos: %s", (text) => {
    for (const { config } of FULL_CORNERS) {
      for (const p of BOTH) expect({ p, blocked: blockedOn(text, config, p) }).toEqual({ p, blocked: [] });
    }
  });

  it("o bloco diz o que não existe e o que ela não lista", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("Barbatana não tem nenhuma, nem de metal nem de plástico.");
    expect(prompt).toContain("Cor: só preto, por enquanto.");
    expect(prompt).toContain("boleto não tem");
    expect(prompt).toContain("não liste formas de pagamento");
    // The unconfirmed methods are gone from the price line (F14).
    expect(prompt).not.toContain("em dinheiro ou cartão");
  });

  it("confiança: só o site e o e-mail do config, e a chave ausente derruba", () => {
    const withSite = { ...FULL, site: "encorpa-fashion.com.br" };
    expect(productFacts(withSite).join(" ")).toContain("o site, encorpa-fashion.com.br, e o e-mail contato@encorpa-fashion.com.br");
    const { support: _, site: __, ...noMail } = FULL as PromptConfig;
    expect(productFacts(noMail).join(" ")).not.toContain("@");
    expect(productFacts(noMail).join(" ")).toContain("o nosso site");
    expect(own(FULL)).toContain("Não cite Instagram, Reclame Aqui nem dado de empresa que não está aqui.");
  });
});

/**
 * C2 and C10 (operator, 2026-10-06): the link goes after size, CEP, name, e-mail and CPF, and the
 * size is chosen on the checkout page — Logzz and Coinzz both have a selector — not typed in the
 * address complement.
 */
describe("os dados antes do link, e o tamanho escolhido no checkout", () => {
  const withKits: PromptConfig = { ...FULL, kits: EXAMPLE_KITS };

  it.each(corners)("o \"complemento\" e o link antes dos dados saíram ($name)", ({ config }) => {
    const prompt = flat(build({ ...config, kits: EXAMPLE_KITS }));
    expect(prompt).not.toMatch(/complemento/i);
    expect(prompt).not.toContain("mande o link e NÃO peça nome, e-mail nem CPF antes");
    expect(prompt).not.toContain("o link primeiro, nunca o CPF primeiro");
  });

  it("as cinco coisas, a ordem, o CPF recusado duas vezes e o tamanho no checkout", () => {
    const prompt = own(withKits);
    expect(prompt).toContain("Antes do link você precisa de cinco coisas: o tamanho, o CEP, o nome completo, o e-mail e o CPF.");
    expect(prompt).toContain("depois que ela escolher o pagamento, nessa ordem, um por mensagem");
    expect(prompt).toContain("Se ela recusar o CPF duas vezes, não insista: o link vai sem ele e ela digita o CPF no checkout.");
    expect(prompt).toContain(`No checkout ela completa o endereço e escolhe o tamanho dela — diga com o tamanho, tipo "lá você escolhe o M".`);
    expect(prompt).toContain("Você NÃO pede endereço, só o CEP");
  });

  it("as frases do checkout e do CEP recusado passam nos dois caminhos", () => {
    for (const text of [
      "Lá você completa o endereço e escolhe o seu tamanho, o M.",
      "Entendo, e tudo bem. Então te mando o link sem o CPF, e você digita ele direto no checkout.",
      "Pra deixar o pedido no seu nome, me passa seu nome completo?",
    ]) {
      for (const { config } of FULL_CORNERS) {
        for (const p of BOTH) expect({ text, p, blocked: blockedOn(text, config, p) }).toEqual({ text, p, blocked: [] });
      }
    }
  });
});

/** Operator, 2026-10-06: the ad audience is not convinced yet — value and security before the offer. */
describe("público ainda não convencido: valor e segurança antes da oferta", () => {
  it("o prompt diz a ordem e o que afasta", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("Ela veio do anúncio e AINDA NÃO ESTÁ CONVENCIDA.");
    expect(prompt).toContain("só depois vêm a oferta, o preço e os dados");
    expect(prompt).toContain("O CAMINHO DA CONVERSA, que é caminho e não trilho");
  });
});
