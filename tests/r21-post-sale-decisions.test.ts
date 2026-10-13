import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { isKnownOrderStatus, isOrderDead, orderSettled, orderUnpaid, paymentRoute, stageForOrder } from "@/agent/followups.js";
import { NEUTRAL_INTERPRETATION, handoffFor, namesAPerson, namesExchangeOrReturn } from "@/agent/interpret.js";
import { deliveredDirective, orderStatusReply, otherQuestionDirective, type OrderView } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Operator's decisions of 2026-10-13 (R21.1: the person is the last resort): only an explicit request
 * is a request for a person; a delivered order's problem is answered by the model with the order's
 * facts; "paguei" without the payment waits 5 minutes and only then goes to a person; the deadline
 * question beside another one gets both answers.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const NOW = new Date("2026-10-13T15:00:00Z");
const PHONE = "+55 11 91132-7877";
const view = (status: string, paymentMethod = "cod", scheduledFor: string | null = null): OrderView => ({
  stage: isKnownOrderStatus(status) ? stageForOrder(status) : null,
  dead: isOrderDead(status),
  unpaid: orderUnpaid(status),
  settled: orderSettled(status),
  paymentMethod,
  scheduledFor,
});

describe("1. pedido de pessoa: só o explícito", () => {
  it.each([
    "quero falar com uma pessoa",
    "quero falar com um humano",
    "quero falar com um atendente",
    "quero falar com alguém de verdade",
    "me passa pra um atendente",
    "pode me transferir pra um humano?",
    "tem gente de verdade aí? quero falar com ela",
    "posso falar com uma pessoa?",
    "dá pra falar com alguém de verdade?",
    "não quero falar com robô, quero uma pessoa",
    "quero falar com a gerente",
    "Não tem um humano aí pra me ajudar?",
    "chama um atendente por favor",
  ])("pede: %s", (msg) => {
    expect(namesAPerson(msg)).toBe(true);
    expect(handoffFor({ ...NEUTRAL_INTERPRETATION, asks_human: true }, msg, false)).toBe("human");
  });

  it.each([
    "preciso falar com alguém sobre meu pedido",
    "quero falar com alguém sobre a troca",
    "não quero falar com atendente",
    "nao preciso de atendente nao",
    "não precisa me passar pra atendente",
    "vc é humano?",
    "você é uma pessoa de verdade?",
    "tem alguém aí?",
    "tem alguem ai de verdade?",
    "uma pessoa me indicou",
    "minha amiga comprou",
    "a atendente da loja me indicou",
    "minha amiga comprou, quero falar com ela",
    "o suporte na lombar é bom?",
  ])("não pede: %s", (msg) => {
    expect(namesAPerson(msg)).toBe(false);
    // Even with the model reading a request, the text decides.
    expect(handoffFor({ ...NEUTRAL_INTERPRETATION, asks_human: true }, msg, false)).toBeNull();
  });
});

describe("5. troca/devolução só quando ela pede; entregue com problema → o modelo com os fatos", () => {
  it.each(["quero trocar pelo G", "quero devolver", "como faço a devolução?", "quero meu dinheiro de volta", "dá pra trocar o tamanho?", "quero o reembolso"])(
    "pede troca ou devolução: %s",
    (msg) => expect(namesExchangeOrReturn(msg)).toBe(true),
  );
  it.each(["veio com defeito", "não serviu", "o rastreio diz entregue mas não recebi", "chegou amassado", "ficou apertado"])(
    "negação — reclamação sem pedir troca: %s",
    (msg) => expect(namesExchangeOrReturn(msg)).toBe(false),
  );

  it("a diretiva leva os fatos do pedido (status, caminho, data só de scheduled_for) e o suporte da Logzz só para o que é da Logzz", () => {
    const d = deliveredDirective([view("Completo", "cod", "2026-10-15"), view("Cancelado", "prepay")], NOW, PHONE);
    expect(d).toContain("pedido mais recente: aparece aqui como entregue, pago na entrega, data de entrega 15/10");
    expect(d).toContain("pedido anterior: aparece aqui como cancelado, pago antecipado");
    expect(d).toContain(PHONE);
    expect(d).toContain("Troca ou devolução só se ela pedir");
    expect(d).toContain("nunca ofereça por conta própria");
    expect(d).toContain("não chama ninguém");
    // Negation: a past day is no fact to say.
    expect(deliveredDirective([view("Completo", "cod", "2026-10-01")], NOW, PHONE)).not.toMatch(/\d{2}\/\d{2}/);
  });

  it("as respostas que a diretiva pede passam a cadeia do agente", () => {
    for (const text of [
      `Poxa, sinto muito! Confere com os vizinhos ou com a portaria, por favor. Se não estiver lá, fala com o suporte da Logzz, que é quem faz a entrega e consegue verificar, no ${PHONE} 💛`,
      "Que pena que veio com defeito! Me conta o que aconteceu com o colete?",
    ])
      for (const p of ["cod", "prepay"] as const)
        expect(runGates(text, ctx({ config, paymentPath: p })).traces.filter((t) => t.verdict === "block").map((t) => t.gate), `${p}: ${text}`).toEqual([]);
  });
});

