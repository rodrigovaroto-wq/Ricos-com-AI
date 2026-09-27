import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  endsSilenceRuler,
  inSilenceRuler,
  onOrderConfirmed,
  rulerFor,
  scheduleSilence,
  stageForLead,
  stageForOrder,
} from "@/agent/followups.js";
import { linkSentRecently } from "@/agent/interpret.js";

/**
 * Plano v2, item 5.8: o webhook de venda recebia o status do pedido e não tocava
 * `conversations.stage` — `em_rota`, `entregue_pago` e `recusado` não eram escritos por
 * ninguém, e o funil parava em `pedido_criado`. Nenhuma das plataformas publica o
 * vocabulário de status, então a leitura é por raiz, como `isOrderDead`.
 */
describe("5.8: o status do pedido vira estágio do funil", () => {
  it.each([
    [undefined, "pedido_criado"],
    ["created", "pedido_criado"],
    ["Agendado", "pedido_criado"],
    ["Aguardando entrega", "pedido_criado"],
    // Antecipado: pago antes de sair não é entregue.
    ["Pagamento aprovado", "pedido_criado"],
    ["paid", "pedido_criado"],
    ["Em rota de entrega", "em_rota"],
    ["Saiu para entrega", "em_rota"],
    ["Enviado", "em_rota"],
    ["shipped", "em_rota"],
    ["in_transit", "em_rota"],
    ["Entregue", "entregue_pago"],
    ["delivered", "entregue_pago"],
    ["Concluído", "entregue_pago"],
    ["Cancelado", "recusado"],
    ["Recusado na entrega", "recusado"],
    ["cancelado pelo cliente", "recusado"],
    ["Devolvido", "recusado"],
    // Tentativa frustrada pode ser refeita, e "recusado" é terminal: não se chuta.
    ["Não entregue", null],
    ["Entrega frustrada", null],
    ["Insucesso na entrega", null],
  ])("%s → %s", (status, stage) => {
    expect(stageForOrder(status as string | undefined)).toBe(stage);
  });

  it("recordOrder grava o estágio com a regra de não regredir", () => {
    const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(source).toContain("persistStage(conversation.id, (conversation.stage as Stage | null) ?? \"novo\", reached)");
    expect(source).toContain("conversations?lead_id=eq.${lead.id}&select=id,stage&order=created_at.desc&limit=1");
  });
});

/**
 * `perdido` (decisão do operador, 2026-09-26, opção a): a conversa vira `perdido` quando o
 * último toque da régua de silêncio sai da fila — enviado ou cancelado — sem pedido. Se ela
 * voltar, `furthest` devolve o estágio que o turno alcançar. Pedido criado nunca vira
 * `perdido` (a régua de silêncio é cancelada na venda, e `furthest` recusa a aresta).
 */
describe("7.4: a régua de silêncio termina em perdido", () => {
  it("só o último toque da régua fecha a conversa", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    for (const stopPoint of [undefined, "link_sent"] as const) {
      const ruler = scheduleSilence(now, stopPoint);
      const last = ruler.reduce((a, b) => (b.runAt > a.runAt ? b : a));
      expect(ruler.filter((f) => endsSilenceRuler(f.kind)).map((f) => f.kind)).toEqual([last.kind]);
    }
  });

  it.each(["silence_1", "silence_2", "checkout_reminder", "deferred_reply", "retry_turn", "order_confirmed"])(
    "%s não fecha a conversa",
    (kind) => {
      expect(endsSilenceRuler(kind)).toBe(false);
    },
  );

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));
  const leaveAt = sweep.indexOf("const leave = async");
  const leaveDef = sweep.slice(leaveAt, sweep.indexOf("\n    };", leaveAt));
  const afterLeave = sweep.slice(leaveAt + leaveDef.length);

  it("toda saída da fila depois de `leave` passa por ela — inclusive o toque que renderiza vazio", () => {
    // O silence_3 renderiza null com o cupom inativo (a configuração de hoje): esse ramo é o
    // único que a produção exercita, e foi o que a primeira versão esqueceu.
    expect(afterLeave).not.toContain("await mark(");
    expect(afterLeave.match(/await leave\("canceled"\);/g)?.length).toBe(3);
    expect(afterLeave).toContain('if (!(await leave("sent"))) {');
    const nullBranch = afterLeave.slice(afterLeave.indexOf("if (text === null) {"));
    expect(nullBranch.slice(0, nullBranch.indexOf("continue;"))).toContain('await leave("canceled");');
  });

  it("só marca perdido a linha que esta varredura fechou, pela regra de não regredir", () => {
    expect(source).toContain("conversations(id,lead_id,stage,last_inbound_at,");
    expect(sweep).toContain("&select=id,kind,run_at,");
    expect(sweep).toContain("followups?id=eq.${row.id}&status=eq.scheduled&run_at=eq.${encodeURIComponent(row.run_at)}");
    expect(leaveDef).toContain("const ours = Array.isArray(closed) && closed.length > 0;");
    expect(leaveDef).toContain("if (endsSilenceRuler(kind) && ours) {");
    expect(leaveDef).toContain('persistStage(row.conversation_id, (row.conversations?.stage as Stage | null) ?? "novo", "perdido")');
  });

  it("o toque é fechado antes de ser gravado e enviado; se ela respondeu, não sai", () => {
    const claim = afterLeave.indexOf('if (!(await leave("sent"))) {');
    const skip = afterLeave.indexOf("continue;", claim);
    expect(claim).toBeGreaterThan(-1);
    expect(afterLeave.indexOf('await db("messages"')).toBeGreaterThan(skip);
    expect(afterLeave.indexOf("toSend.push(")).toBeGreaterThan(skip);
  });

  it("a nova tentativa de turno só roda se a varredura fechou a linha", () => {
    const retry = sweep.slice(sweep.indexOf("if (row.kind === RETRY_TURN_KIND)"), leaveAt);
    const claim = retry.indexOf('const claimed = await mark("sent");');
    expect(claim).toBeGreaterThan(-1);
    expect(retry.indexOf("claimed.length === 0")).toBeGreaterThan(claim);
    expect(retry.indexOf("await handleTurn(")).toBeGreaterThan(retry.indexOf("claimed.length === 0"));
  });
});

