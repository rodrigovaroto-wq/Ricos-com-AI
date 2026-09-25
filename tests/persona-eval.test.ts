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
