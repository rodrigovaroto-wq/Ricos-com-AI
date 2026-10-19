/**
 * Personas venda-curiosa and pago-na-entrega-sim (2026-10-19): "me explica de novo o pagamento" and "não apareceu dia
 * nenhum, vocês não mandam pelo correio?" got four vetoed drafts and heard "me fala de novo o que você quer saber?".
 * With every draft vetoed, her payment question now gets how she pays where she is, from the config.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksPayment, money, paymentFallbackMessage } from "@/agent/prompt.js";
import { runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("pergunta de como paga ou como chega", () => {
  it.each(["me explica de novo o pagamento", "abri aqui e nao apareceu dia nenhum\n\nvcs nao mandam pelo correio", "mas pago na entrega sim", "como faço pra pagar?", "é no antecipado?", "paga pro entregador?"])(
    "lê: %s",
    (t) => expect(asksPayment(t)).toBe(true),
  );
  it.each(["bom dia", "uso 42", "aperta muito?", "tem preto?", "vou pensar", "pagina nao abre", "pode me enviar uma foto?", "vocês mandam foto?", "me envia o link de novo"])("negação — não lê: %s", (t) => expect(asksPayment(t)).toBe(false));
});

describe("a resposta pronta de pagamento passa a cadeia inteira", () => {
  const cases = [
    ["cod", { paymentPath: "cod", regionKnown: true }],
    ["no_cod", { paymentPath: "prepay", codUnavailable: true, regionKnown: true }],
    ["prepay", { paymentPath: "prepay", regionKnown: true }],
    ["both", { paymentPath: "prepay", regionKnown: false }],
    [null, { paymentPath: "cod", regionKnown: false }],
  ] as const;
  it.each(cases)("%s", (where, over) => {
    const text = paymentFallbackMessage(config, where);
    const blocked = runGates(text, ctx({ config, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
    expect(blocked).toEqual([]);
    expect(text).not.toMatch(/me fala de novo/);
  });
  it("cada número vem do config, e o antecipado nunca promete pagar na porta", () => {
    expect(paymentFallbackMessage(config, "cod")).toContain(money(config.prices.codBrl));
    expect(paymentFallbackMessage(config, "both")).toContain(money(config.prices.prepayBrl));
    expect(paymentFallbackMessage(config, "no_cod")).not.toMatch(/entregador|não paga nada agora/);
    // She chose the prepaid: the delivery is never denied to her.
    expect(paymentFallbackMessage(config, "prepay")).not.toMatch(/não tem pagamento na entrega|entregador|não paga nada agora/);
  });
});

describe("o turno usa a resposta de pagamento no lugar do 'me fala de novo'", () => {
  it("antes do genérico, depois do prazo e da oferta", () => {
    expect(turn).toContain("const asksHowToPay = !asksPrice && !asksOffer && !asksWhen && !firstReply && parts.some(asksPayment) && !parts.some(asksPaymentStatus);");
    expect(turn).toContain('paymentFallbackMessage(CONFIG, codUnavailable ? "no_cod" : paymentChoice === "prepay" ? "prepay"');
    expect(turn).toContain("const fallbackIsGeneric = !asksPrice && !asksOffer && !asksWhen && !firstReply && !asksHowToPay;");
    expect(turn.indexOf("? paymentFallbackMessage(CONFIG,")).toBeLessThan(turn.indexOf(": fallbackIsGeneric ? SAFE_FALLBACK_REPLY"));
  });
});
