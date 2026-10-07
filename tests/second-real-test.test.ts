/**
 * Grafo §66 — the operator's second real test (conversation 816795ca, 2026-10-07) and the two
 * friends' conversations of the same day. Each case is a sentence from production, literal, with
 * the negations beside it.
 */
import { describe, expect, it } from "vitest";
import { classifyOptOut } from "@/agent/guardrails.js";

describe("C2 — 'pare de me mandar …' só é descadastro quando o que para são as mensagens da loja", () => {
  it("a frase da compradora não é descadastro", () => {
    expect(classifyOptOut("pare de me mandar confirmações, apenas me mande o link do checkout")).toBe("none");
  });

  it.each([
    "pare de me mandar confirmações",
    "para de me mandar pergunta, só manda o link",
    "pare de mandar mensagem e me manda o checkout",
    "parem de me enviar o resumo, quero finalizar",
  ])("não bloqueia quem compra ou pede outra coisa: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("none");
  });

  it.each([
    "para de me mandar mensagem",
    "pare de me mandar mensagem",
    "parem de me mandar essas mensagens",
    "para de me mandar mensagem. vocês pegaram meu número onde?",
    "pare de me mandar promoção, por favor",
    "para de me encher o saco",
    "pode parar de me mandar mensagem",
    "pare de me mandar mensagem toda hora",
    "para de mandar isso",
    "pare de me mandar",
    "parem de me mandar mensagem no whatsapp!",
  ])("continua descadastro: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("explicit");
  });
});
