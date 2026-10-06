import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * Rodada de personas 2026-10-05 (porta function, agent_version 1): a Malu disse à Lu
 * "já deixo cancelado pra você" — ela não cancela, não estorna e não altera pedido nenhum
 * (R16.9: cancelamento e devolução vão para uma pessoa). Nenhum gate vetava.
 */
const verdict = (text: string, layer: "agent" | "auto" = "agent") =>
  runGates(text, ctx({ layer })).traces.find((t) => t.gate === "order_action_claim")?.verdict;

describe("order_action_claim: dizer que fez algo no pedido", () => {
  it("veta a ação que ela não tem como fazer", () => {
    for (const frase of [
      "Te entendo, Luciana, e já deixo cancelado pra você, tá?",
      "Pronto, cancelei seu pedido.",
      "Vou cancelar o seu pedido agora.",
      "Já cancelo pra você.",
      "Seu pedido foi cancelado, tá?",
      "Seu pedido já está cancelado.",
      "Já fiz o estorno do valor.",
      "Vou estornar o seu pagamento.",
      "Já alterei o endereço do seu pedido.",
      "Troquei o tamanho do seu pedido pro G.",
      "Deixa comigo que eu cancelo.",
    ]) {
      expect(verdict(frase), frase).toBe("block");
    }
  });

  it("deixa passar como ela pode cancelar, a oferta e a negação", () => {
    for (const frase of [
      "Pra cancelar é só escrever pra contato@encorpa-fashion.com.br, tá?",
      "Você pode cancelar até a entrega.",
      "Se não servir, você tem 7 dias pra trocar ou devolver.",
      "Quer que alguém do time te chame pra ver o cancelamento?",
      "Não consigo cancelar por aqui, mas alguém do time te chama.",
      "Eu não tenho como cancelar pedido por aqui.",
      "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.",
    ]) {
      expect(verdict(frase), frase).not.toBe("block");
    }
  });

  it("a linha fixa do código (camada auto) não é lida", () => {
    expect(verdict("Seu pedido foi cancelado, tá?", "auto")).not.toBe("block");
  });
});
