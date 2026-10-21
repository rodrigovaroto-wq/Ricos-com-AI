/**
 * Operator, 2026-10-20: the exchange, return and change-of-address support is the customer service at +55 11 98819-4261,
 * called "o atendimento ao cliente" — never a person's name (it replaced "Gizele", 2026-10-19, and the Logzz support before it).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { systemPrompt, type PromptConfig } from "@/agent/prompt.js";
import { deliveredDirective, logzzReturnReply } from "@/agent/retry.js";
import { config as base, ctx } from "./fixtures.js";

const PHONE = "+55 11 98819-4261";
const withSupport: PromptConfig = { ...base, returns: { logzzSupportPhone: PHONE, freeExchange: true } } as PromptConfig;
const flat = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null).replace(/\s+/g, " ");
const blocked = (text: string, path: "cod" | "prepay", config = withSupport) =>
  runGates(text, ctx({ config, paymentPath: path, layer: "agent" })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("a resposta fixa de troca e devolução", () => {
  const reply = logzzReturnReply(PHONE, 7, true);
  it("manda chamar o atendimento ao cliente no WhatsApp, com o número, inclusive para o endereço", () => {
    expect(reply).toContain(`chamar o nosso atendimento ao cliente no WhatsApp ${PHONE}`);
    expect(reply).toMatch(/mudar o endereço do pedido/);
    expect(reply).not.toMatch(/Logzz|Gizele/);
    expect(reply).toContain("A troca é sem custo pra você.");
  });
  it.each(["cod", "prepay"] as const)("passa a cadeia no caminho %s", (p) => expect(blocked(reply, p)).toEqual([]));
  it("sem a flag da troca sem custo, não promete isso", () => expect(logzzReturnReply(PHONE, 7, false)).not.toContain("sem custo"));
});

describe("o prompt e o pós-venda", () => {
  const EXEMPLAR = `É só chamar o nosso atendimento ao cliente no WhatsApp ${PHONE} e pedir a troca ou a devolução, que eles resolvem pra você.`;
  it("ensina o atendimento ao cliente, sem nome, a frase passa a cadeia, e o endereço de um pedido feito vai para lá", () => {
    const prompt = flat(withSupport);
    expect(prompt).toContain(EXEMPLAR);
    expect(prompt).toContain("Nunca diga o nome de quem atende.");
    expect(prompt).toContain("Você não muda o endereço de um pedido feito.");
    expect(prompt).toContain(`"É só chamar o nosso atendimento ao cliente no WhatsApp ${PHONE}, que eles mudam o endereço pra você."`);
    expect(prompt).toContain("terminam no número, com ponto final: nunca viram pergunta.");
    for (const p of ["cod", "prepay"] as const) expect(blocked(`É só chamar o nosso atendimento ao cliente no WhatsApp ${PHONE}, que eles mudam o endereço pra você.`, p)).toEqual([]);
    expect(prompt).not.toMatch(/Gizele|suporte da Logzz/);
    for (const p of ["cod", "prepay"] as const) expect(blocked(EXEMPLAR, p)).toEqual([]);
  });
  it("negação — sem o número, nada do atendimento", () => {
    expect(flat({ ...withSupport, returns: {} } as PromptConfig)).not.toContain("atendimento ao cliente no WhatsApp");
  });
  it("o pedido entregue com problema manda para o atendimento ao cliente", () => {
    const d = deliveredDirective([], new Date(), PHONE);
    expect(d).toContain(`com o atendimento ao cliente no WhatsApp ${PHONE}`);
    expect(d).not.toMatch(/Logzz|Gizele/);
  });
  it("a turn chama os dois sem nome", () => {
    expect(turn).toContain("logzzReturnReply(logzzPhone, CONFIG.delivery.warrantyDays, CONFIG.returns?.freeExchange === true)");
    expect(turn).toContain("deliveredDirective(orders, new Date(), logzzPhone)");
  });
});
