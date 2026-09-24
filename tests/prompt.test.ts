import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import {
  expressLine,
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
    {
      text: `ela não paga nada agora e tem ${c.delivery.warrantyDays} dias após o recebimento pra devolver.`,
      paths: BOTH,
    },
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
    { text: `${c.delivery.warrantyDays} dias após o recebimento para trocar ou devolver.`, paths: BOTH },
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
  { name: "frete pago", config: FULL },
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
  it("o padrão é a mensagem de até uns 30 palavras, e o parágrafo a mais é um balão", () => {
    const prompt = own(FULL);
    expect(prompt).toContain("Por padrão, a mensagem inteira tem até uns 30 palavras.");
    expect(prompt).toContain("abra outro parágrafo, com uma linha em branco entre eles: cada parágrafo chega nela como um balão separado, e são no máximo três");
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

describe("\"vou pensar\": resposta calorosa, sem link inventado", () => {
  const LATER = "Sem problemas, estou aqui se tiver mais alguma dúvida.";

  it("ensina a resposta e ela passa a cadeia nos dois caminhos e nos dois fretes", () => {
    teachesAndPasses(`"${LATER}"`.slice(1, -1));
  });

  it("o prompt diz que o link vai junto sozinho e manda não escrever link", () => {
    expect(own(FULL)).toContain("O link certo do checkout vai junto automaticamente, então não escreva link nenhum.");
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
    expect(prompt).toContain("diga esse tamanho como fato e não troque por outro depois");
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
    it("sem e-mail, não insiste: o link sai e o checkout pede", () => {
      expect(own(FULL)).toContain(
        "Se ela não tiver e-mail ou não quiser dar, não insista: o sistema manda o link mesmo assim e o checkout pede o e-mail lá.",
      );
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
    if (config.delivery.freeShipping !== true) expect(prompt).not.toMatch(AFFIRMS_FREE_SHIPPING);
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
