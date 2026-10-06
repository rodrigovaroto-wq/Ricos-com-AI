import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * Rodada de personas de 2026-10-07 (Jussara): o raciocínio do modelo vazou para a cliente —
 * "Se o CEP dela? Need ask CEP." no meio da resposta. Nenhum gate olhava isso.
 */
const blocks = (text: string) => runGates(text, ctx()).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("internal_note: nota interna do modelo não sai", () => {
  it.each([
    "É verdade sim, você paga na entrega.\nSe o CEP dela? Need ask CEP.\nMe passa seu CEP?",
    "Need to ask her size first. Qual número de calça você usa?",
    "Let me check: o colete sai por R$ 129,90 na entrega.",
    "The user wants the price. Ele sai por R$ 129,90 na entrega.",
    "I should ask for the CEP. Me passa seu CEP?",
    "Ask her for the e-mail. Me passa seu e-mail?",
  ])("vetada: %s", (t) => expect(blocks(t)).toContain("internal_note"));

  it.each([
    "Me passa seu CEP? É pra eu ver como fica a entrega aí.",
    "O colete é preto, de poliéster com elastano e forro de algodão.",
    "Dá pra lavar à mão, em água fria, e secar à sombra.",
    "Ele vai bem com look de festa, com legging ou com jeans.",
    "Pode usar no dia a dia, no trabalho ou no home office.",
    "Tem o site encorpa-fashion.com.br, se quiser ver as fotos.",
    "Ok, combinado! Te espero aqui.",
  ])("negação — português, inclusive com palavra estrangeira de uso comum, passa: %s", (t) =>
    expect(blocks(t)).not.toContain("internal_note"),
  );
});
