import { describe, expect, it } from "vitest";
import { scoreRun, type Conversation } from "../src/dev/persona-scorecard.js";

const conv = (persona: string, turns: Array<[string, string, string?]>): Conversation => ({
  persona,
  costBrl: 0.01,
  transcript: turns.flatMap(([customer, malu, status]) => [
    { from: "persona", text: customer },
    { from: "valen", text: malu, status: status ?? "ok" },
  ]),
});
const check = (c: Conversation[], id: string) => scoreRun(c).checks.find((x) => x.id === id)!;

describe("placar: troca de tamanho (M-02)", () => {
  it("conta a troca provocada por 'manequim'", () => {
    const c = conv("marcinha", [
      ["uso 44 de calça", "Pelo que você contou seu tamanho é o G."],
      ["meu manequim é 40", "Então o seu é o M, que fica soltinho."],
    ]);
    expect(check([c], "troca-de-tamanho").value).toBe(1);
  });
  it("não conta a troca que veio de uma medida nova", () => {
    const c = conv("marcinha", [
      ["uso 44 de calça", "Pelo que você contou seu tamanho é o G."],
      ["deu 86 cm na cintura", "Com 86cm o seu é o GG."],
    ]);
    expect(check([c], "troca-de-tamanho").value).toBe(0);
  });
  it("não confunde a cliente citando a Malu com um tamanho novo", () => {
    const c = conv("marcinha", [
      ["uso 44 de calça", "Pelo que você contou seu tamanho é o G."],
      ["como que já fala que é G? meu manequim é 40", "Então o seu é o M."],
    ]);
    expect(check([c], "troca-de-tamanho").value).toBe(1);
  });
  it("não conta a troca pedida com a letra", () => {
    const c = conv("karol", [
      ["uso M", "O seu é o M."],
      ["é pra minha mãe, ela usa G", "Pra sua mãe então é o G."],
    ]);
    expect(check([c], "troca-de-tamanho").value).toBe(0);
  });
  it("não aceita tamanho negado ou número de sapato como dado novo", () => {
    for (const customer of ["não uso 40", "uso sapato 38", "minha cintura é fina"]) {
      const c = conv("karol", [
        ["uso 44 de calça", "Pelo que você contou seu tamanho é o G."],
        [customer, "Então o seu é o M."],
      ]);
      expect(check([c], "troca-de-tamanho").value, customer).toBe(1);
    }
  });
  it("aceita a letra sozinha numa linha como tamanho novo", () => {
    const c = conv("karol", [
      ["uso M", "O seu é o M."],
      ["G\nna verdade é pra minha mãe", "Pra sua mãe então é o G."],
    ]);
    expect(check([c], "troca-de-tamanho").value).toBe(0);
  });
});

describe("placar: perguntas medidas com os detectores da produção (M-04)", () => {
  it("dado já preenchido não é pedido de identidade; pedido de nome é", () => {
    const decided = (malu: string) =>
      conv("cleide", [
        ["uso 44 de calça", "Seu tamanho é o G."],
        ["quero comprar", malu],
      ]);
    expect(check([decided("Seu e-mail já vai preenchido. Quer que eu mande?")], "dados-depois-da-decisao").value).toBe(0);
    expect(check([decided("Me passa seu nome completo?")], "dados-depois-da-decisao").value).toBe(1);
  });
  it("tamanho só mencionado não é pergunta de tamanho", () => {
    const c = conv("tati", [["tá caro", "O tamanho vem certinho. Quer o link?"]]);
    expect(check([c], "tamanho-na-conversa-de-preco").value).toBe(0);
  });
});

