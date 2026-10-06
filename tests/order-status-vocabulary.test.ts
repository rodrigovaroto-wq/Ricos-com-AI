import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cancelReplyFor, isKnownOrderStatus, isOrderDead, stageForOrder } from "@/agent/followups.js";

/**
 * Operator, 2026-10-06 (grafo §57): order statuses stay deterministic code. The Logzz and Coinzz
 * vocabulary is mapped explicitly; a status never seen before is unknown — the operator gets an
 * e-mail with it raw, and a cancel on it hears "vou checar" instead of a guess.
 */
describe("vocabulário de status da Logzz e da Coinzz (2026-10-06)", () => {
  // Logzz sends `order_status` bare. CONFIRMED in its help center.
  it.each([
    ["Agendado", "pedido_criado"],
    ["Reagendado", "pedido_criado"],
    ["Em separação", "pedido_criado"],
    // The three that read pedido_criado before the vocabulary.
    ["A caminho", "em_rota"],
    ["Em rota", "em_rota"],
    ["Completo", "entregue_pago"],
    ["A reagendar", null],
    ["Frustrado", null],
    ["Cancelado", "recusado"],
    ["Reembolsado", "recusado"],
  ])("Logzz %s → %s", (status, stage) => {
    expect(isKnownOrderStatus(status)).toBe(true);
    expect(stageForOrder(status)).toBe(stage);
  });

  // Coinzz writes "payment / shipping" (n8n "Normaliza a venda"); the shipping part is absent before shipping.
  it.each([
    // CONFIRMED.
    ["Aprovado", "pedido_criado"],
    ["Cancelado", "recusado"],
    ["Aprovado / Enviado", "em_rota"],
    ["Aprovado / Sem sucesso", null],
    // INFERRED payment.
    ["Pendente", "pedido_criado"],
    ["Aguardando pagamento", "pedido_criado"],
    ["Aguardando", "pedido_criado"],
    ["Em análise", "pedido_criado"],
    ["Pago", "pedido_criado"],
    ["Recusado", "recusado"],
    ["Estornado", "recusado"],
    ["Reembolsado", "recusado"],
    ["Chargeback", "recusado"],
    ["Expirado", "recusado"],
    // INFERRED shipping.
    ["Aprovado / Aguardando envio", "pedido_criado"],
    ["Aprovado / Em separação", "pedido_criado"],
    ["Aprovado / Preparando envio", "pedido_criado"],
    ["Aprovado / Em trânsito", "em_rota"],
    ["Aprovado / Postado", "em_rota"],
    ["Aprovado / Em transporte", "em_rota"],
    ["Aprovado / Saiu para entrega", "em_rota"],
    ["Aprovado / Em rota", "em_rota"],
    ["Aprovado / Entregue", "entregue_pago"],
    ["Aprovado / Não entregue", null],
    ["Aprovado / Frustrado", null],
    ["Aprovado / Devolvido", "recusado"],
    ["Aprovado / Em devolução", "recusado"],
    ["Estornado / Enviado", "recusado"],
  ])("Coinzz %s → %s", (status, stage) => {
    expect(isKnownOrderStatus(status)).toBe(true);
    expect(stageForOrder(status)).toBe(stage);
  });

  it("acento, caixa e espaço não mudam a leitura", () => {
    for (const status of ["COMPLETO", "  completo ", "a  caminho", "A CAMINHO", "aprovado/em transito", "APROVADO /  EM TRÂNSITO", "Em separacao"])
      expect(isKnownOrderStatus(status), status).toBe(true);
    expect(stageForOrder("COMPLETO")).toBe("entregue_pago");
    expect(stageForOrder("a  caminho")).toBe("em_rota");
    expect(stageForOrder("aprovado/em transito")).toBe("em_rota");
  });

  it("o padrão interno sem status (`created`) é conhecido", () => {
    expect(isKnownOrderStatus("created")).toBe(true);
    expect(stageForOrder("created")).toBe("pedido_criado");
  });

  it("morto e vivo pelo vocabulário: a régua para no que morreu", () => {
    for (const s of ["Cancelado", "Reembolsado", "Estornado", "Chargeback", "Expirado", "Recusado", "Aprovado / Devolvido", "Aprovado / Em devolução"])
      expect(isOrderDead(s), s).toBe(true);
    for (const s of ["Completo", "A caminho", "A reagendar", "Aprovado / Sem sucesso", "Aprovado / Não entregue", "Frustrado", "Agendado", "Pendente"])
      expect(isOrderDead(s), s).toBe(false);
  });

  it("negação: 'Não entregue' e 'Não enviado' continuam sem ser entregue nem em rota", () => {
    expect(stageForOrder("Não entregue")).toBeNull();
    expect(stageForOrder("Aprovado / Não entregue")).toBeNull();
    for (const s of ["Não enviado", "Aprovado / Não enviado", "Não saiu para entrega", "Aprovado / Não está em trânsito"])
      expect(stageForOrder(s), s).not.toBe("em_rota");
    expect(stageForOrder("Aprovado / Não entregue")).not.toBe("entregue_pago");
  });

  it.each([
    "",
    "Em distribuição",
    "Aprovado / Em distribuição",
    "Aprovado / Aguardando retirada",
    "Objeto postado",
    "Entregue à transportadora",
    "Não enviado",
    "paid / pending",
    "Aprovado / Enviado / Entregue extra",
    "constructor",
    "__proto__",
  ])("desconhecido: %j", (status) => {
    expect(isKnownOrderStatus(status)).toBe(false);
  });

  it("desconhecido mantém a leitura de antes na régua (raiz), documentada", () => {
    expect(stageForOrder("Em distribuição")).toBe("pedido_criado");
    expect(stageForOrder("Entregue à transportadora")).toBe("em_rota");
    expect(stageForOrder("cancelado pelo cliente")).toBe("recusado");
    expect(isOrderDead("Em rota de devolução")).toBe(true);
    expect(stageForOrder(undefined)).toBe("pedido_criado");
  });
});

