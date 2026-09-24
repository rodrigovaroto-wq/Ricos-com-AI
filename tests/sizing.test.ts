import { describe, expect, it } from "vitest";
import {
  asksForSize,
  extractDressSize,
  extractSizeLetter,
  sizeFromDressSize,
  sizeFromInterpreted,
  sizeFromLabel,
  sizeFromWaist,
  sizeTable,
  statedSizeOf,
} from "@/agent/sizing.js";

describe("recomendação de tamanho", () => {
  it("traduz o sistema de fora para o nosso", () => {
    expect(sizeFromLabel("L")).toBe("G");
    expect(sizeFromLabel("XL")).toBe("GG");
    expect(sizeFromLabel("2XL")).toBe("XGG");
    expect(sizeFromLabel("3xl")).toBe("XGG");
  });

  it("devolve nulo para rótulo que não existe", () => {
    expect(sizeFromLabel("XS")).toBeNull();
  });

  it("na fronteira entre dois, escolhe o maior", () => {
    expect(sizeFromWaist(76)).toBe("G");
    expect(sizeFromWaist(84)).toBe("GG");
    expect(sizeFromWaist(68)).toBe("M");
  });

  it("cobre os extremos sem deixar cliente sem tamanho", () => {
    expect(sizeFromWaist(55)).toBe("P");
    expect(sizeFromWaist(130)).toBe("XGG");
  });

  it("aceita o tamanho de roupa, que é o que ela realmente sabe", () => {
    expect(sizeFromDressSize(36)).toBe("P");
    expect(sizeFromDressSize(44)).toBe("G");
    expect(sizeFromDressSize(52)).toBe("XGG");
  });

  /**
   * A tabela do código discordava da tabela publicada (`Offer.tsx` :16-20, repetida na
   * base de conhecimento): 42 virava M quando o site prometia G, e 46 virava G quando o
   * site prometia GG. Um tamanho **menor** que o anunciado, em todo degrau par — e
   * tamanho menor em COD é devolução, que é o frete inteiro perdido.
   */
  it("bate degrau a degrau com a tabela que o site publica", () => {
    const publicada: Array<[number, string]> = [
      [34, "P"], [36, "P"],
      [38, "M"], [40, "M"],
      [42, "G"], [44, "G"],
      [46, "GG"], [48, "GG"],
      [50, "XGG"], [52, "XGG"],
    ];
    for (const [numero, esperado] of publicada) {
      expect(`${numero} → ${sizeFromDressSize(numero)}`).toBe(`${numero} → ${esperado}`);
    }
  });

  it("entre duas linhas, o maior vence — igual à regra da cintura", () => {
    expect(sizeFromDressSize(37)).toBe("M");
    expect(sizeFromDressSize(41)).toBe("G");
    expect(sizeFromDressSize(45)).toBe("GG");
    expect(sizeFromDressSize(54)).toBe("XGG");
  });

  it("a tabela lista os cinco tamanhos", () => {
    expect(sizeTable().split("\n")).toHaveLength(5);
  });

  it("extrai o manequim quando a frase o apresenta como tamanho", () => {
    expect(extractDressSize("uso manequim 42")).toBe(42);
    expect(extractDressSize("visto 38 normalmente")).toBe(38);
    expect(extractDressSize("meu tamanho é 46")).toBe(46);
  });

  it("aceita o número sozinho, que é como se responde 'qual seu manequim?'", () => {
    expect(extractDressSize("44")).toBe(44);
    expect(extractDressSize(" 40 ")).toBe(40);
    expect(extractDressSize("12")).toBeNull();
  });

  it("não extrai número fora da faixa plausível de manequim", () => {
    expect(extractDressSize("chega em 3 dias")).toBeNull();
    expect(extractDressSize("paguei 129,90 na entrega")).toBeNull();
    expect(extractDressSize("sem número nenhum aqui")).toBeNull();
  });

  // Aconteceu em produção: o classificador de intenção chamou isto de TAMANHO
  // — e estava certo, ela pergunta se serve pra ela — e a idade virou manequim.
  it("a unidade manda: idade, peso e medida não são manequim", () => {
    expect(extractDressSize("tenho 44 anos, esse colete serve pra mim?")).toBeNull();
    expect(extractDressSize("peso 52 kg")).toBeNull();
    expect(extractDressSize("minha cintura tem 38 cm")).toBeNull();
    expect(extractDressSize("custa 40 reais o frete?")).toBeNull();
  });

  it("um número sem contexto de tamanho não vira tamanho", () => {
    expect(extractDressSize("moro no apartamento 42")).toBeNull();
    expect(extractDressSize("me chama depois das 38")).toBeNull();
  });

  it("a lacuna real (R8.4): o número vira tamanho pela tabela, não pelo modelo", () => {
    const numero = extractDressSize("eu uso 42 de calça");
    expect(numero).toBe(42);
    expect(sizeFromDressSize(numero!)).toBe("G");
  });

  /**
   * Sapato usa os mesmos números que roupa, e "calço" é uma letra de distância de
   * "calça". Ler o pé como cintura escreve o tamanho errado no banco, e ele sobrevive
   * à conversa.
   */
  it("pé não é cintura", () => {
    expect(extractDressSize("calço 38")).toBeNull();
    expect(extractDressSize("uso 38 de sapato")).toBeNull();
    expect(extractDressSize("meu tênis é 37")).toBeNull();
    expect(extractDressSize("uso 38 de calça")).toBe(38);
  });

  /** Como as clientes realmente falam — sem a palavra "manequim". */
  it("entende as frases que as clientes de fato escrevem", () => {
    expect(extractDressSize("eu uso 44 de calça")).toBe(44);
    expect(extractDressSize("visto 46 de vestido")).toBe(46);
    expect(extractDressSize("meu tamanho é 40")).toBe(40);
    expect(extractDressSize("sou 48")).toBe(48);
    expect(extractDressSize("uso blusa 42")).toBe(42);
  });
});

