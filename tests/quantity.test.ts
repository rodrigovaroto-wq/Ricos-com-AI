import { describe, expect, it } from "vitest";
import { mergeUnitSizes, NEUTRAL_INTERPRETATION, quantityOf, readInterpretation, saysOwnSize, type Interpretation } from "@/agent/interpret.js";

const said = (units: number | null, unit_sizes: string[] = []): Interpretation =>
  ({ ...NEUTRAL_INTERPRETATION, units, unit_sizes } as Interpretation);

describe("kits: quantas peças ela quer", () => {
  it("o intérprete lê units e unit_sizes, e só letras da tabela", () => {
    const { interpretation } = readInterpretation('{"units": 2, "unit_sizes": ["m", "G", "XL"]}');
    expect(interpretation.units).toBe(2);
    expect(interpretation.unit_sizes).toEqual(["M", "G"]);
    expect(readInterpretation('{"units": "abc"}').interpretation.units).toBeNull();
    expect(readInterpretation('{"unit_pants": [42, "46", 99]}').interpretation.unit_pants).toEqual([42, 46]);
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

  it("a pista negada não conta (revisão de código)", () => {
    expect(quantityOf("não quero kit, só uma", said(2))).toBeNull();
    expect(quantityOf("não quero duas não", said(2))).toBeNull();
    expect(quantityOf("nem precisa do kit de 3", said(3))).toBeNull();
    // A negativa que não nega a quantidade.
    expect(quantityOf("não sei, acho que vou levar duas", said(2))).toEqual({ units: 2, sizes: [] });
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
    // Revisão de código: lista completa + um tamanho reafirmado não apaga a lista.
    expect(mergeUnitSizes(["M", "G"], ["G"], 2)).toEqual(["M", "G"]);
  });
});

describe("kits: achados da revisão de 2026-09-25", () => {
  const own = (letter: string): Interpretation => ({
    ...said(null, [letter]),
    size: { letter, pants: null, waist_cm: null, for_other_person: false },
  }) as Interpretation;

  it("corrigir o próprio tamanho troca a peça dela, não preenche a outra", () => {
    expect(mergeUnitSizes(["M"], ["G"], 2, saysOwnSize("ah, na verdade o meu é G", own("G")))).toEqual(["G"]);
    expect(mergeUnitSizes(["M", "G"], ["GG"], 2, saysOwnSize("errei, a minha é GG", own("GG")))).toEqual(["GG", "G"]);
  });

  it("o tamanho da outra pessoa completa a lista (negação: não é o dela)", () => {
    const other = { ...own("G"), size: { letter: "G", pants: null, waist_cm: null, for_other_person: true } } as Interpretation;
    expect(saysOwnSize("minha irmã usa G", other)).toBe(false);
    expect(saysOwnSize("G", own("G"))).toBe(false);
    expect(mergeUnitSizes(["M"], ["G"], 2, false)).toEqual(["M", "G"]);
  });

  it("o número da calça não é pista de quantidade", () => {
    expect(quantityOf("quero a do 42", said(42))?.units ?? null).toBeNull();
    expect(quantityOf("eu uso 42 e ela usa G", said(2, ["G"]))?.units ?? null).toBeNull();
    expect(quantityOf("uso 2", said(2))?.units ?? null).toBeNull();
    // As pistas verdadeiras continuam valendo.
    expect(quantityOf("quero 2", said(2))?.units).toBe(2);
    expect(quantityOf("quero duas", said(2))?.units).toBe(2);
    expect(quantityOf("preciso de 12 peças", said(12))?.units).toBe(12);
  });
});
