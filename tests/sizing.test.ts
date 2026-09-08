import { describe, expect, it } from "vitest";
import {
  extractDressSize,
  sizeFromDressSize,
  sizeFromLabel,
  sizeFromWaist,
  sizeTable,
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

  it("aceita o manequim, que é o que ela realmente sabe", () => {
    expect(sizeFromDressSize(38)).toBe("P");
    expect(sizeFromDressSize(44)).toBe("G");
    expect(sizeFromDressSize(52)).toBe("XGG");
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

  it("a lacuna real (R8.4): manequim 42 é M, não G", () => {
    const manequim = extractDressSize("eu sou manequim 42");
    expect(manequim).toBe(42);
    expect(sizeFromDressSize(manequim!)).toBe("M");
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