/**
 * A mesma cegueira a negação que a cadeia de guardrails já pagou duas vezes, aqui no
 * módulo cuja saída sobrevive à conversa: `leads.size` é o que a régua de pós-pedido
 * lê de volta, e tamanho errado em COD é devolução.
 */
describe("a pista de tamanho negada não conta", () => {
  it("lê o manequim que ela usa, não o que ela nega", () => {
    expect(extractDressSize("não uso 40, uso 46")).toBe(46);
    expect(extractDressSize("não visto 38, visto 44")).toBe(44);
  });

  it("e uma negação sozinha não vira tamanho nenhum", () => {
    expect(extractDressSize("não uso 40")).toBeNull();
  });
});

/**
 * Karol, personas R2 (2026-09-24): "G" numa linha e "ela usa G 46 de calca" noutra, e o M
 * de dois turnos antes ficou. A letra não era lida, e "usa" não era deixa.
 */
describe("tamanho dito como letra, e o que o intérprete leu", () => {
  it("lê a letra sozinha numa linha, e com a deixa de uso", () => {
    expect(extractSizeLetter("G\n\nna verdade nao e pra mim, e pra minha mae")).toBe("G");
    expect(extractSizeLetter("uso M")).toBe("M");
    expect(extractSizeLetter("ela usa GG")).toBe("GG");
    expect(extractSizeLetter("tamanho p")).toBe("P");
  });

  it("não lê letra solta no meio da frase, nem a negada", () => {
    expect(extractSizeLetter("oi, m")).toBeNull();
    expect(extractSizeLetter("vou ver o g da questão")).toBeNull();
    expect(extractSizeLetter("não uso M, uso G")).toBe("G");
    expect(extractSizeLetter("nunca usei G")).toBeNull();
  });

  it("\"ela usa\" é deixa para a calça, como \"uso\"", () => {
    expect(extractDressSize("pera ela usa G 46 de calca")).toBe(46);
    expect(extractDressSize("ela usa 40")).toBe(40);
    expect(extractDressSize("ela usa 38 de sapato")).toBeNull();
  });

  it("letra e calça juntas: vale o maior, a regra da própria tabela", () => {
    // 46 de calça é GG na tabela publicada; a letra G é menor. Folgado veste, apertado volta.
    expect(statedSizeOf("pera ela usa G 46 de calca")).toBe("GG");
    expect(statedSizeOf("é pra minha mãe, ela usa G, 46")).toBe("GG");
    expect(statedSizeOf("uso M, 38 de calça")).toBe("M");
  });

  it("o intérprete é a reserva: só vale quando o leitor determinístico não achou nada", () => {
    const lido = { letter: "G", pants: null, waist_cm: null };
    expect(statedSizeOf("é pra minha mãe, aquele tamanho grande", lido)).toBe("G");
    expect(statedSizeOf("uso 38", { letter: "XGG", pants: null, waist_cm: null })).toBe("M");
    expect(statedSizeOf("minha cintura tem uns 80", { letter: null, pants: null, waist_cm: 80 })).toBe("G");
    expect(statedSizeOf("tenho 44 anos", null)).toBeNull();
    expect(statedSizeOf("oi", { letter: null, pants: null, waist_cm: null })).toBeNull();
  });

  it("o que o intérprete leu passa pela tabela, e o maior vence", () => {
    expect(sizeFromInterpreted({ letter: null, pants: 42, waist_cm: null })).toBe("G");
    expect(sizeFromInterpreted({ letter: "M", pants: null, waist_cm: 90 })).toBe("GG");
    expect(sizeFromInterpreted({ letter: "banana", pants: null, waist_cm: null })).toBeNull();
  });
});

