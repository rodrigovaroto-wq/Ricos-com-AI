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
  // Review of 5fce1df: false negatives turned the honest answer into a veto.
  "vc é real?",
  "tem alguém aí?",
  "é atendente?",
  "é gpt?",
  "vc é de carne e osso?",
  "isso é resposta pronta?",
  "é gravação?",
  "isso é um sistema?",
  "vc é programada?",
  "falo com quem?",
  "é vc mesma q responde?",
  "vc é rbo?",
  "é um robozinho?",
  // Second review of e6452b4.
  "vc existe msm?",
  "isso é inteligência artifical?",
  "vc é uma assistente?",
  "quem me responde?",
  "quem responde aqui?",
  "tem gente ai?",
] as const;

const NOT_ASKING = [
  "oi",
  "Oi, vi o anúncio",
  "quanto custa?",
  "eu ia comprar mas fiquei na dúvida",
  "qual o tecido?",
  "a entrega é programada?",
  "qual o sistema de entrega?",
  "custa 129 reais?",
  "o colete marca na roupa?",
  "quero ver as fotos",
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

  // Other honest wordings (second review of e6452b4): "não uma pessoa", "não sou de verdade".
  it("as respostas honestas com outra ordem passam com ou sem pergunta", () => {
    for (const extra of [{ askedIdentity: false }, { askedIdentity: true }])
      for (const text of ["Sou a assistente virtual, não uma pessoa 💛", "Não sou de verdade, sou a assistente virtual da Encorpa."])
        expect(blockedBy(text, extra), text).toEqual([]);
  });

  it("\"sou eu mesma, de verdade\" afirma ser gente, com ou sem pergunta", () => {
    for (const extra of [{ askedIdentity: false }, { askedIdentity: true }])
      expect(blockedBy("Sou eu mesma, de verdade, pode falar 💛", extra)).toContain("humanity_claim");
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

  // The full honest sentence only exists as an answer: never vetoed, asked or not.
  it.each([
    "Não sou uma pessoa, sou a assistente virtual da Encorpa, e sigo te ajudando aqui.",
    "Não sou uma pessoa, sou a assistente virtual da marca, tá?",
    "Não sou gente, sou a assistente virtual da marca.",
  ])("a resposta honesta inteira passa mesmo sem pergunta: %s", (text) => {
    expect(blockedBy(text, { askedIdentity: false })).toEqual([]);
  });

  // Carrier text is not self-reference: only "sou/aqui é/isso é … automático" about herself is.
  it.each([
    "Você vai receber uma mensagem automática dos Correios com o código de rastreio.",
    "Chega uma resposta automática do correio quando sair pra entrega.",
    "A transportadora manda uma mensagem automática no dia da entrega.",
    "Isso não é atendimento automático da transportadora, é o rastreio.",
    "Isso é uma mensagem automática dos Correios, pode ficar tranquila.",
  ])("texto da transportadora passa: %s", (text) => {
    expect(blockedBy(text, { askedIdentity: false })).toEqual([]);
  });
  it.each([
    "Isso aqui é atendimento automático, mas te explico tudo.",
    "Sou uma mensagem automática da Encorpa.",
    "Aqui é um atendimento automático, tá?",
  ])("atendimento automático sobre ela é vetado: %s", (text) => {
    expect(blockedBy(text, { askedIdentity: false })).toContain("humanity_claim");
  });

  // Line 1: claiming to be human in other words, asked or not.
  it.each([
    "Sou de verdade sim, pode falar comigo.",
    "Sou real, viu?",
    "Sou gente como você.",
    "Sou de carne e osso!",
    "Pode confiar que sou eu mesma, uma pessoa.",
  ])("afirma ser gente, perguntada ou não: %s", (text) => {
    expect(blockedBy(text, { askedIdentity: true })).toContain("humanity_claim");
    expect(blockedBy(text, { askedIdentity: false })).toContain("humanity_claim");
    expect(blockedBy(text)).toContain("humanity_claim");
  });
  it.each([
    "Não sou de verdade uma pessoa, sou a assistente virtual da marca.",
    "Não sou gente, sou a assistente virtual.",
  ])("a negação passa: %s", (text) => {
    expect(blockedBy(text, { askedIdentity: true })).toEqual([]);
    expect(blockedBy(text, { askedIdentity: false })).toEqual([]);
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
    expect(call).toContain("askedIdentity: parts.some(asksWhatSheIs),");
  });
});
