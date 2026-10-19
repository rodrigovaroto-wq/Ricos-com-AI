/**
 * Operator, 2026-10-19: the exchange, return and change-of-address support is Gizele, +55 11 97727-9391. Malu tells the customer to call
 * her on WhatsApp. The name is a config key (`returns.supportName`), optional: absent, the line stays "o suporte da Logzz".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { supportName, systemPrompt, type PromptConfig } from "@/agent/prompt.js";
import { deliveredDirective, logzzReturnReply } from "@/agent/retry.js";
import { config as base, ctx } from "./fixtures.js";

const PHONE = "+55 11 97727-9391";
const withGizele: PromptConfig = { ...base, returns: { logzzSupportPhone: PHONE, supportName: "Gizele", freeExchange: true } } as PromptConfig;
const flat = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null).replace(/\s+/g, " ");
const blocked = (text: string, path: "cod" | "prepay", config = withGizele) =>
  runGates(text, ctx({ config, paymentPath: path, layer: "agent" })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("o nome do suporte", () => {
  it.each(["Gizele", " Gizele ", "Maria José", "D'Ávila"])("lê: %s", (n) => expect(supportName({ returns: { supportName: n } })).toBe(n.trim()));
  it.each([undefined, "", " ", "{{SUPPORT_NAME}}", "G", 5, null, "Gizele 11 97727", "a".repeat(41)])("negação — não é um nome: %s", (n) =>
    expect(supportName({ returns: { supportName: n } })).toBeNull());
});

describe("a resposta fixa de troca e devolução", () => {
  const reply = logzzReturnReply(PHONE, 7, true, "Gizele");
  it("manda chamar a Gizele no WhatsApp, com o número, e diz que ela dá o suporte, inclusive o endereço", () => {
    expect(reply).toContain("chamar a Gizele no WhatsApp +55 11 97727-9391");
    expect(reply).toMatch(/mudar o endereço do pedido/);
    expect(reply).toContain("Ela dá todo o suporte");
    expect(reply).not.toMatch(/Logzz/);
    expect(reply).toContain("A troca é sem custo pra você.");
  });
  it.each(["cod", "prepay"] as const)("passa a cadeia no caminho %s", (p) => expect(blocked(reply, p)).toEqual([]));
  it("negação — sem o nome, a frase de antes", () => {
    const old = logzzReturnReply(PHONE, 7, false);
    expect(old).toContain("suporte da Logzz");
    expect(old).not.toMatch(/Gizele|endereço/);
  });
  it("sem a flag da troca sem custo, a frase com o nome continua sem prometer isso", () => {
    expect(logzzReturnReply(PHONE, 7, false, "Gizele")).not.toContain("sem custo");
  });
});

describe("o prompt e o pós-venda", () => {
  const EXEMPLAR = `É só chamar a Gizele no WhatsApp ${PHONE} e pedir a troca ou a devolução, que ela resolve pra você.`;
  it("ensina a Gizele, a frase passa a cadeia, e o endereço de um pedido feito vai para ela", () => {
    const prompt = flat(withGizele);
    expect(prompt).toContain(EXEMPLAR);
    expect(prompt).toContain("mudança de endereço de um pedido são com a Gizele");
    expect(prompt).toContain("Você não muda o endereço de um pedido feito.");
    for (const p of ["cod", "prepay"] as const) expect(blocked(EXEMPLAR, p)).toEqual([]);
  });
  it("negação — sem o nome, o prompt fala do suporte da Logzz e não da Gizele", () => {
    const prompt = flat({ ...withGizele, returns: { logzzSupportPhone: PHONE } } as PromptConfig);
    expect(prompt).toContain("suporte da Logzz");
    expect(prompt).not.toContain("Gizele");
  });
  it("negação — sem o número, nem o nome vale: nada do suporte", () => {
    expect(flat({ ...withGizele, returns: { supportName: "Gizele" } } as PromptConfig)).not.toContain("Gizele");
  });
  it("o pedido entregue com problema manda para a Gizele, e sem o nome para a Logzz", () => {
    const named = deliveredDirective([], new Date(), PHONE, "Gizele");
    expect(named).toContain(`com a Gizele no WhatsApp ${PHONE}`);
    expect(named).not.toContain("Logzz");
    expect(deliveredDirective([], new Date(), PHONE)).toContain("suporte da Logzz");
  });
  it("a turn passa o nome nos dois lugares", () => {
    expect(turn).toContain("logzzReturnReply(logzzPhone, CONFIG.delivery.warrantyDays, CONFIG.returns?.freeExchange === true, supportName(CONFIG))");
    expect(turn).toContain("deliveredDirective(orders, new Date(), logzzPhone, supportName(CONFIG))");
  });
});
