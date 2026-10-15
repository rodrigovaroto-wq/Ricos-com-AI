import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import type { BusinessConfig } from "@/config/business.js";
import { config, ctx } from "./fixtures.js";

/**
 * Personas de cobertura, 2026-10-15 (R21.6: frase de persona). Dois falsos positivos, cada um vetado 4 vezes.
 * Config: entrega 1-3, antecipado média 5, garantia 7; o antecipado com 10% (R$ 116,91).
 */
const cfg: BusinessConfig = {
  ...config,
  prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10, prepayMaxInstallments: 12 },
  // Produção: a troca é sem custo (R21.3) — sem isso o "troca sem custo" do rascunho é outra mentira, a do warranty_promise.
  returns: { freeExchange: true },
  kits: [
    { path: "prepay", units: 2, priceBrl: 207.84, discountPercent: 20, checkoutUrl: "https://app.coinzz.com.br/checkout/antecipado-2-0" },
    { path: "prepay", units: 3, priceBrl: 272.79, discountPercent: 30, checkoutUrl: "https://app.coinzz.com.br/checkout/antecipado-3-0" },
  ],
};
const blocks = (text: string, paymentPath: "cod" | "prepay", c = cfg) =>
  runGates(text, ctx({ paymentPath, config: c })).traces.filter((t) => t.verdict === "block");
const gates = (text: string, paymentPath: "cod" | "prepay", c = cfg) => blocks(text, paymentPath, c).map((t) => t.gate);

const WARRANTY_DRAFT =
  "Boa tarde, sou a Malu, da Encorpa! Com 42 de calça o seu é o G, pra cintura de 76 a 84 cm.\n\n" +
  "No antecipado dá pra parcelar em até 12x no cartão, e se não servir você troca sem custo em até 7 dias após o recebimento.\n\n" +
  "O valor é R$116,91 com 10% de desconto, o frete é calculado por região e o prazo e o valor aparecem no checkout antes de pagar. " +
  "Levando 2 peças sai por R$ 207,84 e 3 peças por R$ 272,79, quer ficar com 1, 2 ou 3 peças?";

const SHARED_DRAFT =
  "Beatriz Teles, obrigada por perguntar com tanta clareza, e pode ficar tranquila que por aqui peço só o que o pedido precisa.\n\n" +
  "O e-mail serve só pra concluir o pagamento antecipado no checkout, que não segue sem ele, e se preferir não me passar não tem problema, você preenche lá direto quando quiser.\n\n" +
  "Sobre onde ficam guardados, com quem são divididos e por quanto tempo, são informações detalhadas da empresa que eu não tenho aqui, manda um e-mail pra contato@encorpa-fashion.com.br que o time te passa tudo por lá, combinado?\n\n" +
  "E pra eu te ajudar no colete em si, tem alguma roupa que você ama e anda deixando no armário?";

describe("R24 — garantia de troca no antecipado não é o prazo do antecipado", () => {
  it("o rascunho real passa a cadeia inteira no antecipado", () => {
    expect(blocks(WARRANTY_DRAFT, "prepay")).toEqual([]);
  });

  it.each([
    "No antecipado dá pra parcelar em até 12x no cartão, e se não servir você troca sem custo em até 7 dias após o recebimento.",
    "No antecipado você parcela em até 12x, e se não servir você pode trocar em até 7 dias após o recebimento.",
  ])("verdade passa: %s", (text) => {
    for (const p of ["cod", "prepay"] as const) expect(gates(text, p)).not.toContain("delivery_promise");
  });

  it.each([
    "No antecipado chega em 7 dias",
    "No antecipado chega em até 7 dias após o pagamento",
    "No antecipado dá pra parcelar em até 12x, e chega em até 7 dias após o pagamento.",
    "No antecipado dá pra parcelar em até 12x no cartão, e se não servir chega em até 7 dias.",
    "No antecipado dá pra parcelar, e se pagar hoje você recebe em até 7 dias.",
    "No antecipado dá pra parcelar, e se pagar hoje chega em 7 dias pra trocar.",
    "No antecipado dá pra parcelar, e você troca sem custo e chega em até 7 dias.",
    "No antecipado você troca sem custo em até 7 dias pra chegar.",
    "No antecipado você troca sem custo em até 7 dias, e chega rapidinho.",
    "No antecipado ele chega sem custo em até 7 dias.",
  ])("prazo do antecipado continua vetado: %s", (text) => {
    expect(gates(text, "prepay")).toContain("delivery_promise");
  });

  it("sem freeExchange, a troca sem custo continua pega pelo warranty_promise", () => {
    expect(gates(WARRANTY_DRAFT, "prepay", { ...cfg, returns: {} })).toContain("warranty_promise");
  });

  it("garantia mal configurada no texto continua pega pelo warranty_promise", () => {
    const text = "No antecipado dá pra parcelar em até 12x no cartão, e se não servir você troca sem custo em até 30 dias após o recebimento.";
    expect(gates(text, "prepay")).toContain("warranty_promise");
    expect(gates("troca em até 30 dias", "prepay")).toContain("warranty_promise");
  });
});

