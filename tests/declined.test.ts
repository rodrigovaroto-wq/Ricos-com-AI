/**
 * Grafo §69 — a recusa vira um estado (conversation 0a3b51dd, 2026-10-09). She said "nao quero mais,
 * obrigado", got the "vou pensar" line with the stock, said "nao quero", and the silence ruler still
 * sent `silence_1` and `silence_2`. Each case is the production sentence, literal, with the negations
 * beside it. The decline is an allow-list: the whole line is a refusal and filler, or it is not one.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { declinesInBurst, herRecent, withdrawsInBurst } from "@/agent/interpret.js";
import { DECLINE_REPLY, spoken, TRANSCRIBED } from "@/agent/retry.js";
import { ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("declinesInBurst — ela recusa a venda", () => {
  it.each([
    [["nao quero mais, obrigado"]],
    [["nao quero mais, obrigado", "nao quero"]],
    [["não quero mais"]],
    [["desisti"]],
    [["deixa pra lá"]],
    [["deixa quieto, obrigada"]],
    [["ah, pensando bem não vou comprar não, obrigada 😊"]],
    [["não tenho interesse"]],
    [["não tenho mais interesse, obrigada"]],
    // Revisão de E1.1, achado 4: a recusa com o objeto que é a própria venda.
    [["não tenho interesse no produto"]],
    [["não tenho interesse em comprar"]],
    [["não tenho interesse nesse produto"]],
    [["não tenho interesse nenhum"]],
    [["não tenho mais interesse em comprar"]],
    [["não tenho interesse no produto, tchau"]],
    // Depois da recusa, só fechamento, "ok" ou "não" a seco: continua fechada.
    [["desisti", "obrigada, tchau"]],
    [["desisti", "ok"]],
    [["desisti", "não, obrigada"]],
    [["qual o prazo?", "deixa pra lá"]],
    // Segunda revisão de E1.1: o "não" de eco só depois das recusas que começam por "não".
    [["não quero mais não"]],
    [["não vou querer não"]],
    [["não tenho interesse não"]],
    // R1: mais formas da mesma recusa.
    [["desisto"]],
    [["eu desisti"]],
    [["já desisti"]],
    [["desisti da compra"]],
    [["desisti do colete"]],
    [["eu desisti, obrigada"]],
    [["n quero mais"]],
    [["nem quero mais"]],
    [["não quero mais comprar"]],
    [["eu desisti, tchau"]],
    [["desisto, tchau"]],
    [["obrigada mas nao quero mais, tchau"]],
    [["obrigada, mas não tenho interesse"]],
    [["não quero mais, obrigada pela atenção"]],
  ])("recusa: %j", (burst) => {
    expect(declinesInBurst(burst)).toBe(true);
  });

  it.each([
    [["vou pensar"]],
    [["não quero pensar, quero comprar"]],
    [["não quero mais nada, só o link"]],
    [["não quero mais nada, obrigada"]],
    [["desisti do P, manda o M"]],
    [["não quero mais o kit"]],
    [["deixa pra lá, qual o prazo?"]],
    [["não quero mais", "quero comprar o G"]],
    [["desisti não, quero sim"]],
    [["não quero mais esperar"]],
    [["deixa pra lá o email"]],
    [["não tenho interesse no kit"]],
    [["não tenho interesse em pagar antecipado"]],
    [["tenho interesse sim"]],
    // Achado 1: adiar não é recusar.
    [["deixa pra lá, vou pensar melhor"]],
    [["não vou comprar agora, talvez mês que vem"]],
    [["não vou levar agora, vou pensar"]],
    [["agora não vou comprar, depois te chamo"]],
    [["deixa pra lá por enquanto"]],
    [["deixa quieto por agora, depois te chamo"]],
    [["não vou comprar esse mês"]],
    // Achado 2: ela voltou depois da recusa.
    [["desisti", "pensei melhor, quero sim"]],
    [["desisti", "mudei de ideia"]],
    [["desisti", "oi, voltei"]],
    [["desisti", "bom dia, me manda as fotos de novo"]],
    [["desisti", "uso 42"]],
    [["deixa pra lá, quero sim"]],
    // Achado 3: trocar parte do pedido não é recusar.
    [["não quero mais o P"]],
    [["não quero mais a cor preta"]],
    [["não vou mais comprar dois, só um"]],
    [["desisti de pagar antes"]],
    [["não quero mais ficar esperando, me manda"]],
    [["nao quero mais nd"]],
    // Achado 7.
    [["não tenho interesse não, tenho certeza que quero"]],
    // Resíduo documentado: oferta de kit é sim/não — "não" a seco não é recusa da venda.
    [["não, obrigada"]],
    [["não quero"]],
    // B1: depois de "desisti" / "deixa pra lá" / "deixa quieto", o "não" desfaz a recusa.
    [["desisti não"]],
    [["desisti nao"]],
    [["ah desisti não"]],
    [["desisti não, viu"]],
    [["desisti nao kkk"]],
    [["deixa pra lá não"]],
    [["deixa quieto nao"]],
    [["desisti", "desisti não"]],
    [["desisto não"]],
    // R1, negações.
    [["mas desisti do P, manda o M"]],
    [["já desisti do kit"]],
    [["eu desisti de pagar antes"]],
    [["não quero mais comprar dois, só um"]],
    [["mas eu quero"]],
    [["nem quero mais esperar"]],
  ])("não é recusa: %j", (burst) => {
    expect(declinesInBurst(burst)).toBe(false);
  });
});

describe("withdrawsInBurst — 'não quero mais nada' é 'nada além disso'; 'não tenho interesse' só sem objeto", () => {
  it.each(["não quero mais nada, obrigada", "nao quero mais nada"])("%s não desiste", (frase) => {
    expect(withdrawsInBurst([frase])).toBe(false);
  });
  it.each(["não quero mais", "nao quero mais, obrigado", "não tenho interesse", "eu não tenho mais interesse 😊"])(
    "%s desiste",
    (frase) => {
      expect(withdrawsInBurst([frase])).toBe(true);
    },
  );
  it.each(["não tenho interesse nessa cor", "não tenho interesse no kit", "tenho interesse sim", "eu tenho interesse, não tenho dúvida"])(
    "%s não desiste",
    (frase) => {
      expect(withdrawsInBurst([frase])).toBe(false);
    },
  );
});

describe("herRecent — as falas dela, da mais antiga à mais nova", () => {
  it("inverte a lista (mais nova primeiro), descarta as da loja, corpo nulo vira vazio, tira a marca do áudio", () => {
    const rows = [
      { direction: "inbound", body: `${TRANSCRIBED}desisti.` },
      { direction: "outbound", body: "Tudo bem!" },
      { direction: "inbound", body: null },
      { direction: "inbound", body: "oi" },
    ];
    expect(herRecent(rows, spoken)).toEqual(["oi", "", "desisti"]);
  });

  it("as linhas reais de 09/10 (mais nova primeiro) recusam", () => {
    const rows = [
      { direction: "inbound", body: "nao quero" },
      { direction: "outbound", body: "Tudo bem, obrigada por me falar 💛" },
      { direction: "inbound", body: "nao quero mais, obrigado" },
      { direction: "outbound", body: "Sem problemas, estou aqui se tiver mais alguma dúvida 💛" },
      { direction: "inbound", body: "Quero comprar o colete" },
    ];
    expect(declinesInBurst(herRecent(rows, spoken))).toBe(true);
    // A ordem importa: lida ao contrário, a compra seria a última palavra.
    expect(declinesInBurst(herRecent([...rows].reverse(), spoken))).toBe(false);
  });
});

describe("DECLINE_REPLY — a despedida da recusa", () => {
  it("passa a cadeia de gates fora do adiamento, sem pergunta, sem estoque, sem link", () => {
    const gated = runGates(DECLINE_REPLY, ctx({ postponing: false }));
    expect(gated.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toEqual([]);
    expect(DECLINE_REPLY).not.toContain("?");
    expect(DECLINE_REPLY).not.toMatch(/restam|http/i);
  });
});

describe("index.ts — a recusa no turno e na régua", () => {
  it("o ramo da recusa vem antes do 'vou pensar' e manda a despedida fixa", () => {
    const decline = turn.indexOf("if (declinesInBurst(parts) && !interpretation.wants_to_buy) {");
    const think = turn.indexOf("    interpretation.wants_to_think &&\n    interpretation.pending_answer");
    expect(decline).toBeGreaterThan(-1);
    expect(think).toBeGreaterThan(decline);
    expect(turn.slice(decline, think)).toContain("sendFixed(opening(DECLINE_REPLY)");
  });

  it("scheduleSilenceTouches não arma a régua depois da recusa: lê as mensagens dela e cancela tudo", () => {
    const fn = turn.slice(turn.indexOf("const scheduleSilenceTouches = async"), turn.indexOf('await db("followups?on_conflict=conversation_id,kind"'));
    const read = fn.indexOf("conversations?id=eq.${conversationId}&select=*,leads(size,orders(status)),followups(kind,sent_at),messages(direction,body,created_at)&messages.order=created_at.desc&messages.limit=20");
    const guard = fn.indexOf('if (at && declinesInBurst(herRecent(at.messages ?? [], spoken))) { await cancelScheduled(conversationId, "all"); return; }');
    expect(read).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(read);
    expect(fn.indexOf("if (at && !chasesSilence(")).toBeGreaterThan(guard);
    expect(fn.indexOf("rulerFor(")).toBeGreaterThan(guard);
  });

  it("o 'ok' sozinho não arma a oferta de ajuda depois da recusa", () => {
    const ack = turn.slice(turn.indexOf("ackGoesUnanswered(isBareAck(parts)"), turn.indexOf('return json(200, { status: "acknowledged"'));
    const help = ack.indexOf("const help = lastOutbound.trim() === ackHelpText(datum) || declinesInBurst(herRecent(recentRows ?? [], spoken)) ? null : ackHelpText(datum);");
    expect(help).toBeGreaterThan(-1);
    expect(ack.indexOf('kind: "still_there"')).toBeGreaterThan(help);
  });
});

describe("/code-review da E1 — linha vazia e 'interesse nenhum'", () => {
  it("linha em branco ou figurinha (corpo vazio) depois da recusa não é ela voltando", () => {
    expect(declinesInBurst(["Não quero mais\n\nObrigada"])).toBe(true);
    expect(declinesInBurst(["desisti", ""])).toBe(true);
    expect(declinesInBurst(["desisti", "", "uso 42"])).toBe(false);
  });
  it("'não tenho interesse nenhum' segura o link como as outras recusas", () => {
    expect(withdrawsInBurst(["não tenho interesse nenhum"])).toBe(true);
    expect(withdrawsInBurst(["não tenho interesse mesmo"])).toBe(true);
    expect(withdrawsInBurst(["não tenho interesse no kit"])).toBe(false);
  });
});
