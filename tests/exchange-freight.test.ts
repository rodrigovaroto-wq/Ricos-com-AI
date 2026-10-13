import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { NEUTRAL_INTERPRETATION, readInterpretation } from "@/agent/interpret.js";
import { ctx } from "./fixtures.js";

/**
 * R17.1 (operator, 2026-09-29): the size exchange's freight is hers, paid by a Mercado Pago link
 * outside the Coinzz and Logzz checkouts. The return stays free (R16.3). Until today the
 * repository let "a troca é grátis" through (grafo §9, M-08); `warranty_promise` now owns the veto.
 */
const verdict = (text: string): string | undefined =>
  runGates(text, ctx()).traces.find((t) => t.gate === "warranty_promise")?.verdict;

describe("troca de tamanho: o envio é da cliente (R17.1)", () => {
  it("vetada: a troca dita grátis ou sem custo", () => {
    for (const s of [
      "A troca é grátis.",
      "A primeira troca do colete é grátis.",
      "O colete é grátis pra trocar em 7 dias.",
      "A troca de tamanho sai de graça.",
      "Pode trocar de tamanho sem custo nenhum.",
      "Você tem 7 dias pra trocar ou devolver, sem custo nenhum.",
      "Se não servir, a troca não tem custo pra você.",
      "Na troca a gente paga o frete.",
      "A gente paga o frete da troca.",
      "O frete da troca é por nossa conta.",
      "Você não paga nada pela troca.",
      "Não precisa pagar nada na troca de tamanho.",
      "A devolução é sem custo, e a troca também.",
      "Na devolução ou na troca é sem custo.",
      "Trocar de tamanho? Pode sim, custa nada.",
    ])
      expect(verdict(s), s).toBe("block");
  });

  it("passam: a devolução grátis, a troca negada como grátis, a troca sem falar de custo", () => {
    for (const s of [
      "Você tem 7 dias pra devolver, sem custo nenhum pra você.",
      "A devolução é sem custo, e na troca de tamanho o envio é por sua conta.",
      "Você tem 7 dias pra trocar, e a devolução é sem custo.",
      "A troca não é grátis: o envio da troca fica por sua conta.",
      "A troca de tamanho não sai de graça, o envio é seu.",
      "Não existe troca grátis, mas a devolução não tem custo.",
      "Se não servir, você tem 7 dias pra trocar ou devolver.",
      "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Se não servir, você troca em 7 dias.",
      "Leva o dinheiro trocado, o entregador pode não ter troco, e o frete é grátis na entrega.",
    ])
      expect(verdict(s), s).toBe("pass");
  });
});

describe("R$ 27 fora do agente (operador, 2026-10-13): nem valor, nem link do Mercado Pago na troca", () => {
  it("o intérprete lê wants_exchange; ausente é false", () => {
    expect(readInterpretation('{"post_sale": true, "wants_exchange": true}').interpretation.wants_exchange).toBe(true);
    expect(readInterpretation('{"post_sale": true}').interpretation.wants_exchange).toBe(false);
    expect(NEUTRAL_INTERPRETATION.wants_exchange).toBe(false);
  });

  it("o turno não tem mais o ramo do link da troca", () => {
    const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
    const retry = readFileSync(new URL("../src/agent/retry.ts", import.meta.url), "utf8");
    for (const gone of ["exchangeReply", "CONFIG.exchange", "exchanging", "o link do envio da troca foi enviado"]) expect(source, gone).not.toContain(gone);
    expect(retry).not.toContain("exchangeReply");
    expect(retry).not.toContain("Mercado Pago link");
  });
});

describe("recordOrder com data do pedido ilegível", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("a régua não recebe Invalid Date: cai na chegada do webhook", () => {
    expect(source).toContain("const orderedAt = orderedOn && !Number.isNaN(orderedOn.getTime()) ? orderedOn : new Date();");
    expect(source).not.toContain("const orderedAt = order.orderedAt ? new Date(order.orderedAt) : new Date();");
  });
});
