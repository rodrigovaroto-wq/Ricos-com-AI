import { describe, expect, it } from "vitest";
import { armOf, armOn } from "@/agent/experiments.js";

/** E2.3: the arm of each lead — stable, balanced, and the two experiments independent. */
describe("braço A/B por lead", () => {
  const phones = Array.from({ length: 1000 }, (_, i) => `55119${String(70000000 + i * 7919).padStart(8, "0")}`);
  const arms = phones.map(armOf);

  it("estável: o mesmo telefone cai sempre no mesmo braço", () => {
    expect(phones.map(armOf)).toEqual(arms);
    expect(armOf("5511999998888")).toEqual(armOf("5511999998888"));
  });

  it("equilibrado: ~50/50 em 1.000 telefones, nos dois experimentos", () => {
    for (const k of ["A", "B"] as const) {
      const ones = arms.filter((a) => a[k] === 1).length;
      expect(ones).toBeGreaterThan(450);
      expect(ones).toBeLessThan(550);
    }
  });

  it("independentes: a correlação entre A e B fica perto de 0", () => {
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const a = arms.map((x) => x.A);
    const b = arms.map((x) => x.B);
    const [ma, mb] = [mean(a), mean(b)];
    const cov = mean(a.map((x, i) => (x - ma) * (b[i]! - mb)));
    const corr = cov / Math.sqrt(mean(a.map((x) => (x - ma) ** 2)) * mean(b.map((x) => (x - mb) ** 2)));
    expect(Math.abs(corr)).toBeLessThan(0.1);
  });

  it("só 0 ou 1", () => {
    for (const a of arms) {
      expect([0, 1]).toContain(a.A);
      expect([0, 1]).toContain(a.B);
    }
  });
});

describe("armOn: experimento no ar E braço 1", () => {
  const one = { A: 1, B: 1 } as const;
  it("config sem experiments (o secret de hoje) = ninguém em teste", () => {
    expect(armOn(undefined, one, "A")).toBe(false);
    expect(armOn({}, one, "B")).toBe(false);
  });
  it("experimento desligado ou braço 0 = comportamento de hoje", () => {
    expect(armOn({ fastOpening: false }, one, "A")).toBe(false);
    expect(armOn({ fastOpening: true }, { A: 0, B: 1 }, "A")).toBe(false);
    expect(armOn({ fastOpening: true }, null, "A")).toBe(false);
  });
  it("A liga fastOpening, B liga linkAfterChoice, cada um só o seu", () => {
    expect(armOn({ fastOpening: true }, one, "A")).toBe(true);
    expect(armOn({ fastOpening: true }, one, "B")).toBe(false);
    expect(armOn({ linkAfterChoice: true }, one, "B")).toBe(true);
    expect(armOn({ linkAfterChoice: true }, one, "A")).toBe(false);
  });
});