describe("cancelamento: o vocabulário decide, o desconhecido vai para 'vou checar'", () => {
  const cod = (status: string) => ({ status, payment_method: "cod" });
  const prepay = (status: string) => ({ status, payment_method: "prepay" });

  it.each([
    ["Agendado", "cod"],
    ["Reagendado", "cod"],
    ["Em separação", "cod"],
    ["A caminho", "cod"],
    ["Em rota", "cod"],
    ["Completo", null],
    ["A reagendar", null],
    ["Frustrado", null],
  ])("Logzz (na entrega) %s → %s", (status, reply) => {
    expect(cancelReplyFor([cod(status)])).toBe(reply);
  });

  it.each([
    ["Aprovado", "prepaid_pending"],
    ["Pago", "prepaid_pending"],
    ["Aprovado / Aguardando envio", "prepaid_pending"],
    ["Aprovado / Em separação", "prepaid_pending"],
    ["Aprovado / Preparando envio", "prepaid_pending"],
    ["Aprovado / Enviado", "shipped"],
    ["Aprovado / Em trânsito", "shipped"],
    ["Aprovado / Postado", "shipped"],
    ["Aprovado / Em transporte", "shipped"],
    ["Aprovado / Saiu para entrega", "shipped"],
    ["Aprovado / Em rota", "shipped"],
    ["Aprovado / Entregue", null],
    ["Aprovado / Sem sucesso", null],
    ["Aprovado / Não entregue", null],
    ["Aprovado / Frustrado", null],
    ["Pendente", null],
    ["Aguardando pagamento", null],
    ["Aguardando", null],
    ["Em análise", null],
    // Dead: no live order.
    ["Cancelado", null],
    ["Recusado", null],
    ["Estornado", null],
    ["Reembolsado", null],
    ["Chargeback", null],
    ["Expirado", null],
    ["Aprovado / Devolvido", null],
    ["Aprovado / Em devolução", null],
  ])("Coinzz (antecipado) %s → %s", (status, reply) => {
    expect(cancelReplyFor([prepay(status)])).toBe(reply);
  });

  it("Coinzz afterpay (na entrega) segue o mesmo caminho da porta", () => {
    expect(cancelReplyFor([cod("Aprovado / Enviado")])).toBe("cod");
    expect(cancelReplyFor([cod("Aprovado / Sem sucesso")])).toBeNull();
  });

  it("status desconhecido nunca vira palpite: null (ORDER_HANDOFF_REPLY)", () => {
    for (const status of ["Em distribuição", "Entregue à transportadora", "Aprovado / Em distribuição", "Não enviado", "Despachado"]) {
      expect(cancelReplyFor([cod(status)]), status).toBeNull();
      expect(cancelReplyFor([prepay(status)]), status).toBeNull();
    }
    // One unknown among known live orders is enough.
    expect(cancelReplyFor([cod("Agendado"), cod("Em distribuição")])).toBeNull();
    // A dead sibling with an unknown wording is ignored, as before.
    expect(cancelReplyFor([cod("Agendado"), cod("cancelado pelo cliente")])).toBe("cod");
  });
});

describe("job order: o status novo volta para o n8n", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const job = source.slice(source.indexOf('if (payload.job === "order")'), source.indexOf('if (payload.job === "human_reply")'));

  it("só o status fora do vocabulário ganha `unknownStatus`, cru", () => {
    expect(job).toContain('const incoming = payload.order.status ?? "created";');
    expect(job).toContain("isKnownOrderStatus(incoming) ? result : { ...result, unknownStatus: incoming }");
  });

  const wf = JSON.parse(readFileSync("n8n/workflows/venda-confirmada.json", "utf8")) as {
    nodes: Array<{ name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { name: string }> }>;
    connections: Record<string, { main: Array<Array<{ node: string }>> }>;
  };
  const node = (name: string) => wf.nodes.find((n) => n.name === name)!;

  it("n8n: a saída de sucesso de 'Grava o pedido' passa por um IF que manda o e-mail do status novo", () => {
    expect(wf.connections["Grava o pedido"]!.main[0]!.map((c) => c.node)).toEqual(["Status novo?"]);
    expect(JSON.stringify(node("Status novo?").parameters)).toContain("$json.unknownStatus !== undefined");
    expect(wf.connections["Status novo?"]!.main[0]!.map((c) => c.node)).toEqual(["Avisa status novo"]);
    expect(wf.connections["Status novo?"]!.main[1] ?? []).toEqual([]);
    const mail = node("Avisa status novo");
    expect(mail.type).toBe("n8n-nodes-base.emailSend");
    expect(mail.credentials?.smtp?.name).toBe("SMTP e-mail");
    expect(mail.parameters.toEmail).toBe(node("Avisa a recusa da venda").parameters.toEmail);
    expect(String(mail.parameters.subject)).toContain("Status novo da ");
    expect(String(mail.parameters.subject)).toContain("$json.unknownStatus");
    expect(String(mail.parameters.subject)).toContain("o que ele significa?");
    expect(String(mail.parameters.text)).toContain("order.externalId");
  });
});
