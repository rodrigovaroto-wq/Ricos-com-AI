import { describe, expect, it } from "vitest";
import { runGates, type GateConfig } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import { config, ctx } from "./fixtures.js";

/**
 * Kits de 2 e 3 peças (operador, 2026-09-25). Os preços são os da tela da Coinzz:
 * na entrega 1 = R$ 129,90, 2 = R$ 233,82 (10%), 3 = R$ 311,76 (20%); antecipado
 * 1 = R$ 116,91 (10%), 2 = R$ 207,84 (20%), 3 = R$ 272,79 (30%).
 */
export const configKits = {
  ...config,
  prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
  kits: [
    { path: "cod", units: 2, priceBrl: 233.82, discountPercent: 10, checkoutUrl: "https://app.coinzz.com.br/checkout/na-entrega-2-0" },
    { path: "cod", units: 3, priceBrl: 311.76, discountPercent: 20, checkoutUrl: "https://app.coinzz.com.br/checkout/na-entrega-3-0" },
    { path: "prepay", units: 2, priceBrl: 207.84, discountPercent: 20, checkoutUrl: "https://app.coinzz.com.br/checkout/antecipado-2-0" },
    { path: "prepay", units: 3, priceBrl: 272.79, discountPercent: 30, checkoutUrl: "https://app.coinzz.com.br/checkout/antecipado-3-0" },
  ],
} as const;

const price = (text: string, c: GateConfig = configKits as unknown as GateConfig) =>
  runGates(text, ctx({ config: c as never })).traces.find((t) => t.gate === "price_promise")?.verdict;

describe("kits: preços e percentuais dos kits", () => {
  it("os preços e descontos dos kits passam", () => {
    for (const s of [
      "Levando 2 peças na entrega fica R$ 233,82, com 10% de desconto.",
      "3 peças na entrega saem por R$ 311,76, 20% de desconto.",
      "No antecipado, 2 peças ficam R$ 207,84 (20% de desconto) e 3 peças R$ 272,79 (30%).",
    ])
      expect(price(s), s).toBe("pass");
  });

  it("preço e percentual inventados continuam vetados", () => {
    for (const s of [
      "Levando 2 peças fica R$ 220,00.",
      "3 peças na entrega saem com 25% de desconto.",
      "4 peças com 40% de desconto no antecipado saem por R$ 350,00.",
    ])
      expect(price(s), s).toBe("block");
  });

  it("a economia do kit em reais é vetada, como a do antecipado (saída A)", () => {
    // 2 × 129,90 = 259,80 − 233,82 = 25,98; 3 × 129,90 = 389,70 − 272,79 = 116,91 coincide
    // com um preço configurado e por isso não é distinguível — o teste usa as outras.
    for (const s of ["Levando 2 você economiza R$ 25,98.", "No kit de 3 na entrega você economiza R$ 77,94."])
      expect(price(s), s).toBe("block");
  });

  it("sem kits no config, o preço de kit é inventado", () => {
    expect(price("Levando 2 peças na entrega fica R$ 233,82.", config as unknown as GateConfig)).toBe("block");
  });
});

describe("kits: o prompt ensina a tabela do config", () => {
  const prompt = systemPrompt(configKits as never, [], null).replace(/\s+/g, " ");
  it("cita os preços dos kits e a regra de oferecer uma vez", () => {
    expect(prompt).toContain("R$ 233,82");
    expect(prompt).toContain("R$ 272,79");
    expect(prompt).toContain("uma vez só");
  });
  it("sem kits, não fala de kit", () => {
    expect(systemPrompt(config, [], null)).not.toContain("R$ 233,82");
  });
});

describe("kits: a frase que o prompt ensina passa a cadeia inteira", () => {
  it.each(["cod", "prepay"] as const)("no caminho %s", (paymentPath) => {
    const example = "Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega.";
    expect(systemPrompt(configKits as never, [], null)).toContain(example);
    const r = runGates(example, ctx({ config: configKits as never, paymentPath }));
    expect(r.traces.filter((t) => t.verdict === "block")).toEqual([]);
  });
});
