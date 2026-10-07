import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chasesSilence,
  endsSilenceRuler,
  orderTouchDue,
  inSilenceRuler,
  onOrderConfirmed,
  orderStatusAfter,
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
    ["Pedido entregue", "entregue_pago"],
    ["Aprovado / Entregue", "entregue_pago"],
    ["delivered", "entregue_pago"],
    ["Concluído", "entregue_pago"],
    // Entregue à transportadora é a caminho, não na porta dela (revisão do PR #39).
    ["Entregue à transportadora", "em_rota"],
    ["Entregue ao transportador", "em_rota"],
    ["Entregue para a transportadora", "em_rota"],
    ["Pedido entregue ao correio", "em_rota"],
    ["Pedido entregue aos Correios", "em_rota"],
    ["Aprovado / Entregue à transportadora", "em_rota"],
    ["Não entregue à transportadora", null],
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
  // O que ainda está agendado depois de cada toque sair, na ordem da régua.
  const after = (ruler: ReadonlyArray<{ kind: string }>, i: number) => ruler.slice(i + 1).map((f) => f.kind);

  it("só o último toque da régua fecha a conversa", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    for (const stopPoint of [undefined, "link_sent"] as const) {
      const ruler = scheduleSilence(now, stopPoint);
      const last = ruler.reduce((a, b) => (b.runAt > a.runAt ? b : a));
      expect(ruler.filter((f, i) => endsSilenceRuler(f.kind, after(ruler, i))).map((f) => f.kind)).toEqual([last.kind]);
    }
  });

  // §4a: a conversa que passou da faixa de 63–71 h não tem silence_3; o silence_2 marca perdido.
  it("sem silence_3 na régua ancorada, o silence_2 é quem fecha", () => {
    const entry = new Date("2026-10-05T15:00:00Z");
    const now = new Date(entry.getTime() + 65 * 3_600_000);
    const ruler = scheduleSilence(now, "after_price", { entry, lastInbound: now });
    expect(ruler.filter((f, i) => endsSilenceRuler(f.kind, after(ruler, i))).map((f) => f.kind)).toEqual(["silence_2"]);
  });

  it.each(["silence_1", "silence_2", "silence_3"])("%s com outro silence_* ainda agendado não fecha", (kind) => {
    expect(endsSilenceRuler(kind, ["silence_9"])).toBe(false);
  });

  it.each(["checkout_reminder", "deferred_reply", "retry_turn", "order_confirmed"])("%s nunca fecha a conversa", (kind) => {
    expect(endsSilenceRuler(kind, [])).toBe(false);
    expect(endsSilenceRuler(kind, null)).toBe(false);
  });

  it("leitura falhou: só o silence_3 fecha, como antes", () => {
    expect(endsSilenceRuler("silence_3", null)).toBe(true);
    expect(endsSilenceRuler("silence_2", null)).toBe(false);
  });

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));
  const leaveAt = sweep.indexOf("const leave = async");
  const leaveDef = sweep.slice(leaveAt, sweep.indexOf("\n    };", leaveAt));
  const afterLeave = sweep.slice(leaveAt + leaveDef.length);

  it("toda saída da fila depois de `leave` passa por ela — inclusive o toque que renderiza vazio", () => {
    // O silence_3 renderiza null com o cupom inativo (a configuração de hoje): esse ramo é o
    // único que a produção exercita, e foi o que a primeira versão esqueceu.
    expect(afterLeave).not.toContain("await mark(");
    // Five: the empty render, the gate, the blocked delivery, the order touch its status made
    // moot, and the eve whose delivery day is not tomorrow (D1).
    // And a sixth (4a): the anchored silence_2/silence_3 whose reopening is past its deadline.
    expect(afterLeave.match(/await leave\("canceled"\);/g)?.length).toBe(6);
    expect(afterLeave).toContain('if (!(await leave("sent"))) {');
    const nullBranch = afterLeave.slice(afterLeave.indexOf("if (text === null) {"));
    expect(nullBranch.indexOf("return;")).toBeGreaterThan(-1);
    expect(nullBranch.slice(0, nullBranch.indexOf("return;"))).toContain('await leave("canceled");');
  });

  it("só marca perdido a linha que esta varredura fechou, pela regra de não regredir", () => {
    expect(source).toContain("conversations(id,lead_id,stage,last_inbound_at,");
    expect(sweep).toContain("&select=id,kind,run_at,");
    expect(sweep).toContain("followups?id=eq.${row.id}&status=eq.scheduled&run_at=eq.${encodeURIComponent(row.run_at)}");
    expect(leaveDef).toContain("const ours = Array.isArray(closed) && closed.length > 0;");
    expect(leaveDef).toContain('if (ours && kind.startsWith("silence_")) {');
    expect(leaveDef).toContain("followups?conversation_id=eq.${row.conversation_id}&status=eq.scheduled&kind=like.silence_*&select=kind");
    expect(leaveDef).toContain("if (!sheWrote && endsSilenceRuler(kind, Array.isArray(rest) ? rest.map((r: { kind: string }) => r.kind) : null)) {");
    expect(leaveDef).toContain('persistStage(row.conversation_id, (row.conversations?.stage as Stage | null) ?? "novo", "perdido")');
  });

  it("o toque é fechado antes de ser gravado e enviado; se ela respondeu, não sai", () => {
    const claim = afterLeave.indexOf('if (!(await leave("sent"))) {');
    const skip = afterLeave.indexOf("return;", claim);
    expect(claim).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(claim);
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
    expect(source).toContain("    status,\n    orderRowId,\n    scheduledFor,\n  );");
  });
  it("a varredura lê o pedido do toque, e o último só para linha antiga", () => {
    expect(source).toContain("&select=id,kind,run_at,stop_point,body,order_id,conversation_id,");
    expect(source).toContain("? `orders?id=eq.${row.order_id}&lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method,status,scheduled_for`");
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
    expect(source).toContain("orders?lead_id=eq.${lead.id}&external_id=neq.${encodeURIComponent(order.externalId)}&select=id,status,created_at,scheduled_for&order=created_at.desc");
    expect(source).toContain("const reached = stageForLead(status, otherStatuses);");
  });
});

