import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { refusedAsks } from "@/agent/identity.js";
import { NEUTRAL_INTERPRETATION, quantityOf, type Interpretation } from "@/agent/interpret.js";
import { buildPrefilledCheckoutLink } from "@/agent/coinzz.js";
import { thinkReply } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Grafo §63 (operator, 2026-10-06): the code obeys the prompt v2 — the link only after size, CEP,
 * payment path, name, e-mail (or one refusal) and CPF (or two refusals); the size picked on the
 * checkout, never "no complemento"; "vou pensar" without the data gets no link; the CEP lookup
 * has its own directive. The decisions are pure functions (`missingForLink`, `sendLinkNow`,
 * `buyerAsk` in tests/interpret.test.ts; `refusedAsks` here); the wiring is read as source.
 */
const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
const out = (body: string) => ({ direction: "outbound", body });
const inn = (body: string) => ({ direction: "inbound", body });

describe("recusas lidas da conversa (refusedAsks)", () => {
  it("CPF recusado uma vez: conta 1 (pede de novo com o motivo); duas: conta 2 (o link vai sem ele)", () => {
    const once = [out("E por último o CPF, pra nota fiscal. Me passa?"), inn("pra que você precisa do meu CPF?")];
    expect(refusedAsks(once, "document")).toBe(1);
    const twice = [...once, out("É pra nota fiscal, que a lei exige. Pode me passar o CPF?"), inn("não passo CPF por WhatsApp")];
    expect(refusedAsks(twice, "document")).toBe(2);
  });

  it("CPF inválido conta como recusa; válido não", () => {
    expect(refusedAsks([out("Qual o seu CPF?"), inn("111.111.111-11")], "document")).toBe(1);
    expect(refusedAsks([out("Qual o seu CPF?"), inn("731.166.873-58")], "document")).toBe(0);
  });

  it("negações: pergunta ainda sem resposta, frase sem pergunta, ou outro campo não contam", () => {
    expect(refusedAsks([out("Qual o seu CPF?")], "document")).toBe(0);
    expect(refusedAsks([out("Seu CPF já vai preenchido no link."), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Qual o seu e-mail?"), inn("não tenho")], "document")).toBe(0);
    // Uma rajada inteira é a resposta: o CPF na segunda mensagem dela vale.
    expect(refusedAsks([out("Qual o seu CPF?"), inn("pera"), inn("73116687358")], "document")).toBe(0);
  });

  it("e-mail recusado uma vez conta; dado não conta", () => {
    expect(refusedAsks([out("Agora seu e-mail? É pra completar o cadastro do pedido."), inn("não tenho e-mail")], "email")).toBe(1);
    expect(refusedAsks([out("Agora seu e-mail?"), inn("maria@gmail.com")], "email")).toBe(0);
  });
});

describe("o link no turno espera os dados (index.ts lido como fonte)", () => {
  it("as seis condições entram no link e no 'vou pensar'", () => {
    expect(source).toContain('const cpfRefusals = refusedAsks(recent, "document");');
    expect(source).toContain("cepKnown: Boolean(addressDraft.cep),");
    expect(source).toContain("pathSettled: paymentChoice !== null || knownRegion?.cod === false,");
    expect(source).toContain("nameKnown: Boolean(identityDraft.name),");
    expect(source).toContain('emailDone: Boolean(identityDraft.email) || interpretation.email_unavailable || refusedAsks(recent, "email") > 0,');
    expect(source).toContain("cpfDone: Boolean(identityDraft.document) || cpfRefusals >= 2,");
    expect(source).toContain("const linkNow = !linkJustSent && sendLinkNow({ ...linkData, yesBesideQuestion });");
    expect(source).toContain("thinkLink = linkNow && !(linkInChat");
    // The old exits are gone: wanting to buy, no e-mail, or an ignored ask no longer send it.
    expect(source).not.toContain("readyForLink");
    expect(source).not.toContain("identityAsked");
  });

  it("sem os dados, a diretiva diz o que falta, com o motivo, e que o link não vai", () => {
    expect(source).toContain("O link do pedido só sai com os dados dela, e falta ${topic}.");
    expect(source).toContain("Ela já recusou o CPF uma vez: diga o motivo uma vez");
    expect(source).toContain("Não escreva link nenhum e não diga que vai mandar agora.");
    expect(source).not.toContain("o link sai assim mesmo e o\\n");
    expect(source).not.toMatch(/o link sai assim mesmo/);
    expect(source).toContain("Ela quer fechar, mas o link só sai com o CEP dela");
  });

  it("a diretiva da região sai sozinha, com ou sem tamanho, e nunca como 'saída boa'", () => {
    expect(source).toContain("regionDirectiveFor(knownRegion, paymentChoice),");
    expect(source).toContain("ali a transportadora ainda não tem pagamento na entrega");
    expect(source).toContain("apresente as duas opções, como no PAGAMENTO");
    expect(source).not.toContain("saída boa");
  });

  it("o kit é oferecido depois da escolha, uma vez, e o link do kit é o checkout do kit", () => {
    expect(source).toContain(
      'units === 1 && pathChosen && missing !== "size" && missing !== "cep" && kitsOnPath.length > 0 && !kitOffered && !linkNow;',
    );
    expect(source).toContain("linkNow || linkAlreadySent || kitOfferNow ||");
    expect(source).toContain("const kitUrl = units > 1 ? kits.find((k) => k.path === linkPath && k.units === units)?.checkoutUrl : undefined;");
  });

  it("o 'sim' ao default da entrega fica gravado como escolha", () => {
    expect(source).toMatch(/deixo\\s\+no\\s\+pagamento\\s\+na\\s\+entrega/);
    expect(source).toContain('payment_choice: interpretation.payment_choice ?? "cod",');
  });

  it("nenhum texto do turno fala em complemento; o tamanho se escolhe no checkout", () => {
    expect(source).not.toMatch(/complemento/i);
    expect(source).toContain('lá você escolhe o ${size ?? "seu tamanho"}');
    expect(source).toContain("Lá no checkout você escolhe o tamanho de cada peça:");
  });
});

describe("revisão de 7c8bc7c no turno", () => {
  it("a conversa não tomada (0023 ausente) volta ao descarte do §59 na segunda olhada", () => {
    expect(source).toContain("claimFailed = won === null;");
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard.indexOf("if (claimFailed) {")).toBeGreaterThan(guard.indexOf('status: "retry_moot"'));
    expect(guard.indexOf("if (claimFailed) {")).toBeLessThan(guard.indexOf("revisionAllowed("));
  });

  it("a revisão que não leu a rajada não sai sem ler: revisa de novo ou vai à varredura pela mais nova", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("if (inboundId === null && !isRevise) return null;");
    const defer = source.slice(source.indexOf("const deferRetry = async"), source.indexOf("const lateGuard = async"));
    expect(defer).not.toContain("if (inboundId === null) return null;");
    expect(defer).toContain("if (newest === null) return null;");
  });

  it("a migração 0023 diz que a ordem do deploy importa", () => {
    const sql = readFileSync("supabase/migrations/0023_replying_since.sql", "utf8");
    expect(sql).toContain("Deploy order matters: apply this BEFORE the turn");
    expect(sql).not.toContain("deploy order does not matter");
  });
});

describe("kit: 'uma' depois da oferta continua uma peça", () => {
  const read = (over: Partial<Interpretation>): Interpretation => ({ ...NEUTRAL_INTERPRETATION, ...over });
  it("'só uma mesmo' é uma", () => {
    expect(quantityOf("só uma mesmo", read({ units: 1 }))?.units).toBe(1);
  });
  it("um 2 inventado pelo intérprete sobre 'uma' não vira kit", () => {
    expect(quantityOf("uma", read({ units: 2 }))).toBeNull();
  });
});

describe("o link pré-preenchido", () => {
  const cfg = {
    codUrl: "https://entrega.logzz.com.br/pay/encorpa-pa",
    prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0",
  };
  it("a Coinzz recebe DDD + número, sem o 55; a Logzz recebe com o 55", () => {
    const customer = { name: "Maria Souza", phone: "5511988887777" };
    expect(new URL(buildPrefilledCheckoutLink(customer, "prepay", cfg)).searchParams.get("phone")).toBe("11988887777");
    expect(new URL(buildPrefilledCheckoutLink(customer, "cod", cfg)).searchParams.get("phone")).toBe("5511988887777");
  });
  it("negações: telefone fixo com 55 perde o 55; sem o 55 fica como está", () => {
    expect(new URL(buildPrefilledCheckoutLink({ phone: "551133334444" }, "prepay", cfg)).searchParams.get("phone")).toBe("1133334444");
    expect(new URL(buildPrefilledCheckoutLink({ phone: "11988887777" }, "prepay", cfg)).searchParams.get("phone")).toBe("11988887777");
  });
});

describe("'vou pensar' sem os dados", () => {
  const c = { ...config, prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }, scarcity: { unitsLeft: 12 } };
  it.each(["cod", "prepay"] as const)("sem link, passa a cadeia no adiamento (%s)", (path) => {
    const text = thinkReply(c, path, false);
    const blocked = runGates(text, ctx({ config: c, paymentPath: path, codUnavailable: path === "prepay", postponing: true }))
      .traces.filter((t) => t.verdict === "block");
    expect(blocked).toEqual([]);
    expect(text).not.toMatch(/link/);
  });
  it("a linha do kit no 'vou pensar' passa a cadeia", () => {
    const blocked = runGates("Lá no checkout você escolhe o tamanho de cada peça: M e G.", ctx({ config: c, units: 2 }))
      .traces.filter((t) => t.verdict === "block");
    expect(blocked).toEqual([]);
  });
});

