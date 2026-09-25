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

describe("kits: preço e percentual pertencem ao caminho e à quantidade da frase (pricing-guardian)", () => {
  const priceOn = (s: string, paymentPath: "cod" | "prepay" = "cod") =>
    runGates(s, ctx({ config: configKits as never, paymentPath })).traces.find((t) => t.gate === "price_promise")?.verdict;

  it("fora do caminho ou da quantidade é vetado", () => {
    for (const s of [
      "Na entrega você leva com 30% de desconto.",
      "Levando 1 peça na entrega você tem 20% de desconto.",
      "Levando 1 peça o desconto é de 20%.",
      "3 peças na entrega saem por R$ 272,79.",
      "2 peças no antecipado saem R$ 233,82.",
      "Na entrega, 1 peça sai R$ 116,91.",
    ])
      expect(priceOn(s), s).toBe("block");
  });

  it("comparação com vários caminhos ou quantidades continua passando", () => {
    for (const s of [
      "No antecipado, 2 peças R$ 207,84 (20%) e 3 peças R$ 272,79 (30%).",
      "Na entrega R$ 129,90, no antecipado R$ 116,91 com 10% de desconto.",
      "Levando 3 peças na entrega fica R$ 311,76, com 20% de desconto.",
      "Quem prefere pagar antes paga R$ 116,91 — 10% abaixo do preço da entrega.",
    ])
      expect(priceOn(s), s).toBe("pass");
  });

  it("economia de kit em reais é vetada, com ou sem R$, e mesmo quando coincide com um preço", () => {
    for (const s of [
      "No kit de 3 no antecipado você economiza R$ 116,91.",
      "Levando 2 você economiza 25,98.",
      "No kit de 3 na entrega você economiza 77,94.",
      "Pagando antes o kit de 3 sai 38,97 mais barato.",
    ])
      expect(priceOn(s), s).toBe("block");
  });

  it("o total do antecipado sem o frete é vetado também em frase longa", () => {
    for (const s of ["O total das 3 peças no antecipado fica R$ 272,79.", "No antecipado as 2 peças saem R$ 207,84 no total."])
      expect(priceOn(s, "prepay"), s).toBe("block");
    expect(priceOn("No antecipado as 2 peças saem R$ 207,84 no total, mais o frete.", "prepay")).toBe("pass");
  });

  it("'leve 3 pague 2' é concessão sem número", () => {
    expect(priceOn("Leve 3 e pague 2!")).toBe("block");
  });
});

describe("kits: o exemplo do prompt segue o caminho", () => {
  it("o antecipado tem o seu exemplo, que passa a cadeia", () => {
    const example = "Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado.";
    expect(systemPrompt(configKits as never, [], null)).toContain(example);
    const r = runGates(example, ctx({ config: configKits as never, paymentPath: "prepay" }));
    expect(r.traces.filter((t) => t.verdict === "block")).toEqual([]);
  });
});

describe("kits: o preço de comparação não é a oferta (revisão, 2026-09-25)", () => {
  it("a fala do script do antecipado passa, com e sem kits", () => {
    for (const c of [configKits, { ...configKits, kits: undefined }] as unknown as GateConfig[])
      for (const s of [
        "Pagando antecipado você leva 10% de desconto — R$ 116,91 em vez de R$ 129,90. O frete é calculado no checkout.",
        "Pagando antecipado sai 10% mais barato: R$ 116,91 em vez de R$ 129,90.",
        "No Pix fica R$ 116,91, com 10% de desconto sobre os R$ 129,90.",
        "Pagando agora, cada peça sai R$ 116,91 em vez de R$ 129,90.",
        "No antecipado tem 10% de desconto, a peça sai R$ 116,91 contra R$ 129,90 pagando na hora.",
      ])
        expect(price(s, c), s).toBe("pass");
  });

  it("a oferta da frase continua conferida mesmo com comparação", () => {
    for (const s of [
      "3 peças na entrega saem R$ 272,79 em vez de R$ 389,70.",
      "Na entrega 2 peças saem R$ 207,84 em vez de R$ 259,80.",
    ])
      expect(price(s), s).toBe("block");
  });
});