describe("a Malu perguntou o tamanho?", () => {
  it("reconhece a pergunta do tamanho", () => {
    expect(asksForSize("Qual número de calça você usa?")).toBe(true);
    expect(asksForSize("Me conta, que tamanho você veste?")).toBe(true);
    expect(asksForSize("Desculpa, não entendi, qual o tamanho que deseja?")).toBe(true);
  });

  it("tamanho mencionado não é pergunta, e a pergunta de outra coisa também não", () => {
    expect(asksForSize("Pro 38 o seu é o M, que veste bem. Me passa seu CEP?")).toBe(false);
    expect(asksForSize("O seu tamanho é G.")).toBe(false);
    expect(asksForSize("Posso seguir com o pedido?")).toBe(false);
  });
});

/**
 * Code review, 2026-09-24: uma PERGUNTA sobre tamanho sobrescrevia o tamanho guardado. O
 * caminho rápido ignora frases que terminam em "?"; a leitura do intérprete fica com elas.
 */
describe("pergunta sobre tamanho não é tamanho dito", () => {
  it("as perguntas não mudam o tamanho pelo caminho rápido", () => {
    for (const pergunta of [
      "tem tamanho GG?",
      "tem no tamanho G?",
      "tem pra quem usa 50?",
      "qual tamanho p/ minha mãe?",
      "o tamanho m serve em quem usa 44?",
    ]) {
      expect(statedSizeOf(pergunta), pergunta).toBeNull();
    }
  });

  it("a afirmação na mesma mensagem ainda conta", () => {
    expect(statedSizeOf("uso 44 de calça\ntem GG?")).toBe("G");
    expect(statedSizeOf("ela usa G. tem pra entrega amanhã?")).toBe("G");
    expect(statedSizeOf("tamanho M")).toBe("M");
  });

  it("numa pergunta, só o que o intérprete leu como afirmado vale", () => {
    const nada = { letter: null, pants: null, waist_cm: null };
    expect(statedSizeOf("tem tamanho GG?", nada)).toBeNull();
  });
});

/** Code review, 2026-09-24: no WhatsApp a pergunta muitas vezes vem sem "?". */
describe("pergunta sobre tamanho sem ponto de interrogação", () => {
  it("as cinco perguntas sem \"?\" não mudam o tamanho pelo caminho rápido", () => {
    for (const pergunta of [
      "tem tamanho GG",
      "vcs tem o tamanho G",
      "tem pra quem usa 50",
      "qual tamanho pra quem usa 44",
      "o M serve pra quem veste 44",
    ]) {
      expect(statedSizeOf(pergunta), pergunta).toBeNull();
    }
  });

  it("a afirmação dela continua valendo", () => {
    expect(statedSizeOf("uso 46 de calça")).toBe("GG");
    expect(statedSizeOf("ela usa G, 46")).toBe("GG");
    expect(statedSizeOf("é pra minha mãe, ela usa G")).toBe("G");
    expect(statedSizeOf("uso 38, tem GG")).toBe("M");
  });
});

/** Persona round 3 (2026-09-24, Neusa): pergunta que menciona tamanho não é pergunta do tamanho. */
describe("rodada 3: a pergunta tem de ser SOBRE o tamanho", () => {
  it("mencionar tamanho numa pergunta de outra coisa não conta", () => {
    expect(
      asksForSize("Combinado, fico por aqui pra ajudar com tamanho ou pedido, quer que eu te explique rapidinho como funciona a troca?"),
    ).toBe(false);
    expect(asksForSize("Você usa cartão ou pix?")).toBe(false);
  });

  it("as perguntas do tamanho continuam contando", () => {
    for (const q of [
      "Qual tamanho de calça te deixa mais à vontade no dia a dia?",
      "Me diz só que número de calça você veste e fica confortável?",
      "Me conta qual calça você pega sem nem precisar provar, que já sabe que serve?",
      "Qual a sua cintura em cm?",
    ]) {
      expect(asksForSize(q), q).toBe(true);
    }
  });
});

describe("pergunta do tamanho: seu número sim, cintura solta não", () => {
  it("\"me fala seu número de calça?\" pergunta o tamanho", () => {
    expect(asksForSize("Me fala seu número de calça?")).toBe(true);
    expect(asksForSize("Qual a sua cintura?")).toBe(true);
  });

  it("mencionar a cintura não é perguntar o tamanho", () => {
    expect(asksForSize("Quer que eu explique como fica na cintura?")).toBe(false);
    expect(asksForSize("Ele modela a cintura sem apertar, quer saber mais?")).toBe(false);
  });
});