/**
 * §R10.4 ligado de verdade (operador, 2026-09-26): o lembrete de 15 minutos depois do link
 * nunca era agendado — `scheduleSilenceTouches` chamava `scheduleSilence(from)` sem o ponto
 * de parada. Ligá-lo exige que a resposta dela e a venda o cancelem como cancelam o silêncio,
 * ou ele perguntaria "conseguiu finalizar?" a quem acabou de comprar.
 */
describe("§4a: perdido nunca numa conversa em que ela acabou de escrever", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("o fim da régua confere a última mensagem dela contra a hora do toque", () => {
    expect(source).toContain('const sheWrote = typeof since === "string" && Date.parse(since) > Date.parse(row.run_at);');
    expect(source).toContain("if (!sheWrote && endsSilenceRuler(");
  });
  it("negação: sem mensagem nova dela o fim da régua continua marcando perdido", () => {
    expect(source).not.toContain("if (sheWrote && endsSilenceRuler(");
  });
});

describe("§4a: sem âncora (leitura falhou), a régua sai sem silence_3", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("o silence_3 só é armado com a âncora da entrada", () => {
    expect(source).toContain('const rows = (anchors ? ruler : ruler.filter((f) => f.kind !== "silence_3")).map((f) => ({');
  });
  it("negação: com âncora, a régua passa inteira (o filtro não corta o silence_3 ancorado)", () => {
    expect(source).not.toContain('const rows = ruler.filter((f) => f.kind !== "silence_3").map(');
  });
});

