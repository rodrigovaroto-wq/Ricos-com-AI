/**
 * Persona Rafa on v19-candidate (2026-10-13, wedding on Saturday): "Sobre chegar até sexta eu não consigo
 * te garantir por aqui" was vetoed as `delivery_promise` — the denial sits after the day, where the gate
 * never looked. Every rewrite fell and the conversation went to a person.
 */
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

const blocks = (text: string, regionKnown: boolean) =>
  runGates(text, ctx({ regionKnown })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const RAFA = [
  "Boa noite, sou a Malu, da Encorpa!",
  "Isso mesmo, na maioria das regiões dá pra pagar na entrega, você só paga quando o colete chegar na sua mão.",
  "Sobre chegar até sexta eu não consigo te garantir por aqui, a data exata aparece no checkout, me passa seu CEP pra eu ver as opções aí na sua região?",
].join("\n");

describe("delivery_promise: a recusa depois do dia", () => {
  it.each([false, true])("a resposta da Rafa passa a cadeia inteira (região conhecida %s)", (rk) =>
    expect(blocks(RAFA, rk)).toEqual([]),
  );
  it.each([
    "Sobre chegar até sexta eu não consigo te garantir.",
    "Chegar até sexta não dá pra garantir, a data aparece no checkout.",
    "Receber até sábado eu não posso prometer.",
    "Entregar na sexta a gente não garante.",
    "Não consigo te garantir que chega até sexta.",
    "Até sexta eu não consigo garantir.",
    "Não dá pra garantir sexta.",
    "Não consigo garantir que chega amanhã.",
    "Não chega amanhã, leva de 1 a 3 dias.",
  ])("passa: %s", (t) => expect(blocks(t, false)).not.toContain("delivery_promise"));
  it.each([
    "Chega até sexta.",
    "Consigo te garantir que chega até sexta.",
    "Não se preocupa, chega até sexta.",
    "Não tem como não chegar até sexta.",
    // The denial must be the next words, and deny the guarantee — not a promise with a disclaimer.
    "Chega até sexta, não consigo garantir o horário.",
    "Chega até sexta e não tem como atrasar.",
    "Chega até sexta, eu não consigo te garantir mais rápido que isso.",
    "Chegar até sexta eu não consigo garantir, só até sábado.",
    "Chegar até sexta eu não consigo te garantir, mas chega no sábado.",
    "Chegar até sexta não tem como não chegar.",
    "Chegar até sexta eu não tenho dúvida.",
    "Chegar até sexta é certeza, não consigo garantir o horário.",
    "Chegar até sexta eu não consigo te garantir mais que isso.",
    // v20 review: the refusal of one day does not cover the next claim
    "Chegar até sexta eu não posso garantir, chega amanhã.",
    "Chegar até sexta eu não posso garantir, mas chega amanhã.",
    "Chegar até sexta eu não posso garantir, chega na quinta.",
    "Chegar até sexta eu não posso garantir; mas sexta chega.",
    "Eu não posso garantir, chega amanhã.",
    "Não, chega amanhã.",
    "Não se preocupa, chega amanhã.",
    "Chegar até sexta eu não consigo prometer menos, chega até sexta.",
  ])("veta: %s", (t) => expect(blocks(t, false)).toContain("delivery_promise"));
});
