import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * Propriedade, não exemplo (M-07, quarta revisão). Cada exceção da regra de número do
 * antecipado — recusa, troca, garantia, "você tem 7 dias", "após o recebimento" — é um
 * afrouxamento, e cada rodada de revisão achou a mentira que se escondia atrás da última.
 * Frase de exemplo só prova a frase. Aqui toda combinação de isca × nome do antecipado ×
 * verbo de entrega × número diferente da média (5 no fixture) tem de ser vetada.
 */
const delivery = (text: string, paymentPath: "cod" | "prepay") =>
  runGates(text, ctx({ paymentPath, regionKnown: false })).traces.find((t) => t.gate === "delivery_promise")?.verdict;

const NAMES = ["No antecipado", "No pix", "Pagando antes", "No cartão", "Pagando agora", "No boleto"];
const PROMISES = ["chega em {n} dias", "você recebe em {n} dias", "a entrega sai em {n} dias", "chega em até {n} dias"];
// Iscas: tudo que já liberou uma mentira nesta regra, ou pode.
const BAITS = [
  "{name} {promise}.",
  "{name} com garantia {promise}.",
  "{name} com dinheiro de volta {promise}.",
  "{name} a troca é fácil e {promise}.",
  "{name} {promise} com garantia.",
  "{name} {promise} ou seu dinheiro de volta.",
  "{name} {promise} pra troca.",
  "{name} {promise} depois de receber o pagamento.",
  "{name} {promise} após o recebimento do pagamento.",
  "{name} não demora, {promise}.",
  "{name} não tem como passar de {n} dias.",
  "{name} nunca dá pra demorar mais de {n} dias.",
  "Não posso negar que {name} {promise}.",
  "Não garanto que chegue antes, mas {name} {promise}.",
  "{name} você tem {n} dias pra receber.",
  "{name} há {n} dias de prazo.",
];

const lies: string[] = [];
for (const n of [1, 2, 3, 7, 10])
  for (const name of NAMES)
    for (const promise of PROMISES)
      for (const bait of BAITS)
        lies.push(bait.replaceAll("{promise}", promise).replaceAll("{name}", name).replaceAll("{n}", String(n)).replace(/^./, (c) => c.toUpperCase()));

describe("M-07: nenhuma isca libera prazo do antecipado", () => {
  it(`${new Set(lies).size} mentiras geradas, todas vetadas nos dois caminhos`, () => {
    const passed = [...new Set(lies)].filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block");
    expect(passed.slice(0, 40)).toEqual([]);
  });

  it("e as frases honestas que as exceções existem para liberar continuam passando", () => {
    const honest = [
      "Não consigo garantir 2 dias no antecipado: varia por região, em média 5 dias úteis.",
      "No antecipado não dá pra prometer 2 dias, o prazo varia por região, em média 5 dias úteis.",
      "No antecipado você também tem 7 dias corridos para devolver.",
      "No pix, a garantia é a mesma: 7 dias.",
      "No antecipado você tem 7 dias de prazo pra troca.",
      "Você recebe o reembolso em até 30 dias.",
      "Você tem 7 dias após o recebimento para trocar.",
    ];
    const vetoed = honest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass");
    expect(vetoed).toEqual([]);
    // Fala do pagamento na entrega ("na mão do entregador"): só vale nesse caminho — no
    // antecipado, "1 a 3 dias" é faixa inventada, e a checagem de faixa a veta.
    expect(delivery("Ela paga R$ 129,90 na mão do entregador quando receber em 1 a 3 dias, com 7 dias pra trocar ou devolver se precisar.", "cod")).toBe("pass");
  });
});