describe("§R10.4: o lembrete de checkout é armado e morre com a venda e com a resposta", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("a régua recebe o ponto de parada e, no adiamento, o toque adiado", () => {
    expect(source).toContain("const ruler = oncePerDay(rulerFor(from, stopPoint, postponed, linkInReply, anchors, askedQuestion), sentAt);");
    expect(source).toContain("            opening,\n            kind,\n          );");
  });
  it("a resposta dela cancela o lembrete de checkout junto com o silêncio", () => {
    expect(source).toContain('${withCheckout ? "or=(kind.like.silence_*,kind.eq.checkout_reminder,kind.eq.still_there)" : "kind=like.silence_*"}');
    expect(source).toContain("await cancelScheduled(conversationId, postponed === undefined || postponed === \"checkout_reminder\");");
  });
  it("link_sent só quando o texto leva um dos links de checkout", () => {
    expect(source).toContain('if (linkSentRecently([...earlier, replyText], CHECKOUT_BASES)) return "link_sent";');
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
      quando,
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
    ["still_there", true],
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
    expect(rulerFor(reabertura, "link_sent", undefined, true).map((f) => f.kind)[0]).toBe("checkout_reminder");
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
    expect(source).toContain("? `orders?id=eq.${row.order_id}&lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method,status,scheduled_for`");
  });
  it("externalId longo demais é recusado antes de gravar", () => {
    const guard = source.indexOf("order.externalId.length > MAX_EXTERNAL_ID");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('await db("orders?on_conflict=external_id"'));
  });
});

/**
 * Segunda revisão (2026-09-28), achados fora do gate. Cada um reproduzido antes por execução
 * da Edge Function contra um PostgREST falso; aqui fica a ordem que o conserto exige, no
 * arquivo que a produção roda. O comportamento das decisões puras está em followups.test.ts.
 */
describe("segunda revisão: varredura e webhook de venda", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("o ponto de parada lê a janela M-03; o lembrete, só a resposta que levou o link", () => {
    expect(source).toContain(
      "  await scheduleSilenceTouches(\n    conversation.id,\n    stopPointOf(replyText, recentOutbound),\n    linkSentRecently([replyText], CHECKOUT_BASES),\n    new Date(),\n    undefined,\n    endsWithQuestion(replyText),\n  );",
    );
    expect(source).toContain('extra.checkoutUrl ? "link_sent" : stopPointOf(text, recentOutbound),');
    expect(sweep).toContain("stopPointOf(text, earlier), linkSentRecently([text], CHECKOUT_BASES), new Date(), undefined, endsWithQuestion(text)");
  });

  it("o adiamento só reancora a linha que esta varredura leu", () => {
    const postpone = sweep.slice(sweep.indexOf('if (action.do === "postpone") {'));
    const owned = postpone.indexOf("if (!Array.isArray(moved) || moved.length === 0) {");
    expect(postpone).toContain("`followups?id=eq.${row.id}&status=eq.scheduled&run_at=eq.${encodeURIComponent(row.run_at)}`,");
    expect(owned).toBeGreaterThan(-1);
    expect(postpone.indexOf("await scheduleSilenceTouches(")).toBeGreaterThan(owned);
  });

  it("a nova tentativa fora da janela só vira handoff se a varredura fechou a linha", () => {
    const retry = sweep.slice(sweep.indexOf("if (!windowIsOpen(new Date(), retryInbound)) {"));
    const owned = retry.indexOf("if (!Array.isArray(closed) || closed.length === 0) {");
    expect(retry).toContain('const closed = await mark("canceled");');
    expect(owned).toBeGreaterThan(-1);
    expect(retry.indexOf("handoff_at: new Date().toISOString()")).toBeGreaterThan(owned);
  });

  it("uma linha que lança não derruba a varredura", () => {
    expect(sweep).toContain("await sweepRow(row).catch((error) => {");
    expect(sweep).not.toMatch(/^ {4}continue;$/m);
  });

  it("externalId malformado é recusado antes de gravar", () => {
    const guard = source.indexOf("if (!order.externalId.isWellFormed()) return { status: \"external_id_malformed\", ok: false };");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf('await db("orders?on_conflict=external_id"'));
  });

  it("recusado reabre só pela venda nova, e os toques do morto passam ao vivo sem tocar o que saiu", () => {
    expect(source).toContain('if (reached && conversation.stage === "recusado" && reopensRefused(status, otherStatuses)) {');
    expect(source).toContain("await db(`conversations?id=eq.${conversation.id}&stage=eq.recusado`, {");
    expect(source).toContain("await db(`followups?conversation_id=eq.${conversation.id}&kind=eq.${f.kind}&status=neq.sent`, {");
  });
});

