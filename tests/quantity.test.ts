import { describe, expect, it } from "vitest";
import { mergeUnitSizes, NEUTRAL_INTERPRETATION, quantityOf, readInterpretation, type Interpretation } from "@/agent/interpret.js";

const said = (units: number | null, unit_sizes: string[] = []): Interpretation =>
  ({ ...NEUTRAL_INTERPRETATION, units, unit_sizes } as Interpretation);

describe("kits: quantas peças ela quer", () => {
  it("o intérprete lê units e unit_sizes, e só letras da tabela", () => {
    const { interpretation } = readInterpretation('{"units": 2, "unit_sizes": ["m", "G", "XL"]}');
    expect(interpretation.units).toBe(2);
    expect(interpretation.unit_sizes).toEqual(["M", "G"]);
    expect(readInterpretation('{"units": "abc"}').interpretation.units).toBeNull();
  });

  it("mais de uma peça só com pista de quantidade no texto dela", () => {
    expect(quantityOf("quero 2", said(2))).toEqual({ units: 2, sizes: [] });
    expect(quantityOf("vou levar duas, um M e um G", said(2, ["M", "G"]))).toEqual({ units: 2, sizes: ["M", "G"] });
    expect(quantityOf("quero um pra mim e outro pra minha mãe", said(2))).toEqual({ units: 2, sizes: [] });
    expect(quantityOf("me manda o kit de 3", said(3))).toEqual({ units: 3, sizes: [] });
    // O modelo inventou a quantidade: o texto não fala de mais de uma peça.
    expect(quantityOf("quero o M", said(2))).toBeNull();
    expect(quantityOf("sim pode ser", said(3))).toBeNull();
  });

  it("uma peça, e só os tamanhos, passam sem pista", () => {
    expect(quantityOf("só uma mesmo", said(1))).toEqual({ units: 1, sizes: [] });
    expect(quantityOf("M e G", said(null, ["M", "G"]))).toEqual({ units: null, sizes: ["M", "G"] });
  });
});

describe("kits: os tamanhos de cada peça se acumulam", () => {
  it("completa, acrescenta e substitui", () => {
    expect(mergeUnitSizes([], ["M", "G"], 2)).toEqual(["M", "G"]);
    expect(mergeUnitSizes(["M"], ["G"], 2)).toEqual(["M", "G"]);
    expect(mergeUnitSizes(["M", "G"], ["GG", "GG"], 2)).toEqual(["GG", "GG"]);
    expect(mergeUnitSizes(["M", "G"], ["P"], 2)).toEqual(["P"]);
  });
});
