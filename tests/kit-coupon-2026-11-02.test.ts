/**
 * Kits follow the coupon (operator, 2026-11-02): once the follow-up with the coupon went to her, the kit prices with the coupon are
 * the truth (2 pieces R$ 158,26, 3 pieces R$ 211,01 — the Coinzz stacks the coupon on the kit). Held, they stay vetoed.
 */
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import { conversationCoupon } from "@/agent/followups.js";
import { ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-29b.min.json");
const released = conversationCoupon(prod, true);
const held = conversationCoupon(prod, false);
const priceGate = (text: string, config = held) =>
  runGates(text, ctx({ config })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("kits com o cupom (grafo §140)", () => {
  it.each([
    "Com o cupom, as 2 peças saem por R$ 158,26.",
    "Com o SUPER20, o kit de 3 fica R$ 211,01.",
    "Com o cupom de 20%: 1 peça R$ 87,92, 2 peças R$ 158,26 e 3 peças R$ 211,01.",
    "Com o cupom, levando 2 peças sai R$ 79,13 cada.",
    "Com o cupom, no kit de 3 cada peça sai por R$ 70,34.",
  ])("passa depois do lembrete e é vetado com o cupom guardado: %s", (s) => {
    expect(priceGate(s, released)).toEqual([]);
    expect(priceGate(s)).toContain("price_promise");
  });

  it.each(["Fica R$ 79,13 pra você.", "Consigo fazer por R$ 70,34."])(
    "negação: a peça do kit com cupom dita como o preço de uma peça segue vetada: %s",
    (s) => expect(priceGate(s, released)).toContain("price_promise"),
  );

  it("negação: com o cupom liberado, um kit com outro valor segue vetado", () => {
    expect(priceGate("Com o cupom, as 2 peças saem por R$ 150,00.", released)).toContain("price_promise");
  });

  it("o prompt ensina os preços dos kits com cupom só depois do lembrete", () => {
    const build = (config: typeof prod) => systemPrompt(config, gateBriefing(config), null);
    expect(build(released)).toContain("2 peças R$ 158,26");
    expect(build(released)).toContain("3 peças R$ 211,01");
    expect(build(held)).not.toContain("R$ 158,26");
  });
});
