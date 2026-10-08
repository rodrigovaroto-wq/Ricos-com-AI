import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksPaymentStatus, isBareAck, isPaymentReceipt, missingForLink, nudgesCheck, saysPaid } from "@/agent/interpret.js";
import { emailInChat } from "@/agent/identity.js";
import { buildPrefilledCheckoutLink } from "@/agent/coinzz.js";
import {
  ACK_HELP_MS,
  ackGoesUnanswered,
  ackHelpText,
  checkoutStillOpen,
  CHECKOUT_REMINDER_MS,
  onOrderConfirmed,
  orderUnpaid,
  PAYMENT_CHECK_MS,
  PAYMENT_CHECK_REPLY,
  PAYMENT_RECEIPT_ASK,
  paymentFacts,
  paymentRoute,
  renderFollowup,
  rulerFor,
} from "@/agent/followups.js";
import { config, ctx } from "./fixtures.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { NO_FREE_SHIPPING_PREPAY, riskReversalMessage, systemPrompt } from "@/agent/prompt.js";

/**
 * L2, the operator's and the partner's real tests (2026-10-08, grafo §67). Every phrase here is
 * literal from those conversations, plus the negations each reader must not swallow.
 */
describe("L2 — um 'ok' sozinho não ganha resposta", () => {
  it("as confirmações literais da Leila são só confirmação", () => {
    for (const parts of [["aah entendi, ok"], ["ok"], ["ta bom"], ["tá bom"], ["Ok!"], ["blz"], ["👍"], ["entendi"], ["certo", "ok"]]) {
      expect(isBareAck(parts), parts.join(" | ")).toBe(true);
    }
  });

  it("negação: confirmação com pergunta, decisão, dado ou recusa não é só confirmação", () => {
    for (const parts of [
      ["aah entendi, ok", "teria como me mandar foto dele?"],
      ["ok?"],
      ["ok, mas e o frete?"],
      ["ok quero"],
      ["não ok"],
      ["nao"],
      ["sim"],
      ["ok 04710090"],
      ["Perfeito! Aceita pix ne?"],
      ["obrigada"],
      ["ta bom", "meu cep é 04710090"],
      [""],
      [],
    ]) {
      expect(isBareAck(parts), parts.join(" | ")).toBe(false);
    }
  });

  it("depois de um pedido de dado ou de uma mensagem sem pergunta, o 'ok' fica sem resposta", () => {
    // 17:12 — "Me passa seu CEP?" + "aah entendi, ok" got "Que bom que fez sentido…" (L4).
    expect(ackGoesUnanswered(true, "Me passa seu CEP? Aí eu já vejo como fica a entrega", "cep")).toBe(true);
    // 17:22 — "Qualquer coisa que travar me fala aqui que eu te ajudo" + "ok" got "Que bom…" (L8).
    expect(ackGoesUnanswered(true, "É isso mesmo, lá no checkout ele pede o e-mail.\n\nQualquer coisa que travar me fala aqui que eu te ajudo", null)).toBe(true);
  });

  it("negação: depois de pergunta de sim/não ou de escolha, o 'ok' é decisão e ganha resposta", () => {
    expect(ackGoesUnanswered(true, "Prefere pagar na entrega ou no antecipado com desconto?", null)).toBe(false);
    expect(ackGoesUnanswered(true, "Quer que eu deixe no antecipado?", null)).toBe(false);
    expect(ackGoesUnanswered(false, "Me passa seu CEP?", "cep")).toBe(false);
  });

  it("aos 10 minutos ela recebe a oferta de ajuda com o dado pedido — e nada pelo nome", () => {
    expect(ACK_HELP_MS).toBe(10 * 60_000);
    expect(ackHelpText("cep")).toBe("Precisa de alguma ajuda com o CEP?");
    expect(ackHelpText("cpf")).toBe("Precisa de alguma ajuda com o CPF?");
    expect(ackHelpText("email")).toBe("Precisa de alguma ajuda com o e-mail?");
    expect(ackHelpText("size")).toBe("Precisa de alguma ajuda pra achar o seu tamanho?");
    expect(ackHelpText("name")).toBeNull();
    expect(ackHelpText(null)).toBeNull();
  });

  it("a função de produção para antes do intérprete, sem chamar o modelo, e arma a ajuda", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    const ack = turn.indexOf("if (!isRetry && !isResume && ackGoesUnanswered(isBareAck(parts), lastOutbound, datum))");
    expect(ack).toBeGreaterThan(-1);
    expect(ack).toBeLessThan(turn.indexOf("const ask = interpretRequest(lastOutbound"));
    expect(turn).toContain("ackHelpText(datum)");
    expect(turn).toContain("ACK_HELP_MS");
  });
});