/**
 * Terceira revisão (2026-09-28): `orders` era gravado último-que-chega-vence, e um "created"
 * ou "Enviado" atrasado depois do "Cancelado" ressuscitava o pedido. O irmão vivo via um
 * pedido vivo onde havia um morto: régua pós-pedido inteira num cancelado, ou o pedido real
 * sem régua e o lead preso em recusado. Reproduzido pela Edge Function contra um PostgREST
 * falso, nas 24 ordens de chegada de dois pedidos.
 */
describe("terceira revisão: pedido morto não ressuscita por webhook atrasado", () => {
  it("status vivo atrasado não sobrescreve um morto do mesmo pedido", () => {
    expect(orderStatusAfter("Cancelado", "created")).toBe("Cancelado");
    expect(orderStatusAfter("Cancelado", "Aprovado / Enviado")).toBe("Cancelado");
    expect(orderStatusAfter("Devolvido", "Entregue")).toBe("Devolvido");
  });
  it("entregue não volta a vivo por status atrasado; só a morte o sobrescreve (revisão do PR #39, achado 1)", () => {
    for (const atrasado of ["created", "Em rota", "Em rota de entrega", "Aprovado / Enviado", "Agendado", "Não entregue", "Entregue à transportadora"]) {
      expect(orderStatusAfter("Entregue", atrasado)).toBe("Entregue");
      expect(orderStatusAfter("Aprovado / Entregue", atrasado)).toBe("Aprovado / Entregue");
    }
    expect(orderStatusAfter("Entregue", "Devolvido")).toBe("Devolvido");
    expect(orderStatusAfter("Entregue", "Recusado na entrega")).toBe("Recusado na entrega");
    // Entregue à transportadora é em rota: a entrega de verdade ainda o sobrescreve.
    expect(orderStatusAfter("Entregue à transportadora", "Entregue")).toBe("Entregue");
  });
  it("o caminho inteiro: «Entregue» e depois «created» atrasado não rearma confirmação, envio nem véspera", () => {
    const orderedAt = new Date("2026-09-28T12:00:00Z");
    const now = new Date("2026-09-29T12:00:00Z");
    const armada = [
      { kind: "order_confirmed", status: "canceled", orderId: "A" },
      { kind: "order_delivered", status: "scheduled", orderId: "A" },
    ] as const;
    for (const atrasado of ["created", "Em rota de entrega", "Aprovado / Enviado"]) {
      const status = orderStatusAfter("Entregue", atrasado);
      const efeito = onOrderConfirmed([...armada], orderedAt, now, status, "A", "2026-09-30");
      expect(efeito.arm).toEqual([]);
      expect(efeito.move).toEqual([]);
      expect(orderTouchDue("order_eve", status)).toBe(false);
      // Sem a linha de confirmação: o primeiro webhook tardio também não arma nada além da entrega.
      expect(onOrderConfirmed([], orderedAt, now, status, "A", "2026-09-30").arm.map((f) => f.kind)).toEqual(["order_delivered"]);
    }
  });
  it("o resto segue o webhook: primeiro status, avanço, e morte de um vivo", () => {
    expect(orderStatusAfter(undefined, "created")).toBe("created");
    expect(orderStatusAfter(null, "Cancelado")).toBe("Cancelado");
    expect(orderStatusAfter("created", "Aprovado / Enviado")).toBe("Aprovado / Enviado");
    expect(orderStatusAfter("Aprovado / Enviado", "Cancelado")).toBe("Cancelado");
    expect(orderStatusAfter("Cancelado", "Recusado na entrega")).toBe("Recusado na entrega");
  });

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const record = source.slice(source.indexOf("const recordOrder"), source.indexOf("const RETRY_TURN_KIND"));
  it("o status gravado e toda decisão leem o status efetivo, lido antes do upsert", () => {
    const read = record.indexOf("orders?external_id=eq.${encodeURIComponent(order.externalId)}&select=status");
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(record.indexOf('await db("orders?on_conflict=external_id"'));
    expect(record).toContain('const status = orderStatusAfter(stored?.[0]?.status, order.status ?? "created");');
    expect(record).not.toContain("order.status,");
    expect(record).not.toContain("status: order.status");
    expect(record).toContain("{ id: orderRowId, status, orderedAt, scheduledFor },");
  });
  it("created_at do pedido é a data do pedido, que o takeover usa para os outros", () => {
    expect(record).toContain("{ created_at: orderedOn.toISOString() }");
    expect(record).toContain("orderedAt: new Date(o.created_at)");
  });
});