describe("dois pedidos no mesmo lead: o toque guarda o pedido dele", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("recordOrder arma com o id do pedido gravado e cancela só os toques dele", () => {
    expect(source).toContain("const orderRowId: string | undefined = saved?.[0]?.id;");
    expect(source).toContain("order_id: orderRowId ?? null,");
    expect(source).toContain("followups?conversation_id=eq.${conversation.id}&select=kind,status,order_id");
    expect(source).toContain("    order.status,\n    orderRowId,\n  );");
  });
  it("a varredura lê o pedido do toque, e o último só para linha antiga", () => {
    expect(source).toContain("&select=id,kind,run_at,stop_point,body,order_id,conversation_id,");
    expect(source).toContain("? `orders?id=eq.${row.order_id}&lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method`");
  });
  it("a migração é aditiva e nula", () => {
    const sql = readFileSync("supabase/migrations/0017_followup_order.sql", "utf8");
    expect(sql).toContain("add column if not exists order_id uuid references public.orders(id) on delete set null");
    expect(sql).not.toMatch(/not null/i);
  });
});

describe("dois pedidos no mesmo lead: um cancelado não recusa a conversa", () => {
  it("pedido morto com outro pedido vivo não move o estágio", () => {
    expect(stageForLead("Cancelado", ["Em rota de entrega"])).toBeNull();
    expect(stageForLead("Cancelado", ["Entregue"])).toBeNull();
  });
  it("pedido morto sem outro vivo recusa, como antes", () => {
    expect(stageForLead("Cancelado", [])).toBe("recusado");
    expect(stageForLead("Cancelado", ["Devolvido"])).toBe("recusado");
  });
  it("pedido vivo segue stageForOrder, com ou sem outros", () => {
    expect(stageForLead("Entregue", ["Cancelado"])).toBe("entregue_pago");
    expect(stageForLead("Enviado", [])).toBe("em_rota");
    expect(stageForLead("Não entregue", ["Agendado"])).toBeNull();
  });
  it("recordOrder lê os outros pedidos do lead antes de gravar o estágio", () => {
    const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(source).toContain("orders?lead_id=eq.${lead.id}&external_id=neq.${encodeURIComponent(order.externalId)}&select=status");
    expect(source).toContain("const reached = stageForLead(order.status, (others ?? []).map((o: { status: string | null }) => o.status ?? \"\"));");
  });
});

/**
 * §R10.4 ligado de verdade (operador, 2026-09-26): o lembrete de 15 minutos depois do link
 * nunca era agendado — `scheduleSilenceTouches` chamava `scheduleSilence(from)` sem o ponto
 * de parada. Ligá-lo exige que a resposta dela e a venda o cancelem como cancelam o silêncio,
 * ou ele perguntaria "conseguiu finalizar?" a quem acabou de comprar.
 */