describe("kits: segunda passada da revisão (2026-09-25)", () => {
  it("comparativo mentiroso continua vetado", () => {
    for (const s of [
      "Na entrega, 3 peças: você paga menos do que R$ 272,79.",
      "Na entrega 3 peças ficam mais barato do que R$ 272,79.",
      "Na entrega 2 peças saem por menos do que R$ 207,84.",
      "Na entrega 3 peças custam R$ 311,76, e sobre os R$ 272,79 você não paga frete.",
      "Na entrega, a peça sai contra R$ 116,91.",
      "R$ 129,90 levando 2 peças na entrega.",
    ])
      expect(price(s), s).toBe("block");
  });

  it("a oferta do kit com o preço de 1 peça antes passa", () => {
    for (const s of [
      "Seu M na entrega fica R$ 129,90, e levando 2 peças sai R$ 233,82.",
      "Na entrega 3 peças saem R$ 311,76 e não R$ 272,79.",
      "No antecipado, 2 peças ficam R$ 207,84 (20% de desconto) e 3 peças R$ 272,79 (30%).",
    ])
      expect(price(s), s).toBe("pass");
  });
});

describe("kits: terceira passada da revisão (2026-09-25)", () => {
  it("comparações honestas de kits passam", () => {
    for (const s of [
      "Na entrega o kit de 2 sai R$ 233,82, e o de 3 R$ 311,76.",
      "Na entrega o kit de 2 sai R$ 233,82 e o de 3 sai R$ 311,76.",
      "Na entrega você leva 2 peças por R$ 233,82 e 3 por R$ 311,76.",
      "Na entrega, 2 peças saem R$ 233,82 e 3 saem R$ 311,76.",
      "Na entrega 2 peças ficam R$ 233,82, e uma sai R$ 129,90.",
      "Na entrega 2 peças ficam R$ 233,82, e a unidade R$ 129,90.",
      "Duas peças na entrega: R$ 233,82, e a peça avulsa R$ 129,90.",
      "Levando 2 peças no antecipado, R$ 207,84, 20% de desconto, e a peça avulsa R$ 116,91.",
      "Na entrega o desconto vai de 10% em 2 peças a 20% em 3 peças.",
      "Na entrega são 10% de desconto em 2 peças e 20% em 3.",
      "No antecipado o desconto é de 20% nas 2 peças e de 30% no kit de 3.",
    ])
      expect(price(s), s).toBe("pass");
  });

  it("quantidade sem kit e percentual sem a palavra desconto são vetados", () => {
    for (const s of [
      "Na entrega 4 peças saem R$ 311,76.",
      "Levando 4 peças na entrega sai R$ 311,76.",
      "Na entrega 4 peças com 20% de desconto.",
      "Na entrega, 2 peças saem R$ 233,82 e o kit de 4 sai R$ 311,76.",
      "Na entrega sai com 30% levando 3 peças.",
    ])
      expect(price(s), s).toBe("block");
  });
});