describe("2/3. o mais recente como referência, e 'confirmado' só com o pagamento confirmado", () => {
  it("antecipado sem pagamento confirmado ao lado de outro pedido: aguardando a confirmação, nunca confirmado", () => {
    for (const s of ["created", "Aguardando pagamento", "Pedido criado"])
      expect(orderStatusReply([view(s, "prepay"), view("Em rota")], NOW), s).toBe(
        "Seu pedido mais recente está aguardando a confirmação do pagamento. O anterior já está a caminho, e você paga quando receber 💛",
      );
    expect(orderStatusReply([view("Em rota"), view("created", "prepay")], NOW)).toBe(
      "Seu pedido mais recente já está a caminho, e você paga quando receber. O anterior está aguardando a confirmação do pagamento 💛",
    );
  });
});

describe("4. 'paguei' sem pagamento: status, esperar, e só aos 5 min uma pessoa", () => {
  const base = { saidPaid: false, asksStatus: false, receipt: false, linkSent: true, paid: false, checking: false };
  it("o primeiro 'paguei' arma a verificação; insistir durante ela pede para esperar", () => {
    expect(paymentRoute({ ...base, saidPaid: true })).toBe("check");
    expect(paymentRoute({ ...base, checking: true, saidPaid: true })).toBe("still_checking");
    expect(paymentRoute({ ...base, checking: true, asksStatus: true })).toBe("still_checking");
  });
  it("negação: pago de verdade nunca vai a uma pessoa; na entrega não é este caminho", () => {
    expect(paymentRoute({ ...base, paid: true, saidPaid: true })).toBe("confirmed");
    expect(paymentRoute({ ...base, codOrder: true, saidPaid: true })).toBeNull();
  });
  it("a varredura: pagamento chegou → cancela; não chegou → pessoa, com o motivo", () => {
    const paid = turn.indexOf('if (row.kind === "payment_check" && !checkoutStillOpen(statuses)) {');
    const person = turn.indexOf('if (row.kind === "payment_check") {');
    expect(paid).toBeGreaterThan(-1);
    expect(paid).toBeLessThan(person);
  });
});

describe("6. prazo junto com outra pergunta: as duas respondidas", () => {
  it("a diretiva diz que o prazo já foi respondido e pede só a outra pergunta, sem prazo", () => {
    const d = otherQuestionDirective("Dependendo da sua região…", ["e se eu pedir reembolso?"]);
    expect(d).toContain('"Dependendo da sua região…"');
    expect(d).toContain('"e se eu pedir reembolso?"');
    expect(d).toContain("Não fale de prazo, entrega, dia, data nem cobertura");
  });
  it("o turno: só no fallback de prazo, uma chamada sem reescrita, e vetada só o prazo", () => {
    expect(turn).toContain("const otherQuestions = fallbackReason !== null && asksWhen");
    expect(turn).toContain('clauses.filter((q: string) => asksSomething(q) && !leadsIn(q) && !asksDeadline(q))');
    expect(turn).toContain("}, Date.now() + RETRY_TURN_BUDGET_MS, 0);");
    expect(turn).toContain("const body = other === null || other.deferred ? fixedOrDraft : `${fixedOrDraft}\\n\\n${other.text}`;");
    // The ceiling: every draftWith call checks it before paying.
    expect(turn).toContain("for (let rewrites = 0; rewrites <= maxRewrites && spent < ceilingBrl; rewrites += 1) {");
  });
});