/** Grafo §63: os três conflitos do §62 entre o prompt v2 e os gates, com as negações. */
describe("gates: os conflitos do §62", () => {
  const blocks = (text: string, over = {}) =>
    runGates(text, ctx(over)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  const noCod = { paymentPath: "prepay" as const, codUnavailable: true, regionKnown: true };

  it("charge_promise lê 'a transportadora ainda não faz pagamento na entrega' como negação", () => {
    expect(blocks("Aí na sua região a transportadora ainda não faz pagamento na entrega, mas tem o antecipado.", noCod)).toEqual([]);
    expect(blocks("A gente ainda não trabalha com pagamento na entrega aí.", noCod)).toEqual([]);
  });
  it("negações: 'não faz diferença, você paga na entrega' e 'faz pagamento na entrega' seguem vetados", () => {
    expect(blocks("Não faz diferença, você paga na entrega.", noCod)).toContain("charge_promise");
    expect(blocks("A transportadora faz pagamento na entrega aí.", noCod)).toContain("charge_promise");
  });

  it("delivery_promise: 'escolhe um dia em que você vai estar' não é prazo", () => {
    expect(blocks("Escolhe um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toEqual([]);
    expect(blocks("Dá pra marcar um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toEqual([]);
  });
  it("negações: 'chega em um dia' segue prazo", () => {
    expect(blocks("No antecipado chega em um dia.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
    expect(blocks("Chega em um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
  });

  it("coverage_claim veta 'no seu CEP dá pra pagar na entrega' antes da consulta", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: false })).toContain("coverage_claim");
    expect(blocks("Dá pra pagar na entrega aí, sim.", { regionKnown: false })).toContain("coverage_claim");
  });
  it("negações: depois da consulta passa; condição, pergunta e negação passam antes dela", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: true })).toEqual([]);
    expect(blocks("Me passa seu CEP que eu vejo se no seu CEP dá pra pagar na entrega?", { regionKnown: false })).toEqual([]);
    expect(blocks("Aí na sua região ainda não tem pagamento na entrega.", { regionKnown: false })).not.toContain("coverage_claim");
  });
});