describe("R24 — 'com quem são divididos' (dados compartilhados) não é parcelamento", () => {
  it("o rascunho real passa a cadeia inteira nos dois caminhos", () => {
    for (const p of ["cod", "prepay"] as const) expect(blocks(SHARED_DRAFT, p)).toEqual([]);
  });

  it.each([
    "com quem os seus dados são divididos",
    "com quem são divididos e por quanto tempo, eu não tenho aqui",
    "são compartilhados ou divididos com quem?",
  ])("verdade passa: %s", (text) => {
    for (const p of ["cod", "prepay"] as const) expect(gates(text, p)).not.toContain("installment_promise");
  });

  it.each([
    "dá pra dividir em 3x na entrega",
    "divide no cartão em 15x",
    "parcela dividida em 12 vezes no pix",
    "dá pra dividir o valor na entrega",
    "o valor pode ser dividido no cartão",
    "com quem quiser, o valor é dividido em 3x na entrega",
    "pode dividir com quem quiser no cartão, em 3 vezes",
  ])("parcelamento continua vetado: %s", (text) => {
    expect(gates(text, "cod")).toContain("installment_promise");
  });
});

describe("R26 — garantia 'com N dias' (persona tudo-de-uma-vez, v25, 15/10)", () => {
  const REAL =
    "Boa tarde, sou a Malu, da Encorpa! Com 42 o seu é o G, pra cintura de 76 a 84 cm\n\n" +
    "No antecipado o frete é calculado por região e aparece no checkout antes de pagar. No cartão antecipado parcela em até 12x. " +
    "O prazo varia por região, em média 5 dias úteis, e a data certinha você confere no checkout\n\n" +
    "Se não servir a troca é sem custo pra você, com 7 dias após o recebimento. Levando 2 peças o desconto sobe para 20%:" +
    " R$ 207,84 no antecipado, e 3 peças R$ 272,79, fica com 1, 2 ou 3 peças?";

  it("o rascunho real não acende delivery_promise no antecipado", () => {
    expect(gates(REAL, "prepay")).not.toContain("delivery_promise");
  });

  it.each([
    "Se não servir a troca é sem custo pra você, com 7 dias após o recebimento.",
    "No antecipado, se não servir você troca sem custo, com 7 dias após o recebimento.",
  ])("verdade passa: %s", (text) => {
    for (const p of ["cod", "prepay"] as const) expect(gates(text, p)).not.toContain("delivery_promise");
  });

  it.each([
    "No antecipado chega com 7 dias",
    "No antecipado chega em até 7 dias",
    "No antecipado ele chega com 7 dias após o pagamento.",
    "No antecipado a troca é sem custo pra você, com 7 dias pra chegar.",
    "No antecipado você troca sem custo, com 7 dias de entrega.",
    "No antecipado a entrega é sem custo pra você, com 7 dias.",
  ])("prazo do antecipado continua vetado: %s", (text) => {
    expect(gates(text, "prepay")).toContain("delivery_promise");
  });
});