describe("L2 — o lembrete do checkout ancora no link e só o pedido o tira", () => {
  const link = new Date("2026-10-08T21:23:51Z");

  it("sai 10 minutos depois do link, com o texto do operador nos dois caminhos", () => {
    expect(CHECKOUT_REMINDER_MS).toBe(10 * 60_000);
    expect(rulerFor(link, "link_sent", undefined, true)[0]).toEqual({ kind: "checkout_reminder", runAt: new Date(link.getTime() + 10 * 60_000) });
    for (const paymentPath of ["cod", "prepay"] as const) {
      expect(renderFollowup("checkout_reminder", { leadId: "x", config, paymentPath })).toBe(
        "Vi que seu pedido ainda não foi finalizado, travou em alguma etapa?",
      );
    }
  });

  it("um Pix gerado e não pago deixa o checkout aberto; pago, agendado ou entregue fecha", () => {
    expect(checkoutStillOpen([])).toBe(true);
    expect(checkoutStillOpen(["Aguardando pagamento"])).toBe(true);
    expect(checkoutStillOpen(["Expirado"])).toBe(true);
    expect(checkoutStillOpen(["Cancelado"])).toBe(true);
    expect(orderUnpaid("Aguardando pagamento")).toBe(true);
    // Negations: any live, paid or scheduled order closes it.
    for (const s of ["Aprovado", "Agendado", "created", "Em rota", "Entregue", "Aguardando envio"]) {
      expect(checkoutStillOpen([s]), s).toBe(false);
      expect(orderUnpaid(s), s).toBe(false);
    }
    expect(checkoutStillOpen(["Aguardando pagamento", "Aprovado"])).toBe(false);
    expect(orderUnpaid("status que ninguém conhece")).toBe(false);
  });

  it("o webhook de pedido não pago mantém o lembrete; o pago o cancela", () => {
    const rows = [
      { kind: "checkout_reminder" as const, status: "scheduled" as const },
      { kind: "silence_1" as const, status: "scheduled" as const },
    ];
    const now = new Date("2026-10-08T21:25:00Z");
    expect(onOrderConfirmed(rows, now, now, "Aguardando pagamento").cancel).toEqual(["silence_1"]);
    expect(onOrderConfirmed(rows, now, now, "Aprovado").cancel).toEqual(["checkout_reminder", "silence_1"]);
  });
});