describe("placar: link repetido (M-03) e decisão sem link", () => {
  const link = "https://entrega.logzz.com.br/pay/encorpa-pa?name=Ana";
  it("conta o mesmo link em duas respostas seguidas", () => {
    const c = conv("jussara", [["pode mandar", `Aqui: ${link}`], ["vou olhar", `Sem problemas ${link}`]]);
    expect(check([c], "link-repetido").value).toBe(1);
  });
  it("não conta o reenvio que ela pediu, com a mesma regra da produção", () => {
    const c = conv("dupla", [["quero 2", `Aqui: ${link}`], ["me manda o link ja com os 2 tamanhos?", `De novo: ${link}`]]);
    expect(check([c], "link-repetido").value).toBe(0);
  });
  it("não conta um link só", () => {
    const c = conv("jussara", [["pode mandar", `Aqui: ${link}`], ["ok", "Qualquer dúvida estou aqui"]]);
    expect(check([c], "link-repetido").value).toBe(0);
  });
  it("marca quem decidiu e não recebeu o link em duas respostas", () => {
    const c = conv("marcinha", [["vou nesse então", "Me passa seu CEP?"], ["01310-100", "Anotei."]]);
    expect(check([c], "decidiu-e-recebeu-link").value).toBe(1);
  });
});

describe("placar: respostas prontas (M-01) e métricas", () => {
  it("separa a resposta pronta causada por delivery_promise", () => {
    const c: Conversation = {
      persona: "cleide",
      transcript: [
        { from: "persona", text: "demora quanto?" },
        { from: "valen", text: "Deixa eu te responder isso direitinho", status: "fallback", vetoes: [{ gate: "delivery_promise" }] },
      ],
    };
    expect(check([c], "respostas-prontas").value).toBe(1);
    expect(check([c], "pronta-por-prazo").value).toBe(1);
  });
  it("separa a resposta pronta causada por price_promise (M-05)", () => {
    const c: Conversation = {
      persona: "jussara",
      transcript: [
        { from: "persona", text: "é golpe?" },
        { from: "valen", text: "Deixa eu te responder isso direitinho", status: "fallback", vetoes: [{ gate: "price_promise" }] },
      ],
    };
    expect(check([c], "pronta-por-preco").value).toBe(1);
    expect(check([c], "pronta-por-prazo").value).toBe(0);
  });
  it("ignora a recepção automática na contagem de respostas", () => {
    const c: Conversation = {
      persona: "x",
      transcript: [
        { from: "persona", text: "oi" },
        { from: "valen", text: "Oii, tudo bem?", status: "welcomed" },
        { from: "valen", text: "Oi, que bom falar com você.", status: "ok" },
      ],
    };
    expect(scoreRun([c]).metrics.replies).toBe(1);
  });
});

