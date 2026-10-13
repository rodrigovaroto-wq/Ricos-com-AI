import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { isKnownOrderStatus, isOrderDead, orderSettled, orderUnpaid, stageForOrder } from "@/agent/followups.js";
import { NEUTRAL_INTERPRETATION, handoffFor, namesAPerson } from "@/agent/interpret.js";
import { logzzSupportPhone, systemPrompt, type PromptConfig } from "@/agent/prompt.js";
import { logzzReturnReply, orderStatusReply, returnsOnly, type OrderView } from "@/agent/retry.js";
import { config as base, ctx } from "./fixtures.js";

/**
 * Operator, 2026-10-13: (1) a question about her order hears its status, read from `orders`, instead of
 * a person; (2) exchange and return go to the Logzz support, whose number is in the config.
 */
const PHONE = "+55 11 91132-7877";
const withPhone: PromptConfig = { ...base, returns: { logzzSupportPhone: PHONE } };
const LINE = logzzReturnReply(PHONE, base.delivery.warrantyDays);
const NOW = new Date("2026-10-13T15:00:00Z");

/** The view the turn builds from a row, with the same readers. */
const view = (status: string, paymentMethod = "cod", scheduledFor: string | null = null): OrderView => ({
  stage: isKnownOrderStatus(status) ? stageForOrder(status) : null,
  dead: isOrderDead(status),
  unpaid: orderUnpaid(status),
  settled: orderSettled(status),
  paymentMethod,
  scheduledFor,
});

const blocked = (text: string, paymentPath: "cod" | "prepay", layer: "agent" | "auto" = "auto", config = withPhone) =>
  runGates(text, ctx({ config, paymentPath, layer })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("o número do suporte da Logzz vem do config, validado", () => {
  it("ausente, placeholder ou lixo: null (comportamento de antes)", () => {
    for (const c of [{}, { returns: {} }, { returns: { logzzSupportPhone: "{{LOGZZ_SUPPORT_PHONE}}" } }, { returns: { logzzSupportPhone: 11911327877 } }, { returns: { logzzSupportPhone: "ligue já" } }])
      expect(logzzSupportPhone(c as never), JSON.stringify(c)).toBeNull();
  });
  it("um telefone: ele mesmo", () => {
    expect(logzzSupportPhone(withPhone)).toBe(PHONE);
    expect(logzzSupportPhone({ returns: { logzzSupportPhone: " 11911327877 " } })).toBe("11911327877");
  });
});

describe("troca e devolução: o número da Logzz, sem custo da troca", () => {
  it("a resposta fixa cita o número e os dias e passa a cadeia nos dois caminhos, em qualquer camada", () => {
    expect(LINE).toContain(PHONE);
    expect(LINE).toContain(`${base.delivery.warrantyDays} dias`);
    for (const p of ["cod", "prepay"] as const) for (const l of ["auto", "agent"] as const) expect(blocked(LINE, p, l)).toEqual([]);
  });
  it("negação: não fala de custo da troca, nem grátis nem pago, nem de link ou valor", () => {
    expect(LINE).not.toMatch(/gr[aá]tis|sem custo|por sua conta|R\$|https?:|frete/i);
  });
});

describe("troca sem custo só com returns.freeExchange === true (operador, 2026-10-13)", () => {
  const free = { ...withPhone, returns: { logzzSupportPhone: PHONE, freeExchange: true } } as PromptConfig;
  const flat = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null).replace(/\s+/g, " ");

  it("ligado: o prompt e a resposta fixa dizem que a troca é sem custo, e passam a cadeia", () => {
    const reply = logzzReturnReply(PHONE, 7, true);
    expect(reply).toContain("A troca é sem custo pra você.");
    expect(flat(free)).toContain(`"A troca é sem custo pra você."`);
    // The prompt's own text; the gate's briefing is guardrails.ts's.
    expect(systemPrompt(free, [], null).replace(/\s+/g, " ")).not.toContain("o envio é por conta dela");
    for (const p of ["cod", "prepay"] as const) {
      expect(blocked(reply, p, "agent", free), p).toEqual([]);
      expect(blocked("A troca é sem custo pra você.", p, "agent", free), p).toEqual([]);
    }
  });

  it("negação: ausente, false ou \"true\" em texto, nada de troca sem custo", () => {
    for (const freeExchange of [undefined, false, "true"]) {
      const c = { ...base, returns: { logzzSupportPhone: PHONE, freeExchange } } as PromptConfig;
      expect(flat(c), String(freeExchange)).not.toContain("A troca é sem custo");
    }
    expect(LINE).not.toContain("sem custo");
    // Without the flag the chain still refuses the free exchange (R17.1).
    expect(blocked(logzzReturnReply(PHONE, 7, true), "cod", "agent", withPhone)).toContain("warranty_promise");
    // Sem o número, a verdade de hoje: o envio da troca é dela.
    expect(flat({ ...base, returns: { freeExchange: false } } as PromptConfig)).toContain("na troca de tamanho o envio é por conta dela");
  });
});

