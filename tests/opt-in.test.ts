import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
import { renderFollowup, type StopPoint } from "../src/agent/followups.js";
import { acceptsMarketingOptIn, optInQuestion, revokesMarketingOptIn, YES_REPLIES, type OptInAnchor } from "../src/agent/opt-in.js";
import { config, ctx as gateCtx } from "./fixtures.js";

const brand = config.brand;
const question = optInQuestion(brand)!;
const now = new Date("2026-09-10T15:00:00Z");
const askedAt = new Date("2026-09-10T13:00:00Z");
/** The question the sweep sent two hours ago. */
const anchor = (over: Partial<OptInAnchor> = {}): OptInAnchor => ({ questionId: "msg-question", askedAt, now, ...over });

describe("opt-in de marketing: a pergunta", () => {
  it("cita a marca, pede a palavra-chave e não promete cupom", () => {
    expect(question).toContain("Encorpa");
    expect(question).toContain("**OFERTAS**");
    expect(question).not.toMatch(/cupom|desconto|%/i);
  });

  it("marca em branco não gera pergunta: a Meta exige o nome da empresa", () => {
    for (const blank of ["", " ", "​", "﻿ "]) expect(optInQuestion(blank), JSON.stringify(blank)).toBeNull();
  });

  // It rides after the ruler's first touch as a message of its own; the sweep gates it.
  it("passa a cadeia de gates, sozinha e depois de cada silence_1", () => {
    const at = new Date("2026-09-10T10:00:00");
    const texts = [question];
    for (const stopPoint of ["before_size", "after_price", "link_sent"] as StopPoint[])
      for (const leadId of ["lead-0", "lead-1", "lead-2", "lead-3"])
        texts.push(`${renderFollowup("silence_1", { leadId, config, stopPoint, now: at })!}\n\n${question}`);
    for (const text of texts)
      expect(runGates(text, gateCtx({ now: at, stage: "presale" })).traces.filter((t) => t.verdict === "block"), text).toEqual([]);
  });

  it("contraprova: a mesma pergunta prometendo cupom é vetada", () => {
    const withCoupon = question.replace("lembretes e ofertas", "lembretes e um cupom de 20%");
    const result = runGates(withCoupon, gateCtx({ now: new Date("2026-09-10T10:00:00"), stage: "presale" }));
    expect(result.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("coupon_exists");
  });
});

describe("opt-in de marketing: a resposta", () => {
  it.each([
    "OFERTAS", "ofertas", "Ofertas!", "OFERTAS 💛", "*OFERTAS*", "**OFERTAS**", "ofertasss", "oferta",
    "sim, ofertas", "Sim ofertas", "ofertas sim", "quero ofertas", "Sim, quero ofertas!", "pode mandar ofertas",
    "ofertas por favor", "ofertas 👍🏻", "ofertas ❤️", "ofertas…",
    "me manda ofertas", "aceito ofertas", "quero receber ofertas", "sim oferta",
  ])("palavra-chave: %s", (reply) => {
    expect(acceptsMarketingOptIn(reply, anchor())).toBe(true);
  });

  // Four review rounds, 2026-09-28: each of these answered something else the agent had
  // asked — the touch's own question, the bubble before, "Tá certinho assim?". Without the
  // keyword, no reply is consent, whatever came before.
  it.each(["sim", "Sim!", "SIM 💛", "siiim", "pode", "Pode sim", "pode mandar", "quero", "claro", "aceito", "ok", "s", "👍"])(
    "sem a palavra-chave não é consentimento: %s",
    (reply) => {
      expect(acceptsMarketingOptIn(reply, anchor())).toBe(false);
    },
  );

  it.each([
    "não quero ofertas", "ofertas não", "sem ofertas", "nada de ofertas", "ofertas? não", "não, obrigada",
    "ofertas de quê?", "ofertas?", "ofertas¿", "ofertas ？", "quero ofertas do M", "ofertas, mas só do pedido",
    "ofertas 👎", "ofertas🙄", "ofertas ❌", "o̶f̶e̶r̶t̶a̶s̶", "",
  ])("não é sim: %j", (reply) => {
    expect(acceptsMarketingOptIn(reply, anchor())).toBe(false);
  });

  it("sem pergunta enviada, a palavra-chave não grava nada", () => {
    expect(acceptsMarketingOptIn("ofertas", anchor({ questionId: null, askedAt: null }))).toBe(false);
  });

  it("depois de 24h da pergunta não vale; antes, vale", () => {
    const at = (hours: number) => new Date(askedAt.getTime() + hours * 3_600_000);
    expect(acceptsMarketingOptIn("ofertas", anchor({ now: at(23.9) }))).toBe(true);
    expect(acceptsMarketingOptIn("ofertas", anchor({ now: at(24) }))).toBe(false);
    expect(acceptsMarketingOptIn("ofertas", anchor({ now: at(240) }))).toBe(false);
    expect(acceptsMarketingOptIn("ofertas", anchor({ now: at(-1) }))).toBe(false);
  });

  // Fourth review: PostgREST returns the column as ISO text; it must not throw.
  it("askedAt como texto ISO funciona; data inválida conta como não", () => {
    expect(acceptsMarketingOptIn("ofertas", anchor({ askedAt: askedAt.toISOString() }))).toBe(true);
    expect(acceptsMarketingOptIn("ofertas", anchor({ askedAt: "x" }))).toBe(false);
    expect(acceptsMarketingOptIn("ofertas", anchor({ askedAt: new Date(Number.NaN) }))).toBe(false);
    expect(acceptsMarketingOptIn("ofertas", anchor({ now: new Date("x") }))).toBe(false);
  });
});

// Fifth review, 2026-09-28: the question teaches "ofertas", so she revokes with it — and
// `classifyOptOut` reads none of these. Any time, not only within 24h.
describe("opt-in de marketing: a revogação", () => {
  it.each([
    "não quero ofertas", "não quero receber ofertas", "mudei de ideia, não quero ofertas", "cancela as ofertas",
    "não manda oferta", "sem ofertas por favor", "para de mandar ofertas", "nada de promoção", "Não quero mais promoção",
    "chega de propaganda", "não quero lembrete", "pode tirar das ofertas", "OFERTAS NÃO", "ofertas nunca mais",
    "nao quero ofertas", "dispenso as promoções", "quero sair da lista de ofertas", "me remove das promoções",
  ])("revoga: %s", (text) => {
    expect(revokesMarketingOptIn(text)).toBe(true);
  });

  // Sixth review: exact words missed WhatsApp Portuguese. Every one of these is a revocation.
  it.each([
    "n quero ofertas", "N quero oferta", "ñ quero ofertas", "Ñ quero ofertas", "nn quero promo", "ofertas nn",
    "naum quero ofertas", "n quero promoções", "nãoo quero ofertas", "nããão quero ofertas", "ofertaaas não",
    "naoquero ofertas", "ofertasnão", "tô fora das promo", "to fora das promoções", "dispensa as ofertas",
    "deixa de mandar oferta", "deixa pra lá as ofertas", "esquece as ofertas", "passo as ofertas", "desativa as ofertas",
    "desliga as promoções", "bloquear ofertas", "cancelem as ofertas", "cancelo as ofertas", "STOP ofertas",
    "odeio propaganda", "detesto essas promo", "não quero cupom", "chega de desconto", "não quero novidades",
    "chega de anúncio", "não quero anuncio", "não quero spam", "ofertinhas não", "não quero ofertinha", "promoçãozinha não",
  ])("revoga (sexta revisão): %s", (text) => {
    expect(revokesMarketingOptIn(text)).toBe(true);
  });

  // Generated: every marketing word × every way to say no or stop, in both orders.
  const marketing = ["oferta", "ofertas", "ofertinha", "promoção", "promo", "promoções", "propaganda", "lembrete", "cupom", "cupons", "desconto", "novidades", "anúncio", "spam"];
  const stop = ["não quero", "nao quero", "n quero", "ñ quero", "naum quero", "nn quero", "não", "chega de", "para de mandar", "pare com", "cancela", "tira", "sem", "nada de", "dispenso", "não manda mais"];
  it("gerado: marketing × negação, nas duas ordens", () => {
    const missed = marketing.flatMap((m) => stop.flatMap((n) => [`${n} ${m}`, `${m} ${n}`])).filter((t) => !revokesMarketingOptIn(t));
    expect(missed).toEqual([]);
  });

  it.each([
    "OFERTAS", "quero ofertas", "sim, pode mandar ofertas", "tem oferta pro kit?", "e o desconto do pix?", "tem cupom?",
    "qual a promoção de hoje?", "o lembrete chegou",
    // Without a marketing word this is not about the opt-in — classifyOptOut reads the rest.
    "não quero o M, quero o G", "não sei meu tamanho", "para quando chega?", "",
  ])("não revoga: %j", (text) => {
    expect(revokesMarketingOptIn(text)).toBe(false);
  });

  // The caller asks both; they must never both say yes (sixth review, item 6).
  it("nenhuma resposta aceita como sim é lida como revogação", () => {
    for (const reply of YES_REPLIES) expect(revokesMarketingOptIn(reply), reply).toBe(false);
  });
});