describe("kits: quarta passada — o gate sabe quantas peças a conversa tem (2026-09-25)", () => {
  const withUnits = (text: string, units: number) =>
    runGates(text, ctx({ config: configKits as never, units } as never)).traces.find((t) => t.gate === "price_promise")?.verdict;

  it("no turno do link do kit, a frase com os tamanhos e o preço do kit passa", () => {
    for (const s of [
      "Seu M e o G da sua mãe saem R$ 233,82 na entrega.",
      "Aqui está o link do kit: seu M e o G saem por R$ 233,82 na entrega.",
      "O kit com seu M e o G sai R$ 233,82 na entrega.",
      "Pronto, seu M e o G da sua irmã ficam R$ 233,82 na entrega, com 10% de desconto.",
    ])
      expect(withUnits(s, 2), s).toBe("pass");
    expect(withUnits("Sua M e a G da sua mãe saem R$ 207,84 no pix.", 2)).toBe("pass");
    expect(withUnits("Seu M, o G e o GG saem R$ 311,76 na entrega, 20% de desconto.", 3)).toBe("pass");
  });

  it("numa conversa de kit, a peça avulsa citada ao lado passa", () => {
    expect(withUnits("Na entrega 2 peças ficam R$ 233,82, e a peça avulsa R$ 129,90.", 2)).toBe("pass");
    expect(withUnits("Na entrega 2 peças ficam R$ 233,82, e uma sai R$ 129,90.", 2)).toBe("pass");
  });

  it("2 peças pelo preço de 1 é vetado, com ou sem contagem na frase", () => {
    expect(withUnits("Seu M e o da sua mãe na entrega saem R$ 129,90.", 2)).toBe("block");
    expect(withUnits("R$ 129,90 levando 2 peças na entrega.", 1)).toBe("block");
  });

  it("preço de kit numa conversa de 1 peça sem contagem é vetado", () => {
    for (const s of ["Na entrega o colete sai R$ 233,82.", "Na entrega sai R$ 311,76."]) expect(withUnits(s, 1), s).toBe("block");
  });

  it("número que não é quantidade não vira quantidade (1 peça)", () => {
    for (const s of [
      "Na entrega sai R$ 129,90, e chega em 2 ou 3 dias.",
      "No antecipado sai R$ 116,91 e dá pra parcelar em 6 no cartão.",
      "No pix fica R$ 116,91, e dá pra dividir em 3 sem juros no cartão.",
      "Na entrega sai R$ 129,90, pagando em 2 cartões se quiser.",
      "Na entrega fica R$ 129,90, e o prazo é o de 3 dias úteis.",
    ])
      expect(withUnits(s, 1), s).toBe("pass");
  });
});

describe("kits: quinta passada — mudar de ideia dentro do kit (2026-09-25)", () => {
  const withUnits = (text: string, units: number) =>
    runGates(text, ctx({ config: configKits as never, units } as never)).traces.find((t) => t.gate === "price_promise")?.verdict;
  it("voltar para uma peça ou subir para três passa", () => {
    for (const s of [
      "Se levar só uma, fica R$ 129,90 na entrega.",
      "Só uma na entrega sai R$ 129,90.",
      "Uma sai R$ 129,90 na entrega, e as duas R$ 233,82.",
      "Levando 3 em vez de 2, na entrega sai R$ 311,76.",
      "Com mais uma, fica R$ 311,76 na entrega.",
      "Com a terceira peça fica R$ 311,76 na entrega, 20% de desconto.",
    ])
      expect(withUnits(s, 2), s).toBe("pass");
  });
  it("e continua vetando o preço trocado", () => {
    expect(withUnits("Se levar só uma, fica R$ 233,82 na entrega.", 2)).toBe("block");
    expect(withUnits("Com mais uma, fica R$ 272,79 na entrega.", 2)).toBe("block");
  });
});

describe("kits: sexta passada (2026-09-25)", () => {
  const gate = (text: string, extra: Record<string, unknown>) =>
    runGates(text, ctx({ config: configKits as never, ...extra } as never)).traces.find((t) => t.gate === "price_promise")?.verdict;

  it("na logística, o total do próprio pedido passa mesmo fora do config", () => {
    expect(gate("Deixa R$ 250,50 separado amanhã.", { stage: "logistics", orderAmountBrl: 250.5 })).toBe("pass");
    expect(gate("Deixa R$ 250,50 separado amanhã.", { stage: "presale" })).toBe("block");
  });

  it("segunda-feira e terceira tentativa não são quantidade", () => {
    for (const s of ["Na segunda eu te mando o link, e na entrega fica R$ 233,82.", "Na terceira tentativa de entrega, você paga R$ 311,76."])
      expect(gate(s, { units: 1 }), s).toBe("block");
  });

  it("peça grátis sem número é concessão (com negação)", () => {
    for (const s of ["A segunda sai de graça na entrega.", "Levando o segundo, ele sai de graça.", "Na entrega, levando 2 você paga só uma.", "Na entrega a segunda é por nossa conta."])
      expect(gate(s, { units: 1 }), s).toBe("block");
    expect(gate("A segunda peça não sai de graça, ela fica no preço do kit.", { units: 1 })).toBe("pass");
  });

  it("num kit, perguntar o preço de um colete tem resposta", () => {
    expect(gate("O colete sai R$ 129,90 na entrega.", { units: 2 })).toBe("pass");
    expect(gate("Se for só um, sai R$ 129,90 na entrega.", { units: 2 })).toBe("pass");
  });
});