describe("o prompt ensina a Logzz só com o número no config", () => {
  const flat = (c: PromptConfig) => systemPrompt(c, gateBriefing(c), null).replace(/\s+/g, " ");
  const EXEMPLAR = `É só mandar uma mensagem pro suporte da Logzz no ${PHONE} e pedir lá a troca ou a devolução, que eles resolvem pra você.`;

  it("com o número: ensina a frase, que passa a cadeia, e não ensina que o envio da troca é dela", () => {
    const prompt = flat(withPhone);
    expect(prompt).toContain(EXEMPLAR);
    expect(prompt).toContain("Do envio da troca de tamanho não fale nada: nem valor, nem que é por conta dela, nem que é grátis.");
    expect(prompt).not.toContain("na troca de tamanho o envio é por conta dela — nunca diga");
    for (const p of ["cod", "prepay"] as const) expect(blocked(EXEMPLAR, p, "agent")).toEqual([]);
  });

  it("negação: ausente ou placeholder, o prompt é o de antes e não cita a Logzz como suporte", () => {
    for (const c of [base, { ...base, returns: { logzzSupportPhone: "{{LOGZZ_SUPPORT_PHONE}}" } }] as PromptConfig[]) {
      const prompt = flat(c);
      expect(prompt).not.toContain("suporte da Logzz");
      expect(prompt).toContain("na troca de tamanho o envio é por conta dela — nunca diga que a troca é grátis");
    }
  });
});

describe("pós-venda: o status do pedido, em texto fixo (operador, 2026-10-13)", () => {
  it.each([
    ["Agendado", "cod", null, "Seu pedido está confirmado 💛 Logo mais ele deve chegar aí."],
    ["Agendado", "cod", "2026-10-15", "Seu pedido está confirmado e agendado para 15/10 💛 Logo mais ele deve chegar aí."],
    ["Agendado", "cod", "2026-10-13", "Seu pedido está confirmado e agendado para 13/10 💛 Logo mais ele deve chegar aí."],
    ["Aprovado", "prepay", null, "Seu pedido está confirmado 💛 Logo mais ele deve chegar aí."],
    ["Em rota", "cod", "2026-10-14", "Seu pedido já está a caminho 🚚 Ele está agendado para 14/10. Logo mais ele deve chegar aí 💛"],
    ["Aprovado / Enviado", "prepay", null, "Seu pedido já está a caminho 🚚 Logo mais ele deve chegar aí 💛"],
    ["Aguardando pagamento", "prepay", null, "Seu pedido foi criado e está aguardando o pagamento 💛 Assim que o pagamento for confirmado, ele segue pra entrega."],
    ["Cancelado", "cod", null, "Esse pedido aparece aqui como cancelado. Se quiser fazer um novo, é só me falar 💛"],
    ["Aprovado / Devolvido", "prepay", null, "Esse pedido aparece aqui como cancelado. Se quiser fazer um novo, é só me falar 💛"],
  ])("%s (%s, %s)", (status, method, day, reply) => {
    const text = orderStatusReply([view(status, method, day)], NOW);
    expect(text).toBe(reply);
    for (const p of ["cod", "prepay"] as const) for (const l of ["auto", "agent"] as const) expect(blocked(text!, p, l), `${p} ${l}`).toEqual([]);
  });

  it("negação: data que já passou ou ilegível não vira dia; nunca um dia que o pedido não tem", () => {
    expect(orderStatusReply([view("Agendado", "cod", "2026-10-12")], NOW)).toBe("Seu pedido está confirmado 💛 Logo mais ele deve chegar aí.");
    expect(orderStatusReply([view("Em rota", "cod", "15/10")], NOW)).not.toMatch(/\d{2}\/\d{2}/);
    for (const s of ["Agendado", "Em rota", "Aprovado"]) expect(orderStatusReply([view(s)], NOW)).not.toMatch(/\d/);
  });

  it("negação: 'aguardando pagamento' na entrega não é Pix esperando", () => {
    expect(orderStatusReply([view("Aguardando pagamento", "cod")], NOW)).not.toContain("aguardando o pagamento");
  });

  it("nada certo a dizer: null, e uma pessoa como antes", () => {
    expect(orderStatusReply([], NOW)).toBeNull();
    // Fora do vocabulário, ou tentativa frustrada.
    expect(orderStatusReply([view("Status que ninguém mapeou")], NOW)).toBeNull();
    expect(orderStatusReply([view("Frustrado")], NOW)).toBeNull();
    expect(orderStatusReply([view("A reagendar")], NOW)).toBeNull();
    // Entregue: o que ela pergunta de um pacote que já tem é problema ("o rastreio diz entregue mas não recebi").
    expect(orderStatusReply([view("Completo")], NOW)).toBeNull();
    expect(orderStatusReply([view("Aprovado / Entregue", "prepay")], NOW)).toBeNull();
  });

  it("dois pedidos: o mais novo VIVO responde; cancelado só com todos mortos (revisão v20)", () => {
    const onItsWay = "Seu pedido já está a caminho 🚚 Logo mais ele deve chegar aí 💛";
    for (const dead of ["Recusado", "Estornado", "Cancelado", "Aprovado / Devolvido"])
      expect(orderStatusReply([view(dead, "prepay"), view("Aprovado / Em trânsito", "prepay")], NOW), dead).toBe(onItsWay);
    expect(orderStatusReply([view("Cancelado"), view("Recusado", "prepay")], NOW)).toContain("aparece aqui como cancelado");
  });

  it("antecipado sem pagamento confirmado não ouve 'confirmado' (created do n8n, revisão L2)", () => {
    expect(orderStatusReply([view("created", "prepay")], NOW)).toBeNull();
    expect(orderStatusReply([view("Aprovado / Aguardando envio", "prepay")], NOW)).toBe("Seu pedido está confirmado 💛 Logo mais ele deve chegar aí.");
    // Na entrega, o pedido criado está confirmado: paga na porta.
    expect(orderStatusReply([view("created", "cod")], NOW)).toBe("Seu pedido está confirmado 💛 Logo mais ele deve chegar aí.");
  });

  it("cancelar vira devolução pela Logzz só com todos os vivos entregues", () => {
    expect(returnsOnly([view("Completo")])).toBe(true);
    expect(returnsOnly([view("Cancelado"), view("Completo")])).toBe(true);
    expect(returnsOnly([view("Completo"), view("Em rota")])).toBe(false);
    expect(returnsOnly([view("Cancelado")])).toBe(false);
    expect(returnsOnly([])).toBe(false);
  });
});

