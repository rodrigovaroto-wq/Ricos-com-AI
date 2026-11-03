/**
 * Persona Gisele, 03/11 (grafo §142): "minha vizinha comprou por 99, vc vai cobrar mais caro de mim?" — four honest drafts vetoed and
 * the turn ended on the stock reply. "Você só paga quando receber" names the pay-on-delivery path, not an arrival nor the store receiving
 * reviews: `invented_testimonial` read "receber" as review velocity, `delivery_promise` read it as the 7-day warranty's arrival.
 */
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-11-03.min.json");
const vetoes = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ config: prod, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("você só paga quando receber: o caminho, não chegada nem avaliação recebida", () => {
  it.each([
    "Não é mais caro pra você não, é o melhor valor de hoje, que já saiu de R$ 179,90 pra R$ 109,90 com *FRETE GRÁTIS*!! 🎉\n\nE é qualidade garantida, são mais de 500 clientes satisfeitas e 124 avaliações positivas, e dependendo da sua região você só paga quando receber, então o risco é zero pra você",
    "Não é mais caro pra você não, o valor é o mesmo pra todo mundo, já saiu de R$ 179,90 por R$ 109,90 com *FRETE GRÁTIS*!! 🎉\n\nE é qualidade garantida, com *7 Dias de Garantia* pra devolver se não gostar, e dependendo da sua região você só paga quando receber, então o risco é zero pra você\n\nQuer seguir com o G nesse valor?",
    "São 124 avaliações positivas e você paga só quando receber.",
    // The form the prompt teaches (prompt.ts, followups.ts): "paga quando o colete chegar" (review of 03/11, grafo §143).
    "É qualidade garantida, com 124 avaliações positivas, e você só paga quando o colete chegar.",
    "Com *7 Dias de Garantia* pra devolver se não gostar, e você só paga quando o colete chegar.",
    "Com *7 Dias de Garantia* pra trocar, e você paga quando chega.",
    // prompt.ts:710 and :515, word for word around the warranty.
    "Com *7 Dias de Garantia* pra devolver, e você pode pagar só quando o colete chegar.",
    "São 124 avaliações positivas, e no pagamento na entrega ela só paga quando recebe.",
  ])("os rascunhos reais passam: %s", (s) => expect(vetoes(s)).toEqual([]));

  it.each([
    ["Chega em 7 dias e você só paga quando receber.", "delivery_promise"],
    ["Recebemos 124 avaliações positivas só esta semana.", "invented_testimonial"],
    ["Foram 124 avaliações positivas que recebemos hoje, e você só paga quando receber.", "invented_testimonial"],
    ["Com *7 Dias de Garantia*, e chega quando você receber em 7 dias.", "delivery_promise"],
    ["Com *7 Dias de Garantia*, e você só paga quando receber em 7 dias.", "delivery_promise"],
    ["Com *7 Dias de Garantia*, e você só paga quando o colete chegar daqui 5 dias.", "delivery_promise"],
    ["O colete chega em 7 dias, e você paga quando chegar.", "delivery_promise"],
  ])("negação: prazo e velocidade continuam vetados: %s", (s, gate) => expect(vetoes(s)).toContain(gate));

  it("onde a entrega não chega, a mesma frase é mentira e o charge_promise veta", () => {
    const s = "Com *7 Dias de Garantia* pra devolver se não gostar, e você só paga quando receber.";
    expect(vetoes(s, { codUnavailable: true, paymentPath: "prepay" })).toContain("charge_promise");
    expect(vetoes("E você só paga quando o colete chegar.", { codUnavailable: true, paymentPath: "prepay" })).toContain("charge_promise");
  });
});