describe("placar de venda (E4.2) e score comercial (E4.4)", async () => {
  const { salesRow, promptNgrams, scoreConversation, scoreSales, ticsIn, copiedFromPrompt, naturalnessProxy } = await import(
    "../src/dev/persona-scorecard.js"
  );
  const { config } = await import("./fixtures.js");
  const ngrams = promptNgrams(config);
  const LINK = "https://entrega.logzz.com.br/pay/encorpa-pa?name=Ana";
  const sale = (turns: Array<[string, string, string?]>, outcome = "bought"): Conversation => ({
    ...conv("venda-teste", turns),
    personaCostBrl: 0.005,
    buyer: { outcome, propensity: 75, cod: true },
  });

  it("caminho feliz: funil inteiro, link na 3ª resposta, comprou", () => {
    const row = salesRow(
      sale([
        ["oi, quanto custa?", "O colete sai R$ 129,90 e você paga na entrega. Que número de calça você usa?"],
        ["uso 42, cep 01310-100", "Seu tamanho é o G. Prefere pagar na entrega?"],
        ["quero pagar na entrega", `Aqui: ${LINK}`],
      ]),
      config,
      ngrams,
    );
    expect(row.reached).toEqual({ price: true, size: true, cep: true, path: true, link: true });
    expect(row).toMatchObject({ bought: true, repliesToLink: 3, questionRate: 0.67, replies: 3, costBrl: 0.015, lies: [], optOutIgnored: [] });
    const scored = scoreConversation(row);
    expect(scored.funnel).toBe(1);
    expect(scored.efficiency).toBe(1);
    expect(scored.barrier).toBe(false);
    expect(scored.score).toBeCloseTo(50 + 20 + 15 * scored.naturalness + 15, 2);
  });

  it("borda: sem link não tem eficiência nem compra; fora da suíte, `bought` é nulo", () => {
    const row = salesRow(conv("persona-tati", [["oi", "Oi! Me conta, o que te trouxe?"]]), config, ngrams);
    expect(row.bought).toBe(null);
    const scored = scoreConversation(row);
    expect(scored.efficiency).toBe(0);
    expect(scored.funnel).toBe(0);
  });

  it("modo de falha: mentira enviada é barreira, mesmo com venda", () => {
    const row = salesRow(sale([["tem desconto?", `Te dou 30% de desconto hoje. ${LINK}`]]), config, ngrams);
    expect(row.lies[0]!.gates.join()).toMatch(/price_promise/);
    expect(scoreConversation(row).barrier).toBe(true);
  });

  it("modo de falha: opt-out explícito ignorado é barreira; respeitado, ou só ambíguo, não", () => {
    const ignored = salesRow(sale([["não quero mais receber nada", "Mas olha, o colete tá R$ 129,90!"]]), config, ngrams);
    expect(ignored.optOutIgnored).toEqual([1]);
    const respected = salesRow(sale([["não quero mais receber nada", "Tudo bem, não te mando mais nada.", "opted_out"]]), config, ngrams);
    expect(respected.optOutIgnored).toEqual([]);
    const ambiguous = salesRow(sale([["não quero agora, obrigada", "Tudo bem! Fico por aqui."]]), config, ngrams);
    expect(ambiguous.optOutIgnored).toEqual([]);
  });

  it("tiques: conta os da lista, com a pontuação que faz o tique", () => {
    expect(ticsIn("Perfeito! Que bom que você veio. Certinho, Entendo, sim")).toBe(3); // "certinho" is no longer a tic (/code-review of E3: the prompt allows it once, fixed texts use it)
    expect(ticsIn("Não entendo bem a sua dúvida. Ficou perfeito.")).toBe(0);
  });

  it("cópia do prompt: 6 palavras seguidas do system prompt contam; 5 não", () => {
    expect(copiedFromPrompt("Olha, assistente virtual só quando você pergunta, tá?", ngrams)).toBe(null);
    expect(copiedFromPrompt("Ela quer se olhar no espelho e gostar do que vê.", ngrams)).not.toBe(null);
  });

  it("razão de palavras usa os balões quando existem", () => {
    const c: Conversation = {
      persona: "venda-x",
      transcript: [
        { from: "persona", text: "oi tudo bem" },
        { from: "valen", text: "a b c d e f", status: "ok", bubbles: ["a b c", "d e f"] },
      ],
    };
    expect(salesRow(c, config, ngrams).wordsRatio).toBe(1);
  });

  it("o juiz (E4.3), quando responde, substitui a naturalidade aproximada", () => {
    const row = salesRow(sale([["oi", "Oi!"]]), config, ngrams);
    expect(scoreConversation(row, () => 0).naturalness).toBe(0);
    expect(scoreConversation(row, () => null).naturalness).toBeCloseTo(naturalnessProxy(row), 3);
  });

  it("resumo da rodada: barreiras e conversão", () => {
    const { summary } = scoreSales(
      [sale([["oi", `Aqui: ${LINK}`]]), sale([["oi", "Te dou 30% de desconto hoje."]], "left_lie")],
      config,
    );
    expect(summary).toMatchObject({ conversations: 2, barriers: 1, lies: 1, conversion: 0.5, linkRate: 0.5, medianRepliesToLink: 1 });
  });
});
