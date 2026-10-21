/**
 * Plan 16 §4.7 (operator, 2026-10-21): the prepaid freight of her CEP, read from the checkout, goes in the prepaid offer
 * and may be said by the model — that number only, on the prepaid path only. A failed read keeps today's text.
 */
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates, type GateContext } from "@/agent/guardrails.js";
import { offerBubbles, prepayOfferText } from "@/agent/funnel.js";
import { freightBriefing, systemPrompt, type PromptConfig } from "@/agent/prompt.js";
import { config as base, ctx } from "./fixtures.js";

const config: PromptConfig = { ...base, prices: { ...base.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 } };
const SAID = "No antecipado o frete pra sua região é R$ 18,90.";
const blocked = (text: string, c: GateContext) => runGates(text, c).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const prepay = (over: Partial<GateContext> = {}) => ctx({ config, paymentPath: "prepay", codUnavailable: true, prepayFreightBrl: 18.9, ...over });

describe("prepayOfferText com o frete", () => {
  it("feliz: a linha do frete vai embaixo da linha dos Correios, no negrito do operador", () => {
    const t = prepayOfferText(config, 18.9);
    expect(t).toContain("🚚 Seu colete vai pelos Correios, com código de rastreio.\nFrete pra sua região: *R$ 18,90*");
  });
  it("falha: sem frete, zero, negativo ou NaN — o texto de hoje, byte a byte", () => {
    const today = prepayOfferText(config);
    for (const f of [null, 0, -1, Number.NaN]) expect(prepayOfferText(config, f)).toBe(today);
    expect(today).not.toContain("Frete pra sua região");
  });
  it("com frete grátis nos dois caminhos, a caixa nunca diz um valor de frete (revisão do plano 16)", () => {
    const free = { ...config, delivery: { ...config.delivery, freeShipping: true } };
    expect(prepayOfferText(free, 18.9)).toBe(prepayOfferText(free));
    expect(offerBubbles(free, { cod: false, dates: [], prepayFreightBrl: 18.9 }, new Date("2026-10-21T14:00:00Z"), null).map((b) => b.text).join("\n")).not.toContain("18,90");
  });
  it("offerBubbles leva o frete da região à caixa do antecipado, e não à da entrega", () => {
    const now = new Date("2026-10-21T14:00:00Z");
    const box = (cod: boolean) => offerBubbles(config, { cod, dates: [], prepayFreightBrl: 18.9 }, now, null).map((b) => b.text).join("\n");
    expect(box(false)).toContain("Frete pra sua região: *R$ 18,90*");
    expect(box(true)).not.toContain("18,90");
  });
});

describe("os gates aceitam o frete lido, só ele, só no antecipado", () => {
  it("feliz: a frase que o prompt ensina passa a cadeia inteira", () => {
    expect(blocked(SAID, prepay())).toEqual([]);
    expect(blocked("São R$ 18,90 de frete.", prepay())).toEqual([]);
  });
  it("borda: outro valor de frete, o mesmo valor como preço do colete, e o caminho da entrega — vetados", () => {
    expect(blocked("No antecipado o frete pra sua região é R$ 15,90.", prepay())).toEqual(expect.arrayContaining(["price_promise", "shipping_promise"]));
    expect(blocked("O colete sai R$ 18,90.", prepay())).toContain("price_promise");
    expect(blocked(SAID, prepay({ paymentPath: "cod", codUnavailable: false }))).toEqual(expect.arrayContaining(["price_promise", "shipping_promise"]));
  });
  it("falha: sem o frete no contexto (consulta falhou), o veto de hoje", () => {
    expect(blocked(SAID, ctx({ config, paymentPath: "prepay", codUnavailable: true }))).toEqual(expect.arrayContaining(["price_promise", "shipping_promise"]));
    expect(blocked(SAID, prepay({ prepayFreightBrl: Number.NaN }))).toContain("price_promise");
  });
  it("frete grátis nos dois caminhos: o número continua vetado", () => {
    const free = { ...config, delivery: { ...config.delivery, freeShipping: true } };
    expect(blocked(SAID, prepay({ config: free }))).toContain("price_promise");
  });
  it("negação: a negada honesta passa; a negativa que não nega não libera outro valor", () => {
    expect(blocked("O frete não é grátis: pra sua região é R$ 18,90.", prepay())).toEqual([]);
    expect(blocked("Sem enrolação, o frete pra sua região é R$ 15,90.", prepay())).toEqual(expect.arrayContaining(["price_promise", "shipping_promise"]));
    // Honest, and still a rewrite: every amount the sentence gives the freight must be the one read (the safe side).
    expect(blocked("O frete não é R$ 15,90, é R$ 18,90.", prepay())).toContain("shipping_promise");
    expect(blocked("O frete pra sua região é R$ 18,90, e o colete sai R$ 15,90.", prepay())).toContain("price_promise");
  });
});

describe("freightBriefing: o prompt diz o número quando o turno tem", () => {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  it("sem o frete, o texto de hoje (nos dois ramos sem grátis nos dois caminhos)", () => {
    for (const c of [config, { ...config, delivery: { ...config.delivery, codFreeShipping: false } }])
      expect(freightBriefing(c, null)).toEqual(freightBriefing(c));
  });
  it("com o frete, ensina a frase com o número e ela passa a cadeia no antecipado", () => {
    for (const c of [config, { ...config, delivery: { ...config.delivery, codFreeShipping: false } }]) {
      const text = flat(freightBriefing(c, 18.9).join(" "));
      expect(text).toContain(`"${SAID}"`);
      expect(text).not.toContain("você NÃO sabe o valor");
      expect(blocked(SAID, prepay({ config: c }))).toEqual([]);
    }
  });
  it("frete grátis nos dois caminhos: o número não entra no prompt", () => {
    const free = { ...config, delivery: { ...config.delivery, freeShipping: true } };
    expect(freightBriefing(free, 18.9).join(" ")).not.toContain("18,90");
  });
  it("systemPrompt leva o frete do turno ao bloco do frete", () => {
    expect(flat(systemPrompt(config, gateBriefing(config), null, null, null, { prepayFreightBrl: 18.9 }))).toContain(`"${SAID}"`);
    expect(systemPrompt(config, gateBriefing(config), null)).toBe(systemPrompt(config, gateBriefing(config), null, null, null, {}));
  });
});
