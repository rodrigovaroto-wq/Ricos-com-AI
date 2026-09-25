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
