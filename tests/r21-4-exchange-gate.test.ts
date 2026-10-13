/**
 * R21.4 (operator, 2026-10-13): the R$ 27 and the Mercado Pago link of the size exchange left the agent.
 * The gate briefing stops teaching "o valor e o link vão numa mensagem à parte", no exchange fee is an
 * allowed price anywhere, and "após o recebimento do produto" is the warranty's start, not an arrival.
 */
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates, type GateConfig } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const blocks = (text: string, paymentPath: "cod" | "prepay" = "cod", c: GateConfig = config) =>
  runGates(text, ctx({ config: c, paymentPath })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("R21.4: no exchange fee, no link", () => {
  it("the briefing says nothing of the exchange's freight without freeExchange", () => {
    const all = gateBriefing(config).join("\n");
    expect(all).toContain("Do envio da troca de tamanho não fale nada: nem valor, nem que é por conta dela, nem que é grátis.");
    expect(all).not.toMatch(/link de pagamento|mensagem à parte|R\$ ?27/);
    expect(gateBriefing({ ...config, returns: { freeExchange: true } }).join("\n")).not.toContain("Do envio da troca");
  });

  it.each(["A troca custa R$ 27.", "O envio da troca custa R$ 27,00."])("an exchange fee is an invented price: %s", (s) => {
    for (const p of ["cod", "prepay"] as const) expect(blocks(s, p)).toContain("price_promise");
  });

  it("an `exchange` block left in an old secret allows no price", () => {
    const stale = { ...config, exchange: { feeBrl: 27, checkoutUrl: "https://mpago.la/x" } } as GateConfig;
    expect(runGates("A troca custa R$ 27.", { ...ctx({ config: stale }), exchanging: true } as never).traces.find((t) => t.gate === "price_promise")?.verdict).toBe("block");
  });
});

describe("delivery_promise: the warranty's start may name what she received", () => {
  it.each([
    "A garantia é de 7 dias após o recebimento do produto.",
    "Você tem 7 dias após o recebimento do produto pra trocar.",
    "A garantia é de 7 dias após o recebimento do colete.",
    "Você tem 7 dias após o recebimento da peça pra trocar ou devolver.",
    "A garantia é de 7 dias após o recebimento do pedido.",
    "Você tem 7 dias após a entrega do colete pra trocar.",
    "A garantia é de 7 dias após a entrega do produto.",
  ])("passa: %s", (s) => {
    for (const p of ["cod", "prepay"] as const) expect(blocks(s, p)).toEqual([]);
  });

  it.each([
    "Chega em 7 dias após o recebimento do pedido.",
    "A garantia é de 7 dias após o recebimento do produto, e chega em 7 dias.",
    "A garantia é de 7 dias após o recebimento do produto pra chegar.",
    "A garantia é de 7 dias após o recebimento do produto e o envio é rapidinho.",
    "A garantia é de 30 dias após o recebimento do produto.",
    "Você tem 7 dias após o recebimento do produto em casa.",
    "A garantia é de 7 dias após a entrega do produto, que chega em 7 dias.",
    "Chega em 7 dias após a entrega do pedido.",
    "A troca é em 7 dias após a entrega do pedido, e a entrega também.",
  ])("veta: %s", (s) => {
    for (const p of ["cod", "prepay"] as const) expect(blocks(s, p).length).toBeGreaterThan(0);
  });
});
