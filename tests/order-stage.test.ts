import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { endsSilenceRuler, scheduleSilence, stageForOrder } from "@/agent/followups.js";

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

  it("a varredura grava perdido pela regra de não regredir, nos três jeitos de o toque sair", () => {
    const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(source).toContain("conversations(id,lead_id,stage,last_inbound_at,");
    expect(source.match(/await markLost\(\);/g)?.length).toBe(3);
    expect(source).toContain('persistStage(row.conversation_id, (row.conversations?.stage as Stage | null) ?? "novo", "perdido")');
  });
});
