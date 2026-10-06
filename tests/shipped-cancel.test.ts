import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cancelReplyFor, stageForOrder } from "@/agent/followups.js";
import { runGates } from "@/agent/guardrails.js";
import { handoffFor, NEUTRAL_INTERPRETATION } from "@/agent/interpret.js";
import { COD_CANCEL_REPLY, ORDER_HANDOFF_REPLY, PREPAID_CANCEL_REPLY, shippedCancelReply } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Operator, 2026-10-06: she wants to cancel an order. Paid at the door: she refuses it at the door.
 * Prepaid and on its way: it left, the return is asked for once it arrives. Prepaid, paid and not
 * yet shipped: a person cancels it. Anything else: "vou checar". A person takes every one (grafo §54, §56).
 */
describe("cancelar pedido: a resposta depende do caminho de pagamento e de ter saído (2026-10-06)", () => {
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

  const cod = (status: string | null) => ({ status, payment_method: "cod" });
  const prepay = (status: string | null) => ({ status, payment_method: "prepay" });

  it("pagamento na entrega, saído ou não: recusar na porta", () => {
    for (const o of [
      [cod("created")],
      [cod("Agendado")],
      [cod("Em rota")],
      [cod("Saiu para entrega")],
      [cod("Em rota"), cod("Saiu para entrega")],
      [cod("created"), prepay("Cancelado")],
    ])
      expect(cancelReplyFor(o), JSON.stringify(o)).toBe("cod");
  });

  it("antecipado em rota: o texto de saiu para entrega", () => {
    for (const o of [[prepay("Aprovado / Enviado")], [prepay("Em rota")], [prepay("Aprovado / Entregue à transportadora")], [prepay("Em rota"), cod("Cancelado")]])
      expect(cancelReplyFor(o), JSON.stringify(o)).toBe("shipped");
  });

  it("antecipado pago que ainda não saiu: cancelamento manual", () => {
    for (const o of [[prepay("Aprovado")], [prepay("Pagamento aprovado")], [prepay("Pago")], [prepay("Aprovado / Aguardando envio")], [prepay("paid")], [prepay("Aprovado / ")], [prepay("Aprovado / Em separação")], [prepay("Aprovado / Aguardando coleta")]])
      expect(cancelReplyFor(o), JSON.stringify(o)).toBe("prepaid_pending");
  });

  it("negação: tudo o que não é um dos três casos cai em ORDER_HANDOFF_REPLY", () => {
    for (const o of [
      [],
      // Only dead orders.
      [cod("Cancelado")],
      [prepay("Devolvido")],
      [prepay("Em rota de devolução")],
      [cod("Devolução em trânsito")],
      // Delivered, a failed attempt.
      [cod("Entregue")],
      [prepay("Aprovado / Entregue")],
      [cod("Não entregue")],
      [prepay("Entrega frustrada")],
      // Prepaid not (yet) paid, or a status that does not say.
      [prepay("created")],
      [prepay("Aguardando pagamento")],
      [prepay("Pagamento pendente")],
      [prepay("Pagamento não aprovado")],
      [prepay("Não pago")],
      [prepay("Reprovado")],
      [prepay(null)],
      [prepay("Aprovado"), prepay("Aguardando pagamento")],
      // Mixed or unknown payment path.
      [cod("created"), prepay("Aprovado")],
      [cod("Em rota"), prepay("Em rota")],
      [{ status: "created", payment_method: null }],
      [{ status: "created", payment_method: "pix" }],
      // More than one live order in different states.
      [cod("created"), cod("Em rota")],
      [prepay("Aprovado"), prepay("Aprovado / Enviado")],
    ])
      expect(cancelReplyFor(o), JSON.stringify(o)).toBeNull();
  });

  // Review of da612fd, 2026-10-06: `stageForOrder` reads anything it does not know as `pedido_criado`,
  // so "ainda não saiu" was stated from a shipping status nobody recognised. Allowlist now.
  it("revisão: antecipado com envio desconhecido ou estranho não ouve 'ainda não saiu'", () => {
    for (const status of [
      "Aprovado / Postado",
      "Aprovado / Objeto postado",
      "Pago / Em transporte",
      "Aprovado / Em distribuição",
      "Aprovado / Aguardando retirada",
      "Aprovado / Out for delivery",
      "paid / pending",
      "Aprovado / Chargeback",
      "Aprovado / Contestado",
      "Aprovado / Não enviado",
      "Aprovado / Não despachado",
      "Aprovado / Não coletado",
      "Aprovado e postado",
    ])
      expect(cancelReplyFor([prepay(status)]), status).toBeNull();
  });

  it("revisão: envio negado não é em rota, na raiz (stageForOrder)", () => {
    for (const status of ["Aprovado / Não enviado", "Aprovado / Não despachado", "Aprovado / Não coletado", "Não foi enviado", "Não saiu para entrega"]) {
      expect(stageForOrder(status), status).not.toBe("em_rota");
      expect(cancelReplyFor([prepay(status)]), status).not.toBe("shipped");
    }
    for (const status of ["Não enviado", "Não despachado", "Não coletado"]) expect(cancelReplyFor([cod(status)]), status).toBe("cod");
    // Still on its way without the negation.
    for (const status of ["Aprovado / Enviado", "Despachado", "Coletado"]) expect(stageForOrder(status), status).toBe("em_rota");
  });

  it("pagamento na entrega com a região marcada sem entrega: o gate vetaria, então ORDER_HANDOFF_REPLY", () => {
    expect(runGates(COD_CANCEL_REPLY, ctx({ layer: "auto", codUnavailable: true })).traces.some((t) => t.verdict === "block")).toBe(true);
    expect(cancelReplyFor([cod("created")], true)).toBeNull();
    // Prepaid is not the door's business.
    expect(cancelReplyFor([prepay("Aprovado")], true)).toBe("prepaid_pending");
    expect(cancelReplyFor([prepay("Em rota")], true)).toBe("shipped");
  });

  it("os textos do operador, literais", () => {
    expect(COD_CANCEL_REPLY).toBe(
      "Como o seu pedido é pago na entrega, é só esperar ele chegar aí. Se não quiser receber, é só dizer isso pro entregador na hora 💛",
    );
    expect(PREPAID_CANCEL_REPLY).toBe("Conferi que seu pedido ainda não saiu para a entrega, irei dar início no cancelamento.");
  });

  it("os dois textos novos passam a cadeia como o handOff a julga (cod, sem estágio e na logística)", () => {
    for (const reply of [COD_CANCEL_REPLY, PREPAID_CANCEL_REPLY])
      for (const stage of [undefined, "logistics"] as const) {
        const blocked = runGates(reply, ctx({ layer: "auto", paymentPath: "cod", ...(stage ? { stage } : {}) })).traces.filter((t) => t.verdict === "block");
        expect(blocked, `${reply} ${stage}`).toEqual([]);
      }
    // The prepaid one also with her region without payment at the door.
    for (const stage of [undefined, "logistics"] as const)
      expect(
        runGates(PREPAID_CANCEL_REPLY, ctx({ layer: "auto", codUnavailable: true, ...(stage ? { stage } : {}) })).traces.filter((t) => t.verdict === "block"),
      ).toEqual([]);
  });

  it("sem contexto de pedido não há handoff de cancelamento", () => {
    const wants = { ...NEUTRAL_INTERPRETATION, wants_cancel: true };
    expect(handoffFor(wants, "quero cancelar", false)).toBeNull();
    expect(handoffFor(wants, "quero cancelar", true)).toBe("cancel");
  });

  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("o turno: só no cancelamento, ainda passa para uma pessoa, e o resto mantém ORDER_HANDOFF_REPLY", () => {
    expect(source).toContain("orders?lead_id=eq.${lead.id}&select=status,payment_method");
    expect(source).toContain('handoffKind === "cancel"\n      ? cancelReplyFor(');
    expect(source).toContain('if (cancelling === "cod") {\n    return await handOff(COD_CANCEL_REPLY, "a cliente quer cancelar um pedido na entrega; foi orientada a recusar na porta");');
    expect(source).toContain(
      'if (cancelling === "shipped") {\n    return await handOff(shippedCancelReply(CONFIG.delivery.warrantyDays), "a cliente quer cancelar um pedido antecipado que já saiu para entrega");',
    );
    expect(source).toContain(
      'if (cancelling === "prepaid_pending") {\n    return await handOff(\n      PREPAID_CANCEL_REPLY,\n      "a cliente quer cancelar um pedido antecipado que ainda não saiu para entrega — cancelar manualmente na Coinzz",\n    );',
    );
    expect(source).toContain("handoffKind === \"human\" ? HUMAN_HANDOFF_REPLY : ORDER_HANDOFF_REPLY,");
    expect(ORDER_HANDOFF_REPLY).toBe("Vou checar pra você e já te retorno 💛");
  });
});