/**
 * HANDOFF, "obrigatório antes de leads reais": quem escrevia DEPOIS de comprar voltava a
 * receber a régua de silêncio ("me diz que tamanho você usa", o cupom). A venda cancelava o
 * silêncio uma vez (`onOrderConfirmed`), e o turno seguinte dela — "obrigada!", "chega
 * quando?" — rearmava tudo: `scheduleSilenceTouches` não lia estágio nem pedido, e a
 * varredura também não. A decisão é `chasesSilence`, lida no único ponto por onde passam os
 * quatro chamadores e, de novo, na varredura, antes de o toque sair.
 */
describe("depois da compra, a régua de silêncio não volta", () => {
  it.each(["pedido_criado", "em_rota", "entregue_pago"])("estágio %s: não persegue", (stage) => {
    expect(chasesSilence(stage, [])).toBe(false);
  });
  it.each([["created"], ["Aprovado / Enviado"], ["Entregue"], ["Não entregue"], [""]])(
    "pedido vivo «%s» no lead: não persegue, em qualquer estágio",
    (status) => {
      for (const stage of ["conversando", "tamanho_definido", "perdido", "recusado", null]) {
        expect(chasesSilence(stage, [status])).toBe(false);
      }
    },
  );
  it("pedido morto e nenhum vivo: ela volta a ser uma venda em aberto, a régua persegue (§16, R2 4b)", () => {
    expect(chasesSilence("recusado", ["Cancelado"])).toBe(true);
    expect(chasesSilence("recusado", ["Cancelado", "Recusado na entrega"])).toBe(true);
    expect(chasesSilence("conversando", [])).toBe(true);
    expect(chasesSilence(null, [])).toBe(true);
  });
  it("um morto e um vivo: o vivo manda", () => {
    expect(chasesSilence("em_rota", ["Cancelado", "Enviado"])).toBe(false);
    expect(chasesSilence("recusado", ["Cancelado", "created"])).toBe(false);
  });

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const schedule = source.slice(source.indexOf("const scheduleSilenceTouches"), source.indexOf("const recordOrder"));
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("scheduleSilenceTouches lê estágio e pedidos do lead e, depois da compra, só cancela", () => {
    const read = schedule.indexOf("conversations?id=eq.${conversationId}&select=*,leads(orders(status))");
    const guard = schedule.indexOf("if (at && !chasesSilence(");
    expect(read).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(read);
    const bail = schedule.slice(guard, schedule.indexOf("return;", guard));
    expect(bail).toContain("await cancelScheduled(conversationId);");
    expect(schedule.indexOf("rulerFor(")).toBeGreaterThan(guard);
  });

  it("a varredura lê os pedidos do lead e cancela o silêncio de quem comprou antes de qualquer envio", () => {
    expect(sweep).toContain(",orders(status)))&limit=50");
    const guard = sweep.indexOf("if (inSilenceRuler(row.kind) && !chasesSilence(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(sweep.indexOf("if (row.kind === RETRY_TURN_KIND)"));
    const bail = sweep.slice(guard, sweep.indexOf("return;", guard));
    expect(bail).toContain('await mark("canceled");');
  });

  it("a varredura cancela o toque pós-pedido que o status do pedido já tornou sem sentido", () => {
    expect(sweep).toContain("&select=amount_brl,units,size,payment_method,status,scheduled_for`");
    const guard = sweep.indexOf("if (order && !orderTouchDue(kind, order.status ?? undefined)) {");
    expect(guard).toBeGreaterThan(sweep.indexOf("const order = kind.startsWith(\"order_\")"));
    const bail = sweep.slice(guard, sweep.indexOf("return;", guard));
    expect(bail).toContain('await leave("canceled");');
    expect(guard).toBeLessThan(sweep.indexOf("const delivery = deliveryFor("));
  });
});

/**
 * Revisão do PR #39 e cruzamento D1–D3 (2026-09-29), no arquivo que a produção roda. As decisões
 * puras estão em followups.test.ts; aqui fica o que só o `index.ts` faz: ler e gravar a data, a
 * trava da véspera no envio, o cancelamento que não reescreve o que saiu e a praça do lead.
 */
describe("revisão do PR #39: pós-pedido por status e data, e a praça gravada", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const record = source.slice(source.indexOf("const recordOrder"), source.indexOf("const RETRY_TURN_KIND"));
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("o cancelamento do webhook só toca linha ainda agendada — a que acabou de sair fica sent", () => {
    expect(record).toContain("await db(`followups?conversation_id=eq.${conversation.id}&kind=eq.${kind}&status=eq.scheduled`, {");
    expect(record).not.toContain("`followups?conversation_id=eq.${conversation.id}&kind=eq.${kind}`");
  });

  it("a data em vigor é a do webhook, ou a gravada quando ele não traz — nunca apagada por um webhook sem data", () => {
    const read = record.indexOf("orders?external_id=eq.${encodeURIComponent(order.externalId)}&select=status,scheduled_for");
    expect(read).toBeGreaterThan(-1);
    expect(record).toContain("const scheduledFor: string | null = order.scheduledFor ?? stored?.[0]?.scheduled_for ?? null;");
    expect(record).toContain("      scheduled_for: scheduledFor,\n");
    expect(record).not.toContain("scheduled_for: order.scheduledFor ?? null");
  });

  it("a véspera remarcada é a mesma linha, só se não saiu", () => {
    expect(record).toContain("for (const f of effect.move) {");
    expect(record).toContain("&select=kind,status,order_id,run_at`");
    const move = record.slice(record.indexOf("for (const f of effect.move) {"));
    expect(move).toContain("`followups?conversation_id=eq.${conversation.id}&kind=eq.${f.kind}&status=neq.sent`");
  });

  it("a varredura só manda a véspera se a entrega é amanhã, pela data do pedido de agora", () => {
    const lock = sweep.indexOf('if (kind === "order_eve" && !eveIsTomorrow(order?.scheduled_for, new Date())) {');
    expect(lock).toBeGreaterThan(sweep.indexOf("const order = kind.startsWith(\"order_\")"));
    expect(lock).toBeLessThan(sweep.indexOf("const delivery = deliveryFor("));
    expect(sweep.slice(lock, sweep.indexOf("return;", lock))).toContain('await leave("canceled");');
  });

  it("a varredura julga e escreve o silêncio no caminho antecipado quando a praça não tem entrega", () => {
    expect(sweep).toContain(",payment_choice,payment_choice_at,address");
    expect(sweep).toContain('fresh(lead.payment_choice_at) && lead.payment_choice === "prepay") || lead.address?.codAvailable === false');
    expect(sweep).toContain("      paymentPath: touchPath,\n      body:");
  });

  it("o turno grava a praça no lead quando a consulta respondeu", () => {
    expect(source).toContain("const codAvailable = region !== null ? region.cod : addressDraft.cep === storedAddress.cep ? storedAddress.codAvailable : undefined;");
    expect(source).toContain("if (addressChanged || codAvailable !== storedAddress.codAvailable) {");
    expect(source).toContain("...(codAvailable !== undefined ? { codAvailable } : {}),");
    // Fora do rascunho: a praça não viaja para o pedido da Coinzz nem para a leitura do endereço.
    expect(source).toContain("delete (addressDraft as { codAvailable?: boolean }).codAvailable;");
  });

  it("todo gate do turno sabe se a praça dela não tem pagamento na entrega (R16.2)", () => {
    const turn = source.slice(source.indexOf("const handleTurn"));
    const declared = turn.indexOf("let codUnavailable = (lead.address as { codAvailable?: boolean } | null)?.codAvailable === false;");
    expect(declared).toBeGreaterThan(-1);
    // Seis chamadas, contando a da varredura; as cinco do turno leem a variável.
    expect(source.match(/runGates\(/g)?.length).toBe(6);
    for (const call of turn.split("runGates(").slice(1)) expect(call.slice(0, call.indexOf("});"))).toContain("codUnavailable");
    // A consulta desta volta vence o que estava gravado.
    expect(turn.indexOf("  codUnavailable = codAvailable === false;\n")).toBeGreaterThan(turn.indexOf("const codAvailable = region !== null"));
  });

  it("a varredura: praça gravada antes do pedido, e a data do pedido na confirmação (Q5)", () => {
    expect(sweep).toContain("codUnavailable: !order && lead.address?.codAvailable === false,");
    expect(sweep).toContain("scheduledFor: order?.scheduled_for ?? null,");
  });
});

/**
 * Mês 1, §4a (2026-10-02): a régua ancorada na entrada e na última mensagem dela. O turno nunca
 * fecha conversa, então a entrada nova por anúncio é o `referral` do CTWA (`payload.source`),
 * gravado em `entry_at` (0022) — numa escrita própria, porque antes da migração a coluna não
 * existe e a falha não pode levar junto o `last_inbound_at`.
 */
describe("§4a: a régua lê a entrada e a última mensagem dela", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("a mensagem de anúncio grava entry_at, à parte do last_inbound_at e sem derrubar o turno", () => {
    const write = source.indexOf("body: JSON.stringify({ entry_at: inboundAt.toISOString() }),");
    expect(write).toBeGreaterThan(source.indexOf("body: JSON.stringify({ last_inbound_at: inboundAt.toISOString() }),"));
    expect(source.slice(write - 160, write)).toContain("if (payload.source) {");
    expect(source.slice(write, write + 120)).toContain("}).catch(() => undefined);");
  });

  it("âncora = entry_at ?? created_at, lida de select=* (a coluna pode ainda não existir)", () => {
    expect(source).toContain('const entry = Date.parse(c?.entry_at ?? c?.created_at ?? "");');
    expect(source).not.toMatch(/select=[^`"]*entry_at/);
  });

  it("o adiamento de silence_2/silence_3 sem horário dentro do prazo sai por leave, antes de reancorar", () => {
    const postpone = sweep.slice(sweep.indexOf('if (action.do === "postpone") {'));
    const check = postpone.indexOf("if (anchors && !rulerFor(opening, stopPoint, kind, false, anchors).some((f) => f.kind === kind)) {");
    expect(check).toBeGreaterThan(-1);
    expect(postpone.slice(check, postpone.indexOf("return;", check))).toContain('await leave("canceled");');
    expect(check).toBeLessThan(postpone.indexOf("await scheduleSilenceTouches("));
  });
});
