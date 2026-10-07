/**
 * Grafo §66 — the operator's second real test (conversation 816795ca, 2026-10-07) and the two
 * friends' conversations of the same day. Each case is a sentence from production, literal, with
 * the negations beside it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { malformedCep } from "@/agent/address.js";
import { classifyOptOut } from "@/agent/guardrails.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

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

describe("C3 — CEP com o número errado de dígitos", () => {
  it("as duas mensagens da conversa", () => {
    expect(malformedCep("e meu cep é 004710090")).toBe("004710090");
    expect(malformedCep("ja te mandei meu cep, mas é 004710090")).toBe("004710090");
  });

  it("sete dígitos, e a resposta ao pedido do CEP sem a palavra", () => {
    expect(malformedCep("cep 0471009")).toBe("0471009");
    expect(malformedCep("004710090", true)).toBe("004710090");
  });

  it.each([
    ["CEP certo", "meu cep é 04710-090", false],
    ["CEP certo sem traço", "04710090", true],
    ["telefone de 9 dígitos sem falar de CEP", "meu número é 996557745", false],
    ["CPF", "meu cpf é 55138146840", true],
    ["número de casa", "cep? moro no 123", false],
  ])("não lê como CEP errado: %s", (_, frase, asked) => {
    expect(malformedCep(frase, asked)).toBeNull();
  });

  it("o turno diz ao modelo que o CEP não foi lido, e nunca 'recebi/anotei'", () => {
    expect(turn).toContain('malformedCep(inbound.body ?? "", /\\bcep\\b/i.test(lastOutbound))');
    expect(turn).toContain("Nunca diga que recebeu ou anotou o CEP.");
    expect(turn).toContain("nunca diga que recebeu, anotou ou vai conferir o CEP.");
    expect(turn).toMatch(/coverageUnknown,\s+cepState,/);
  });
});

describe("C4 — nome, e-mail e CPF esperam o CEP", () => {
  it("com o CEP faltando, o modelo é proibido de pedir os dados e de dizer que está pronto", () => {
    expect(turn).toContain('missing === "cep"\n        ? `Falta o CEP: antes dele não peça nome, e-mail nem CPF, e nunca diga que está tudo pronto.`');
  });

  it("o CEP é pedido também quando ela já escolheu como paga, não só quando pede o link", () => {
    expect(turn).toContain(': missing === "cep" && (linkDue || paymentChoice !== null)');
  });
});
