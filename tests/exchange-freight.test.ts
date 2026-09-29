import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { NEUTRAL_INTERPRETATION, readInterpretation } from "@/agent/interpret.js";
import { exchangeReply } from "@/agent/retry.js";
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

describe("troca de tamanho num pedido: valor e link do Mercado Pago (R17.1)", () => {
  const base = ctx();
  const exchange = { feeBrl: 20, checkoutUrl: "https://mpago.la/troca123" };
  const config = { ...base.config, exchange };
  const receipt = (text: string, exchanging: boolean) =>
    runGates(text, { ...base, config, layer: "auto", paymentPath: "cod", exchanging } as never);

  it("a resposta fixa cita o valor e o link, e passa a cadeia só como resposta da troca", () => {
    const reply = exchangeReply(exchange)!;
    expect(reply).toContain("R$ 20,00");
    expect(reply).toContain("https://mpago.la/troca123");
    expect(receipt(reply, true).traces.filter((t) => t.verdict === "block")).toEqual([]);
    // Anywhere else the amount is a price the shop does not have.
    expect(receipt(reply, false).traces.find((t) => t.gate === "price_promise")?.verdict).toBe("block");
  });

  it("sem valor e link válidos no config não há resposta: a troca vai para uma pessoa", () => {
    for (const e of [
      undefined,
      {},
      { feeBrl: 20 },
      { checkoutUrl: "https://mpago.la/x" },
      { feeBrl: 0, checkoutUrl: "https://mpago.la/x" },
      { feeBrl: "20", checkoutUrl: "https://mpago.la/x" },
      { feeBrl: 20, checkoutUrl: "{{EXCHANGE_MERCADO_PAGO_URL}}" },
      { feeBrl: 20, checkoutUrl: "http://mpago.la/x" },
    ])
      expect(exchangeReply(e as never), JSON.stringify(e)).toBeNull();
  });

  it("o intérprete lê wants_exchange; ausente é false", () => {
    expect(readInterpretation('{"post_sale": true, "wants_exchange": true}').interpretation.wants_exchange).toBe(true);
    expect(readInterpretation('{"post_sale": true}').interpretation.wants_exchange).toBe(false);
    expect(NEUTRAL_INTERPRETATION.wants_exchange).toBe(false);
  });
});

describe("o turno liga a troca (R17.1)", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("só num pedido (post_sale), só quando ela quer trocar, e o recibo é julgado como a resposta da troca", () => {
    expect(source).toContain(
      'const exchange = handoffKind === "post_sale" && interpretation.wants_exchange ? exchangeReply(CONFIG.exchange) : null;',
    );
    expect(source).toContain('return await handOff(exchange, "a cliente quer trocar de tamanho; o link do envio da troca foi enviado", true);');
    expect(source).toContain("      codUnavailable,\n      exchanging,\n    });");
    // Only the exchange reply is judged with `exchanging`.
    expect(source.match(/exchanging/g)?.length).toBe(2);
  });
});

describe("recordOrder com data do pedido ilegível", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("a régua não recebe Invalid Date: cai na chegada do webhook", () => {
    expect(source).toContain("const orderedAt = orderedOn && !Number.isNaN(orderedOn.getTime()) ? orderedOn : new Date();");
    expect(source).not.toContain("const orderedAt = order.orderedAt ? new Date(order.orderedAt) : new Date();");
  });
});
