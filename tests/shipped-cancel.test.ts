import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pastCancelling } from "@/agent/followups.js";
import { runGates } from "@/agent/guardrails.js";
import { handoffFor, NEUTRAL_INTERPRETATION } from "@/agent/interpret.js";
import { ORDER_HANDOFF_REPLY, shippedCancelReply } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Operator, 2026-10-06: she wants to cancel an order that already left for delivery. The agent says
 * it left and the return is asked for once it arrives; a person still takes it (grafo §54).
 */
describe("cancelar pedido que já saiu para entrega (2026-10-06)", () => {
  const reply = shippedCancelReply(config.delivery.warrantyDays);

  it("o texto diz que saiu, que não dá pra cancelar, e cita os dias do config", () => {
    expect(reply).toContain("já saiu para entrega");
    expect(reply).toContain("não dá mais pra cancelar");
    expect(reply).toContain(`${config.delivery.warrantyDays} dias pra devolver depois que receber`);
    expect(shippedCancelReply(30)).toContain("30 dias pra devolver depois que receber");
    // Nothing done to the order, nothing about refusing at the door.
    expect(reply).not.toMatch(/cancelei|já cancel|providenci|recusar|não pode recusar/i);
  });

  it("passa a cadeia inteira como o handOff a julga, e na logística, nos dois caminhos", () => {
    for (const paymentPath of ["cod", "prepay"] as const)
      for (const stage of [undefined, "logistics"] as const) {
        const blocked = runGates(reply, ctx({ layer: "auto", paymentPath, ...(stage ? { stage } : {}) })).traces.filter((t) => t.verdict === "block");
        expect(blocked, `${paymentPath} ${stage}`).toEqual([]);
      }
    // Her region without payment at the door: handOff passes `codUnavailable` too.
    expect(runGates(reply, ctx({ layer: "auto", codUnavailable: true })).traces.filter((t) => t.verdict === "block")).toEqual([]);
  });

  it("os dias que não são os do config são vetados (o número vem do config)", () => {
    const wrong = shippedCancelReply(config.delivery.warrantyDays + 1);
    expect(runGates(wrong, ctx({ layer: "auto", stage: "logistics" })).traces.some((t) => t.verdict === "block")).toBe(true);
  });

  it("saiu para entrega: todo pedido vivo em rota", () => {
    for (const s of [["Em rota"], ["Enviado"], ["Saiu para entrega"], ["Entregue à transportadora"], ["Em rota", "Cancelado"]])
      expect(pastCancelling(s), JSON.stringify(s)).toBe(true);
  });

  it("negação: não enviado, entregue, tentativa frustrada, só morto, nenhum pedido ou um pedido ainda cancelável", () => {
    for (const s of [
      [],
      ["created"],
      ["Pagamento aprovado"],
      ["Aguardando envio"],
      ["Entregue"],
      ["Não entregue"],
      ["Cancelado"],
      ["Devolvido"],
      // Coming back to the sender is not on its way to her (review, 2026-10-06).
      ["Em rota de devolução"],
      ["Devolução em trânsito"],
      [undefined],
      ["Em rota", "created"],
      ["Em rota", "Entregue"],
    ])
      expect(pastCancelling(s), JSON.stringify(s)).toBe(false);
  });

  it("sem contexto de pedido não há handoff de cancelamento", () => {
    const wants = { ...NEUTRAL_INTERPRETATION, wants_cancel: true };
    expect(handoffFor(wants, "quero cancelar", false)).toBeNull();
    expect(handoffFor(wants, "quero cancelar", true)).toBe("cancel");
  });

  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("o turno: só no cancelamento, ainda passa para uma pessoa, e o resto mantém ORDER_HANDOFF_REPLY", () => {
    expect(source).toContain('handoffKind === "cancel" &&\n    pastCancelling(');
    expect(source).toContain(
      'return await handOff(shippedCancelReply(CONFIG.delivery.warrantyDays), "a cliente quer cancelar um pedido que já saiu para entrega");',
    );
    expect(source).toContain("handoffKind === \"human\" ? HUMAN_HANDOFF_REPLY : ORDER_HANDOFF_REPLY,");
    expect(ORDER_HANDOFF_REPLY).toBe("Vou checar pra você e já te retorno 💛");
  });
});