describe("pedido de pessoa ao lado do pedido: pessoa, nunca o texto fixo (revisão v20)", () => {
  // handoffFor reads post_sale before human; the turn checks the person first in both new blocks.
  it.each([
    "preciso falar com alguém sobre meu pedido, quero mudar o endereço",
    "me passa pra um atendente, meu pedido não chegou",
  ])("%s", (msg) => {
    const i = { ...NEUTRAL_INTERPRETATION, post_sale: true, asks_human: true };
    expect(handoffFor(i, msg, true)).toBe("post_sale");
    expect(namesAPerson(msg)).toBe(true);
  });
  it("negação: 'o rastreio diz entregue mas não recebi' não nomeia pessoa — e o entregue não tem texto fixo", () => {
    expect(namesAPerson("o rastreio diz entregue mas não recebi")).toBe(false);
    expect(orderStatusReply([view("Completo")], NOW)).toBeNull();
  });
});

describe("o turno liga as duas decisões", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("const logzzPhone = logzzSupportPhone(CONFIG);"), source.indexOf('handoffKind === "human" ? HUMAN_HANDOFF_REPLY : ORDER_HANDOFF_REPLY,'));

  it("a troca com o número vai pelo sendFixed, antes do link do Mercado Pago", () => {
    expect(source.indexOf("logzzReturnReply(logzzPhone")).toBeLessThan(source.indexOf("exchangeReply(CONFIG.exchange)"));
    expect(block).toContain("const asksPerson = interpretation.asks_human && namesAPerson(spoken(inbound.body ?? \"\"));");
    expect(block).toContain('if (returnsLine !== null && returnsLine !== lastOutbound && !asksPerson && handoffKind === "post_sale" && interpretation.wants_exchange) {');
    expect(block).toContain("CONFIG.returns?.freeExchange === true");
  });

  it("o pós-venda lê o pedido mais novo e responde pelo sendFixed, sem marcar handoff_at", () => {
    expect(block).toContain("orders?lead_id=eq.${lead.id}&select=status,payment_method,scheduled_for&order=created_at.desc`");
    expect(block).toContain('if (((handoffKind === "post_sale" && !interpretation.wants_exchange) || handoffKind === "cancel") && !asksPerson) {');
    expect(block).toContain("cancelling === null && returnsOnly(orders) ? returnsLine : null");
    // The same fixed line twice is a loop: the second time, a person.
    expect(block).toContain("reply === null || reply === lastOutbound ? null : await sendFixed(reply, ");
    expect(block).toMatch(/await sendFixed\(reply, /);
    const postSale = block.slice(block.indexOf('if ((handoffKind === "post_sale"'), block.indexOf("if (handoffKind !== null) {"));
    expect(postSale).not.toContain("handoff_at:");
    expect(postSale).not.toContain("handOff(");
    // Os três cancelamentos que já tinham resposta vêm antes e não mudam.
    expect(block.indexOf('if (cancelling === "prepaid_pending")')).toBeLessThan(block.indexOf("orderStatusReply("));
  });
});