describe("§R10.4: o lembrete de checkout é armado e morre com a venda e com a resposta", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("a régua recebe o ponto de parada e, no adiamento, o toque adiado", () => {
    expect(source).toContain("const rows = rulerFor(from, stopPoint, postponed).map((f) => ({");
    expect(source).toContain("            opening,\n            kind,\n          );");
  });
  it("a resposta dela cancela o lembrete de checkout junto com o silêncio", () => {
    expect(source).toContain('${withCheckout ? "or=(kind.like.silence_*,kind.eq.checkout_reminder)" : "kind=like.silence_*"}');
    expect(source).toContain("await cancelScheduled(conversationId, postponed === undefined || postponed === \"checkout_reminder\");");
  });
  it("link_sent só quando o texto leva um dos links de checkout", () => {
    expect(source).toContain('if (linkSentRecently([replyText], CHECKOUT_BASES)) return "link_sent";');
    expect(source).not.toContain('t.includes("checkout") || t.includes("link")');
  });
  it("a venda cancela o lembrete de checkout", () => {
    const quando = new Date("2026-09-26T15:00:00Z");
    const efeito = onOrderConfirmed(
      [
        { kind: "checkout_reminder", status: "scheduled" },
        { kind: "silence_1", status: "scheduled" },
      ] as never,
      quando,
      1,
    );
    expect(efeito.cancel).toEqual(["checkout_reminder", "silence_1"]);
  });
  it.each([
    ["checkout_reminder", true],
    ["silence_1", true],
    ["silence_3", true],
    ["order_eve", false],
    ["deferred_reply", false],
    ["retry_turn", false],
  ])("%s é da régua de silêncio: %s", (kind, expected) => {
    expect(inSilenceRuler(kind)).toBe(expected);
  });
});

describe("§R10.4, sexta revisão: nem lembrete duplicado, nem lembrete de link que não saiu", () => {
  const link = "https://entrega.logzz.com.br/pay/ccm-1-unidade";
  const bases = [link, "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0", ""];
  // A mesma regra do M-03, sobre uma mensagem só (sétima revisão: nada de segundo helper).
  const sentCheckoutLink = (texto: string, b: readonly string[]) => linkSentRecently([texto], b);
  // Link mandado às 23:40 em São Paulo: o lembrete sai 23:55; o silence_1 (00:10) é adiado.
  const reabertura = new Date("2026-09-27T09:00:00Z");

  it("reancorada pelo silence_1 adiado, a régua não rearma o lembrete que já saiu", () => {
    expect(rulerFor(reabertura, "link_sent", "silence_1").map((f) => f.kind)).toEqual([
      "silence_1",
      "silence_2",
      "silence_3",
    ]);
  });
  it("reancorada pelo próprio lembrete adiado, ele volta", () => {
    expect(rulerFor(reabertura, "link_sent", "checkout_reminder").map((f) => f.kind)[0]).toBe("checkout_reminder");
  });
  it("régua nova, depois de a agente falar com o link, arma o lembrete", () => {
    expect(rulerFor(reabertura, "link_sent").map((f) => f.kind)[0]).toBe("checkout_reminder");
  });

  it("o texto com o link de checkout (com parâmetros) é link enviado", () => {
    expect(sentCheckoutLink(`Aqui está: ${link}?cpf=123&nome=Maria`, bases)).toBe(true);
  });
  it.each([
    "Quer que eu te mande o link pra pagar antecipado?",
    "Ainda não te mandei o link, me confirma o tamanho?",
    "O link não chegou? Me avisa.",
    "Posso te mandar o checkout agora?",
    "Nosso site é https://encorpa-fashion.com.br",
  ])("«%s» não é link enviado", (texto) => {
    expect(sentCheckoutLink(texto, bases)).toBe(false);
  });
  it("base vazia ou ausente nunca casa", () => {
    expect(sentCheckoutLink("qualquer texto", [""])).toBe(false);
  });
});

/**
 * Revisão final de segurança (2026-09-27). O toque pós-pedido lê o pedido pelo `order_id` da
 * linha; sem o `lead_id`, uma colisão de `external_id` (o upsert sobrescreve `lead_id`) faria a
 * cliente A ouvir o valor, as peças e o tamanho do pedido da cliente B. E um `externalId`
 * gigante estourava a URL da segunda leitura depois do upsert já gravado.
 */
describe("revisão de segurança: o pedido do toque é da própria cliente", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("a leitura por order_id também filtra o lead", () => {
    expect(source).toContain("? `orders?id=eq.${row.order_id}&lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method`");
  });
  it("externalId longo demais é recusado antes de gravar", () => {
    const guard = source.indexOf("order.externalId.length > MAX_EXTERNAL_ID");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('await db("orders?on_conflict=external_id"'));
  });
});
