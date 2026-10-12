import { describe, expect, it } from "vitest";
import { evalRow } from "../src/dev/persona-eval.js";

describe("eval do modelo: uma linha por persona", () => {
  it("conta prontas, reescritas, vetos por gate e respostas até o link", () => {
    const row = evalRow({
      persona: "persona-tati",
      transcript: [
        { from: "persona", text: "oi" },
        { from: "valen", text: "Oii", status: "welcomed" },
        { from: "valen", text: "R$ 129,90 na entrega" },
        { from: "persona", text: "quero o M" },
        { from: "valen", text: "Aqui: https://entrega.logzz.com.br/pay/encorpa-pa?name=Tati" },
      ],
      endReason: "persona_finished",
      stage: "tamanho_definido",
      costBrl: 0.0168,
      turnOutcomes: [
        { outcome: "send", rewrites: 1 },
        { outcome: "fallback", rewrites: 3 },
      ],
      gateTraces: [
        { gate: "coupon_exists", verdict: "block" },
        { gate: "coupon_exists", verdict: "block" },
        { gate: "price_promise", verdict: "block" },
        { gate: "price_promise", verdict: "pass" },
      ],
    });
    expect(row).toMatchObject({
      persona: "tati",
      replies: 2,
      fallbacks: 1,
      rewritesPerReply: 2,
      topBlocks: "coupon_exists ×2, price_promise ×1",
      repliesToLink: 2,
    });
  });
});

describe("comparação de versões (E4.4): a regra escrita antes", async () => {
  const { approve } = await import("../src/dev/persona-eval.js");
  const base = {
    conversations: 16, score: 60, barriers: 0, lies: 0, optOutIgnored: 0, conversion: 0.5, linkRate: 0.7,
    medianRepliesToLink: 5, ticsPerConversation: 1, promptCopyRate: 0.05, questionRate: 0.6, wordsRatio: 2, costPerConversationBrl: 0.3,
  };

  it("a mesma versão contra ela mesma passa (ruído zero)", () => {
    expect(approve(base, base, 0)).toEqual({ pass: true, reasons: [] });
  });
  it("queda dentro do ruído passa; além dele, reprova", () => {
    expect(approve(base, { ...base, score: 57 }, 3).pass).toBe(true);
    expect(approve(base, { ...base, score: 56.9 }, 3).reasons.join()).toMatch(/ruído/);
  });
  it("qualquer barreira reprova, mesmo com score maior", () => {
    expect(approve(base, { ...base, score: 90, barriers: 1, lies: 1 }, 3).reasons.join()).toMatch(/barreiras/);
  });
  it("tiques ou cópia do prompt piores reprovam", () => {
    expect(approve(base, { ...base, ticsPerConversation: 1.1 }, 3).reasons.join()).toMatch(/tiques/);
    expect(approve(base, { ...base, promptCopyRate: 0.06 }, 3).reasons.join()).toMatch(/cópia/);
  });
});
