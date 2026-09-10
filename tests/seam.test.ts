import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError, createSeam, type Provider } from "@/llm/seam.js";
import { costBrl } from "@/llm/pricing.js";
import { costCeilingBrl } from "@/config/business.js";
import { config } from "./fixtures.js";

const provider = (model: string): Provider => ({
  model,
  complete: async () => ({ text: "ok", usage: { inputTokens: 3_000, outputTokens: 120, cachedTokens: 1_500 } }),
});

const seamWith = (record = vi.fn()) =>
  createSeam({
    providers: { conversation: provider("gpt-5.6-luna"), cheap: provider("gemini-3.5-flash-lite") },
    usdToBrl: 5.4,
    ceilingBrl: costCeilingBrl(config),
    record,
  });

describe("seam de chamada de modelo", () => {
  it("o teto é o valor da conversa mais a folga de 25%", () => {
    expect(costCeilingBrl(config)).toBeCloseTo(1.0, 5);
  });

  it("grava custo e latência de cada chamada", async () => {
    const record = vi.fn();
    const { text, costBrl: cost } = await seamWith(record).call(
      "conversation",
      { purpose: "reply", system: "s", messages: [{ role: "user", content: "oi" }] },
      0,
    );
    expect(text).toBe("ok");
    expect(cost).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]![0]).toMatchObject({ purpose: "reply", model: "gpt-5.6-luna" });
  });

  it("barra antes de sair byte para o provedor quando o teto já foi atingido", async () => {
    const record = vi.fn();
    const seam = seamWith(record);
    await expect(
      seam.call("conversation", { purpose: "reply", system: "s", messages: [] }, 1.01),
    ).rejects.toThrow(BudgetExceededError);
    expect(record).not.toHaveBeenCalled();
  });

  it("cobra a leitura de cache mais barato que o token novo", () => {
    const usage = { inputTokens: 10_000, outputTokens: 0 };
    const semCache = costBrl("gpt-5.6-luna", usage, 5.4);
    const comCache = costBrl("gpt-5.6-luna", { ...usage, cachedTokens: 10_000 }, 5.4);
    expect(comCache).toBeLessThan(semCache / 5);
  });

  it("recusa modelo sem preço configurado, em vez de gravar custo zero em silêncio", () => {
    expect(() => costBrl("modelo-inventado", { inputTokens: 1, outputTokens: 1 }, 5.4)).toThrow(/sem preço/);
  });

  /**
   * O custo não finito é pior que o custo errado, e o modo de falha é o inverso do
   * intuitivo: `JSON.stringify` grava Infinity e NaN como `null`, a coluna guarda NULL, a
   * virada seguinte lê `Number(null ?? 0)` — zero — e o teto de custo da conversa é
   * rearmado em zero e nunca mais dispara. Gasto ilimitado, sem rastro. `usdToBrl` chega
   * de variável de ambiente, então um erro de digitação basta para produzir NaN.
   */
  it("recusa custo não finito em vez de gravar null", () => {
    const usage = { inputTokens: 1_000, outputTokens: 500 };
    expect(() => costBrl("gpt-5.6-luna", usage, Number.NaN)).toThrow(/não finito/);
    expect(() => costBrl("gpt-5.6-luna", usage, Number.POSITIVE_INFINITY)).toThrow(/não finito/);
    // `Number.MAX_VALUE` de propósito NÃO está aqui: multiplicado por um custo pequeno
    // (1.000 tokens a US$ 0,20 por 1M) o resultado é 3,6e304 — absurdo, e ainda finito.
    // Câmbio grande não transborda sozinho; quem transborda é preço grande, e o teto do
    // preço é da Edge Function (`CONVERSATION_MODEL_PRICE`, teto de 1000 no `index.ts`).
    // Este cinto cobre o que chega aqui: NaN e Infinity vindos do câmbio.
    // E o caminho normal continua normal: um câmbio plausível não é afetado.
    expect(costBrl("gpt-5.6-luna", usage, 5.4)).toBeGreaterThan(0);
  });
});
