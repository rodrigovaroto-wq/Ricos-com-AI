import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksWhatSheIs, runGates, type GateContext } from "@/agent/guardrails.js";
import { HUMAN_HANDOFF_REPLY, WELCOME_AUTO_REPLY } from "@/agent/retry.js";
import { ctx } from "./fixtures.js";

/**
 * Q10, line 2: "não anuncia" (grafo §58). First real WhatsApp test (2026-10-06, agent_version 5):
 * she wrote "oi" and the agent opened as "a assistente virtual da Encorpa". The answer to "você é
 * robô?" stays allowed — only the disclosure nobody asked for is vetoed.
 */
const blockedBy = (text: string, extra: Partial<GateContext> = {}) =>
  runGates(text, ctx(extra)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const OPENINGS = [
  "Oi, que bom falar com você, eu sou a assistente virtual da Encorpa e te ajudo a fazer aquela roupa querida voltar a cair bem.\n\nTem alguma roupa que você adora e deixou no armário?",
  "Oi, que bom falar com você, eu sou a Malu, assistente virtual da Encorpa.\n\nMe conta, tem alguma roupa que você adora e deixou no armário?",
] as const;

const UNASKED_DISCLOSURES = [
  ...OPENINGS,
  "Oi! Sou uma IA da Encorpa e posso te ajudar com o colete.",
  "Aqui é um atendimento automático, mas eu te explico tudo.",
  "Sou um robô, mas entendo bem de colete!",
  "Eu sou uma inteligência artificial treinada pra te ajudar.",
  "Sou a atendente virtual da marca, me conta o que você procura?",
] as const;

const IDENTITY_QUESTIONS = [
  "você é robô?",
  "vc é robo?",
  "é uma pessoa?",
  "é uma pessoa falando?",
  "tô falando com IA?",
  "é IA ou nao é? responde sim ou nao",
  "é atendimento automático?",
  "você não é robô né?",
  "VOCÊ NÃO É UM ROBÔ, NÉ?",
  "tem alguem ai de verdade?",
  "nao quero falar com maquina",
  "me passa pra um humano",
  "isso é um bot?",
  "com quem eu to falando?",
  "é inteligência artificial?",
  "vc é de verdade?",
] as const;

const NOT_ASKING = [
  "oi",
  "Oi, vi o anúncio",
  "quanto custa?",
  "eu ia comprar mas fiquei na dúvida",
  "tem alguém aí?",
  "qual o tecido?",
  "funciona mesmo?",
  "uso 42 de calça",
] as const;

describe("asksWhatSheIs: a mensagem dela pergunta o que a agente é", () => {
  it.each(IDENTITY_QUESTIONS)("pergunta: %s", (m) => expect(asksWhatSheIs(m)).toBe(true));
  it.each(NOT_ASKING)("não pergunta: %s", (m) => expect(asksWhatSheIs(m)).toBe(false));
});

describe("humanity_claim: não anuncia que é virtual sem ela perguntar (Q10 linha 2)", () => {
  it.each(UNASKED_DISCLOSURES)("veta depois de \"oi\": %s", (text) => {
    expect(blockedBy(text, { askedIdentity: asksWhatSheIs("oi") })).toContain("humanity_claim");
  });

  // Line 3: asked, she answers. Every phrasing, negations included, frees the honest answer.
  it.each(IDENTITY_QUESTIONS)("passa quando ela pergunta \"%s\"", (question) => {
    const asked = { askedIdentity: asksWhatSheIs(question) };
    expect(blockedBy("Não sou uma pessoa, sou a assistente virtual da Encorpa, e sigo te ajudando aqui.", asked)).toEqual([]);
    expect(blockedBy("Sou a assistente virtual da marca, posso chamar alguém do time.", asked)).toEqual([]);
    expect(blockedBy(OPENINGS[1], asked)).toEqual([]);
  });

  // Line 1 is untouched by the question: denying being a bot is still a lie, asked or not.
  it("negar ser robô continua vetado mesmo quando ela pergunta", () => {
    expect(blockedBy("Não sou robô não, pode falar comigo.", { askedIdentity: true })).toContain("humanity_claim");
    expect(blockedBy("Pode ficar tranquila, sou uma pessoa de verdade.", { askedIdentity: true })).toContain("humanity_claim");
  });

  it("apresentar-se pelo nome, da marca, passa sem pergunta nenhuma", () => {
    const unasked = { askedIdentity: false };
    expect(blockedBy("Oi, que bom falar com você, eu sou a Malu, da Encorpa.\n\nMe conta, tem alguma roupa que você adora e deixou no armário?", unasked)).toEqual([]);
    expect(blockedBy("Oi! Aqui é a Malu, assistente de vendas da Encorpa 💛", unasked)).toEqual([]);
  });

  it("menção que não é sobre ela passa", () => {
    const unasked = { askedIdentity: false };
    expect(blockedBy("Você confere tudo na nossa loja virtual, encorpa-fashion.com.br.", unasked)).toEqual([]);
    expect(blockedBy("Eu ia te perguntar: qual roupa você anda deixando no armário?", unasked)).toEqual([]);
    expect(blockedBy("Não sou uma pessoa, mas te ajudo em tudo do colete.", unasked)).toEqual([]);
  });

  it("as linhas fixas do código passam (camada auto)", () => {
    for (const text of [HUMAN_HANDOFF_REPLY, WELCOME_AUTO_REPLY])
      expect(blockedBy(text, { layer: "auto", askedIdentity: false })).toEqual([]);
  });

  // Undefined is the sweep and the fixed replies: the check stays idle there, as askedTestimonial.
  it("sem o sinal, o gate fica como antes", () => {
    expect(blockedBy(OPENINGS[0])).toEqual([]);
  });

  it("o turno de produção passa o sinal no runGates da conversa, lido da mensagem dela", () => {
    // `index.ts` is Deno and outside the tsconfig: its wiring is read as source, as in function-drift.
    const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
    const call = /gates = runGates\(attempt\.text, \{[^]*?\n {4}\}\);/.exec(source)?.[0] ?? "";
    expect(call).toContain('askedIdentity: asksWhatSheIs(inbound.body ?? "")');
  });
});
