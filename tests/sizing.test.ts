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

  it("extrai o manequim de frases naturais", () => {
    expect(extractDressSize("uso manequim 42")).toBe(42);
    expect(extractDressSize("acho que sou 44, mas não tenho certeza")).toBe(44);
    expect(extractDressSize("visto 38 normalmente")).toBe(38);
  });

  it("não extrai número fora da faixa plausível de manequim", () => {
    expect(extractDressSize("chega em 3 dias")).toBeNull();
    expect(extractDressSize("paguei 129,90 na entrega")).toBeNull();
    expect(extractDressSize("sem número nenhum aqui")).toBeNull();
  });

  it("a lacuna real (R8.4): manequim 42 é M, não G", () => {
    const manequim = extractDressSize("eu sou manequim 42");
    expect(manequim).toBe(42);
    expect(sizeFromDressSize(manequim!)).toBe("M");
  });
});