describe("L2 — 'paguei': a Malu verifica, espera 5 min, pede o comprovante e só então chama uma pessoa", () => {
  it("as frases literais da Leila", () => {
    expect(saysPaid("pronto, paguei")).toBe(true);
    expect(asksPaymentStatus("deu certo meu pagamento?")).toBe(true);
    // Read as "and my payment?" only while it is being checked.
    expect(nudgesCheck("checou?")).toBe(true);
    expect(nudgesCheck("eai??")).toBe(true);
    expect(asksPaymentStatus("checou?")).toBe(false);
  });

  it("outras formas de dizer que pagou", () => {
    for (const t of ["já paguei", "fiz o pix", "pix feito", "fiz o pagamento agora", "pagamento realizado", "finalizei o pagamento", "concluí a compra", "ta pago", "já está pago"]) {
      expect(saysPaid(t), t).toBe(true);
    }
  });

  it("negação: não pagou, vai pagar, pergunta ou outra loja não é 'paguei'", () => {
    for (const t of ["ainda não paguei", "vou pagar agora", "não consegui pagar", "nao paguei ainda", "paguei?", "se eu pagar no pix chega quando?", "paguei uma cinta na shopee e era ruim", "quanto eu pago?", "pago no pix?"]) {
      expect(saysPaid(t), t).toBe(false);
    }
    for (const t of ["ok", "qual o prazo?", "obrigada", "e ai, quando chega meu pedido?"]) expect(asksPaymentStatus(t), t).toBe(false);
    for (const t of ["ok", "qual o prazo?", "obrigada"]) expect(nudgesCheck(t), t).toBe(false);
  });

  it("o comprovante é a imagem, o documento ou a palavra comprovante — e 'não tenho comprovante' não é", () => {
    expect(isPaymentReceipt("[a cliente mandou uma imagem sem texto]")).toBe(true);
    expect(isPaymentReceipt("[a cliente mandou um documento sem texto]")).toBe(true);
    expect(isPaymentReceipt("segue o comprovante")).toBe(true);
    expect(isPaymentReceipt("não tenho o comprovante")).toBe(false);
    expect(isPaymentReceipt("[a cliente mandou uma figurinha]")).toBe(false);
    expect(isPaymentReceipt("o que é comprovante?")).toBe(false);
  });

  const base = { saidPaid: false, asksStatus: false, receipt: false, linkSent: true, paid: false, checking: false, receiptAsked: false };
  it("paguei sem pagamento confirmado: ela verifica (sem chamar pessoa)", () => {
    expect(paymentRoute({ ...base, saidPaid: true })).toBe("check");
    expect(paymentRoute({ ...base, receipt: true })).toBe("check");
  });
  it("durante os 5 minutos: 'deu certo?' recebe 'ainda estou verificando'", () => {
    expect(paymentRoute({ ...base, checking: true, asksStatus: true })).toBe("still_checking");
    expect(paymentRoute({ ...base, checking: true, saidPaid: true })).toBe("still_checking");
  });
  it("depois do pedido do comprovante: o comprovante chama uma pessoa; insistir sem ele pede de novo", () => {
    expect(paymentRoute({ ...base, receiptAsked: true, receipt: true })).toBe("receipt_handoff");
    expect(paymentRoute({ ...base, receiptAsked: true, saidPaid: true })).toBe("ask_receipt");
  });
  it("pago de verdade: ela diz que está confirmado", () => {
    expect(paymentRoute({ ...base, paid: true, saidPaid: true })).toBe("confirmed");
    expect(paymentRoute({ ...base, paid: true, checking: true, asksStatus: true })).toBe("confirmed");
  });
  it("o que conta como pago: só o antecipado pago; um pedido na entrega tira o 'paguei' deste caminho", () => {
    expect(paymentFacts([{ status: "Aprovado", payment_method: "prepay" }])).toEqual({ paid: true, codOrder: false });
    expect(paymentFacts([{ status: "Aguardando pagamento", payment_method: "prepay" }])).toEqual({ paid: false, codOrder: false });
    expect(paymentFacts([{ status: "Agendado", payment_method: "cod" }])).toEqual({ paid: false, codOrder: true });
    expect(paymentFacts([{ status: "Cancelado", payment_method: "cod" }])).toEqual({ paid: false, codOrder: false });
    expect(paymentRoute({ ...base, codOrder: true, saidPaid: true })).toBeNull();
  });

  it("negação: sem link e sem verificação, ou sem falar de pagamento, segue a conversa", () => {
    expect(paymentRoute({ ...base, linkSent: false, saidPaid: true })).toBeNull();
    expect(paymentRoute({ ...base })).toBeNull();
    expect(paymentRoute({ ...base, checking: true })).toBeNull();
    expect(paymentRoute({ ...base, paid: true })).toBeNull();
    expect(paymentRoute({ ...base, asksStatus: true })).toBeNull();
  });

  it("aos 5 minutos sem pagamento, o pedido do comprovante; os textos são fixos", () => {
    expect(PAYMENT_CHECK_MS).toBe(5 * 60_000);
    expect(renderFollowup("payment_check", { leadId: "x", config })).toBe(PAYMENT_RECEIPT_ASK);
    expect(PAYMENT_RECEIPT_ASK).toContain("comprovante");
    expect(PAYMENT_CHECK_REPLY).toContain("verificar o status do seu pagamento");
  });

  it("pedido criado ou Pix aguardando pagamento não arma 'Pedido confirmado! … já pago'", () => {
    const now = new Date("2026-10-08T21:25:00Z");
    expect(onOrderConfirmed([], now, now, "Aguardando pagamento").arm).toEqual([]);
    // Negation: approved arms the confirmation as before.
    expect(onOrderConfirmed([], now, now, "Aprovado").arm.map((f) => f.kind)).toContain("order_confirmed");
  });

  it("a função de produção decide o pagamento antes do intérprete e chama pessoa só com o comprovante", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    const at = turn.indexOf("const payment = paymentRoute({");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(turn.indexOf("const ask = interpretRequest(lastOutbound"));
    expect(turn).toContain('if (payment === "receipt_handoff")');
    expect(turn).toContain('kind === "payment_check"');
  });
});

describe("L2 — status do pagamento da Coinzz", () => {
  it("'Pedido criado' e o pagamento pendente com o envio pendente são não pagos", () => {
    expect(orderUnpaid("Pedido criado")).toBe(true);
    expect(orderUnpaid("Aguardando pagamento / Aguardando envio")).toBe(true);
    expect(orderUnpaid("Aprovado / Aguardando envio")).toBe(false);
    expect(orderUnpaid("Aguardando envio")).toBe(false);
  });
});

