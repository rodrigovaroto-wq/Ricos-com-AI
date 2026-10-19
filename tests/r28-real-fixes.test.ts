import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { remarkBesideCep, parseCep, refusesCep } from "@/agent/address.js";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string) => runGates(text, ctx()).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

/** Persona Rafa (2026-10-19): the honest "not even paying more freight" fell into "me fala de novo" after five vetoes. */
describe("shipping_promise: pagar frete A MAIS, negado, não é frete grátis", () => {
  it.each([
    "Faz todo sentido querer garantir antes do casamento, e sendo bem direta não consigo te prometer que chega até sexta e não tem como chegar hoje, nem pagando frete a mais.",
    "Não tem como adiantar, nem pagando frete extra.",
    "Não dá pra pagar frete adicional pra chegar antes.",
  ])("passa: %s", (t) => expect(blocked(t)).not.toContain("shipping_promise"));
  it.each([
    "Aqui você nem paga frete.",
    "Você não paga o frete.",
    "Sem frete a mais pra você.",
    // Review of the fix: the claim in the present tense stays a claim.
    "No pix você não paga frete a mais.",
    "Aqui você nem paga frete extra, só o produto.",
    "Não cobramos frete adicional, só o valor do kit.",
  ])(
    "negação — a promessa de frete grátis continua vetada: %s",
    (t) => expect(blocked(t)).toContain("shipping_promise"),
  );
});

/** Persona Marcinha (2026-10-19): "nao vou passar cep ainda" and the CEP was asked four more times. */
describe("ela não quer passar o CEP agora", () => {
  it.each(["nao vou passar cep ainda nao sem saber tamanho certo", "Não quero passar meu CEP", "cep eu não passo", "prefiro não passar o cep agora"])(
    "recusa: %s",
    (t) => expect(refusesCep(t)).toBe(true),
  );
  it.each(["vou te passar o cep", "não sei se passo o cep certo", "por que não passar o cep?", "meu cep não lembro", "não vou passar o cep errado não"])(
    "negação — não é recusa: %s",
    (t) => expect(refusesCep(t)).toBe(false),
  );
  it("a turn trata a recusa como o CEP esquecido, e a régua também", () => {
    expect(turn).toContain("const cepForgotten = cepRefused || (");
    expect(turn).toContain('forgetsCep(spoken(m.body ?? "")) || refusesCep(spoken(m.body ?? ""))');
  });
});

/** Real lead (2026-10-19): "306 72000" sent four times and never read; a Belo Horizonte buyer got the prepaid link. */
describe("CEP escrito 3+5", () => {
  it("lê", () => expect(parseCep("306 72000")).toBe("30672-000"));
  it("lê o 5+3 do endereço, não o número da casa colado no 3+5", () => expect(parseCep("Rua das Flores 123 04710 090")).toBe("04710-090"));
  it("lê no meio da frase", () => expect(parseCep("meu cep é 306 72000 obrigada")).toBe("30672-000"));
  it.each(["meu tel 3456-7890", "99491-5983", "551.381.468-40", "031 99123 4567"])("negação — telefone e CPF continuam fora: %s", (t) => expect(parseCep(t)).toBeNull());
});

describe("a turn: nome só de texto digitado, e o CEP geral da cidade (index.ts lido como fonte)", () => {
  it("nome de áudio transcrito só quando ela acabou de ser perguntada", () => {
    expect(turn).toContain("const typedName = askedNameNow ? anyName : extractIdentityBurst(parts.filter((_, i) => !rawParts[i]?.startsWith(TRANSCRIBED)), false).name;");
  });
  it("o CEP terminado em 000 que a consulta não acha pede o da rua, sem motivo inventado", () => {
    expect(turn).toContain("const cepState = cepNotFound && /000$/.test(");
    expect(turn).toContain("Não invente outro` +");
  });
});

/** Persona venda-dificil (2026-10-19): "isso não serve em mulher de verdade, meu cep é …" got the offer and no answer. */
describe("o que ela disse junto do CEP é respondido depois da oferta", () => {
  it("quatro palavras ou mais, fora os dígitos, chamam o resume", () => {
    expect(turn).toContain("const answerAfterOffer = (askedBeside || saidBeside) && !isResume;");
  });
});

describe("o que ela disse ao lado do CEP (remarkBesideCep)", () => {
  it.each(["isso não serve em mulher de verdade, meu cep é 30672-000", "tenho medo de ser golpe 30672000 mas vou tentar"])(
    "comentário pede resposta: %s",
    (t) => expect(remarkBesideCep(t)).toBe(true),
  );
  it.each([
    "Boa tarde, segue meu cep 30672-000 obrigada",
    "Rua das Flores 123 bairro Centro 30672-000",
    "oi tudo bem com você 30672-000",
    "30672-000",
    "isso não serve em mulher de verdade",
  ])("negação — não é comentário: %s", (t) => expect(remarkBesideCep(t)).toBe(false));
});

describe("a turn: ressalvas da revisão (index.ts lido como fonte)", () => {
  it("o CEP 000 'pode ser' o geral da cidade, sem afirmar", () => expect(turn).toContain("esse pode ser o CEP geral da cidade"));
  it("a explicação da recusa do CEP sai uma vez só, conferida pela turn", () =>
    expect(turn).toContain("/\\bcep\\b[^.!?]*\\b(?:serve|s[oó])\\b[^.!?]*entrega/i.test(m)"));
});
