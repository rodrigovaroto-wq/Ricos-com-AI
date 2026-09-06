import { describe, expect, it } from "vitest";
import { sizeFromDressSize, sizeFromLabel, sizeFromWaist, sizeTable } from "@/agent/sizing.js";

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
});