describe("L2 — e-mail só no antecipado: nome → e-mail → CPF", () => {
  const all = { sizeKnown: true, cepKnown: true, pathSettled: true, nameKnown: true, cpfDone: false };
  it("no antecipado, sem e-mail, o e-mail vem depois do nome e antes do CPF", () => {
    expect(missingForLink({ ...all, nameKnown: false, emailDone: false })).toBe("name");
    expect(missingForLink({ ...all, emailDone: false })).toBe("email");
    expect(missingForLink({ ...all, emailDone: true })).toBe("document");
    expect(missingForLink({ ...all, emailDone: true, cpfDone: true })).toBeNull();
  });
  it("negação: na entrega (emailDone ausente) o e-mail nunca é esperado", () => {
    expect(missingForLink({ ...all })).toBe("document");
    expect(missingForLink({ ...all, cpfDone: true })).toBeNull();
  });
  it("o e-mail que ela digitou na conversa é lido das mensagens dela, o mais novo vence", () => {
    expect(emailInChat([
      { direction: "inbound", body: "leila@gmail.com" },
      { direction: "outbound", body: "fale com contato@encorpa.com.br" },
      { direction: "inbound", body: "na verdade é leila.silva@hotmail.com" },
    ])).toBe("leila.silva@hotmail.com");
    // Negation: the shop's address in the agent's message is not hers.
    expect(emailInChat([{ direction: "outbound", body: "contato@encorpa.com.br" }])).toBeNull();
  });
  it("o link do antecipado leva o e-mail", () => {
    const url = buildPrefilledCheckoutLink({ name: "Leila da Silva", email: "Leila@Gmail.com", phone: "5511994915983" }, "prepay", { prepayUrl: "https://app.coinzz.com.br/checkout/x" });
    expect(new URL(url).searchParams.get("email")).toBe("leila@gmail.com");
  });
  it("a função de produção pede o e-mail só no antecipado e não o grava no lead", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain('emailDone: linkPath !== "prepay" || chatEmail !== null || refusedAsks(recent, "email") >= 1');
    expect(turn).toContain("...(linkPath === \"prepay\" && chatEmail ? { email: chatEmail } : {})");
    expect(turn).toContain("const { email: _noEmail, ...storedIdentity }");
  });
});

describe("L2 — o prompt (anotações 1, 2, 3, 5, 6 e a pergunta no fim)", () => {
  const prompt = systemPrompt(config, gateBriefing(config), null).replace(/\s+/g, " ");

  it("a reversão de risco, como o operador ditou, passa a cadeia antes do CEP", () => {
    const line = riskReversalMessage(config);
    expect(line).toContain("dependendo da sua região você só paga quando o colete chegar na sua mão");
    expect(line).toContain("pra devolver sem custo nenhum, risco zero pra você!");
    expect(prompt).toContain(line);
    expect(runGates(line, ctx()).traces.filter((t) => t.verdict === "block")).toEqual([]);
    // Negation: where the door payment does not reach her, the gate still refuses it.
    expect(runGates(line, ctx({ codUnavailable: true })).traces.some((t) => t.verdict === "block")).toBe(true);
  });

  it("onde não tem entrega, o frete do antecipado é do cliente, dito como o operador quer", () => {
    expect(NO_FREE_SHIPPING_PREPAY).toBe("No antecipado o frete é por conta do cliente, calculado por região, e aparece no checkout antes de você pagar.");
    expect(prompt).toContain(NO_FREE_SHIPPING_PREPAY);
    expect(runGates(NO_FREE_SHIPPING_PREPAY, ctx({ codUnavailable: true, paymentPath: "prepay" })).traces.filter((t) => t.verdict === "block")).toEqual([]);
  });

  it("a ressalva vira argumento e só quando o assunto chega perto", () => {
    expect(prompt).not.toContain("Diga isso quando o assunto chegar perto.");
    expect(prompt).toContain("Nunca solte isso como ressalva numa mensagem sobre outra coisa");
    expect(prompt).toContain("Ele não promete milagre: modela na hora que você veste");
  });

  it("variação de palavras, pergunta no último balão, região antes do CEP, devolver se não gostar, sem detalhe do entregador", () => {
    expect(prompt).toContain("VARIE AS PALAVRAS.");
    expect(prompt).toContain("a pergunta vai no último balão, nunca no primeiro");
    expect(prompt).toContain(`diga "dependendo da sua região" ou "na maioria das regiões"`);
    expect(prompt).toContain("pra devolver se não gostar");
    expect(prompt).toContain("se toca a campainha");
  });
});
