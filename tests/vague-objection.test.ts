/**
 * Plan 16 §4.5 (operator, 2026-10-21): "tá caro", "achei mais barato", "vou ver", "vou pensar" get one question — the
 * operator's — with one TRUE reason to buy now, only the reasons true in that turn, each in a sentence the chain passes.
 */
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { askedVagueQuestion, THINK_REPLY, VAGUE_OBJECTION_QUESTION, VAGUE_PRICE_QUESTION, vagueObjectionSituation } from "@/agent/retry.js";
import { config as base, ctx } from "./fixtures.js";

const config = { ...base, prices: { ...base.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }, scarcity: { lowStock: 20 } };
const LINE = "O *GG* está acabando pra entrega na sua região: restam só *12* 😮";
const all = { codAvailable: true, firstDateIsTomorrow: true, scarcityLine: LINE };
const quoted = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

describe("a pergunta aprovada", () => {
  it("é o texto do operador, palavra por palavra, e passa a cadeia nos dois caminhos", () => {
    expect(VAGUE_OBJECTION_QUESTION).toBe("Claro! Ficou alguma dúvida que eu possa resolver, sobre o tamanho, a entrega ou o valor? 💛");
    for (const paymentPath of ["cod", "prepay"] as const) expect(runGates(VAGUE_OBJECTION_QUESTION, ctx({ config, paymentPath })).allowed).toBe(true);
  });
});

describe("vagueObjectionSituation: só os gatilhos verdadeiros", () => {
  it("feliz: tudo verdadeiro — os cinco motivos, e cada um passa a cadeia (com a consulta do estoque no contexto)", () => {
    const reasons = quoted(vagueObjectionSituation(config, all));
    expect(reasons).toEqual([
      "A primeira data que aparece no checkout pra sua região é amanhã.",
      "Você não paga nada agora: paga só quando o colete chegar.",
      "Você tem 7 dias após o recebimento pra trocar ou devolver.",
      "Ele sai de R$ 216,50 por R$ 129,90 na entrega.",
      LINE,
    ]);
    for (const r of reasons) {
      const verdict = runGates(`${r} ${VAGUE_OBJECTION_QUESTION}`, ctx({ config, stockLeft: { size: "GG", qty: 12 }, knownSize: "GG" }));
      expect({ r, blocked: verdict.traces.filter((t) => t.verdict === "block") }).toEqual({ r, blocked: [] });
    }
  });

  it("borda: primeira data não é amanhã, sem estoque baixo — nem o dia nem o estoque", () => {
    const s = vagueObjectionSituation(config, { ...all, firstDateIsTomorrow: false, scarcityLine: null });
    expect(s).not.toContain("amanhã");
    expect(s).not.toContain("estoque");
    expect(s).toContain("Você não paga nada agora");
  });

  it("falha: sem entrega na porta — nada de pagar na entrega nem de amanhã, e nenhum preço (o frete do antecipado vem por cima)", () => {
    const s = vagueObjectionSituation(config, { codAvailable: false, firstDateIsTomorrow: true, scarcityLine: null });
    expect(s).not.toMatch(/não paga nada agora|amanhã|na entrega\./);
    // The review's sentence: the anchor with the prepaid price, the freight left out.
    expect(s).not.toContain("Ele sai de R$ 216,50 por R$ 116,91 no antecipado.");
    expect(s).not.toMatch(/R\$/);
    expect(quoted(s)).toEqual(["Você tem 7 dias após o recebimento pra trocar ou devolver."]);
    for (const r of quoted(s)) expect(runGates(`${r} ${VAGUE_OBJECTION_QUESTION}`, ctx({ config, paymentPath: "prepay", codUnavailable: true })).allowed).toBe(true);
  });

  it("com entrega na porta, a âncora vai com o preço da entrega", () => {
    const s = vagueObjectionSituation(config, { codAvailable: true, firstDateIsTomorrow: false, scarcityLine: null });
    expect(quoted(s)).toContain("Ele sai de R$ 216,50 por R$ 129,90 na entrega.");
    expect(s).not.toContain("no antecipado");
  });

  it("nunca prazo de oferta nem link", () => {
    const s = vagueObjectionSituation(config, all);
    expect(s).toContain("nenhum prazo de oferta e nenhum link");
    expect(s).not.toMatch(/só hoje|tempo limitado|https?:/);
  });
});

describe("askedVagueQuestion: a pergunta já foi, nas palavras do modelo", () => {
  it("feliz: a do operador e uma reescrita dela", () => {
    expect(askedVagueQuestion([VAGUE_OBJECTION_QUESTION])).toBe(true);
    expect(askedVagueQuestion(["Entendo! Ficou alguma dúvida sobre o tamanho ou o valor que eu possa resolver?"])).toBe(true);
  });
  it("falha: a resposta de hoje ao \"vou pensar\" e uma dúvida de um assunto só não são a pergunta", () => {
    expect(askedVagueQuestion([`${THINK_REPLY} 💛`])).toBe(false);
    expect(askedVagueQuestion(["Ficou alguma dúvida sobre o tamanho?"])).toBe(false);
  });
  it("negação: \"sem dúvida, o tamanho e a entrega estão certos\" conta (custo: a segunda pergunta não sai, o lado seguro)", () => {
    expect(askedVagueQuestion(["Sem dúvida, o tamanho e a entrega estão certos."])).toBe(true);
  });
});

describe("a reclamação de preço não ouve \"Claro!\" (personas, 2026-10-21: \"nem compensa pra mim\" → \"Claro!\")", () => {
  it("a pergunta de preço abre com Entendo!, passa a cadeia e conta como já feita", () => {
    expect(VAGUE_PRICE_QUESTION.startsWith("Entendo!")).toBe(true);
    expect(VAGUE_PRICE_QUESTION.slice("Entendo!".length)).toBe(VAGUE_OBJECTION_QUESTION.slice("Claro!".length));
    for (const paymentPath of ["cod", "prepay"] as const) expect(runGates(VAGUE_PRICE_QUESTION, ctx({ config, paymentPath })).allowed).toBe(true);
    expect(askedVagueQuestion([VAGUE_PRICE_QUESTION])).toBe(true);
  });

  it("preço: acolhe sem concordar; adiamento: Claro!; nos dois, o motivo antes e a pergunta por último", () => {
    const price = vagueObjectionSituation(config, { ...all, price: true });
    expect(price).toContain("nunca com Claro");
    expect(price).toContain("reclamou do valor");
    const putoff = vagueObjectionSituation(config, all);
    expect(putoff).toContain("comece com Claro!");
    expect(putoff).not.toContain("nunca com Claro");
    for (const s of [price, putoff]) expect(s.indexOf("motivos")).toBeLessThan(s.indexOf("por último a pergunta"));
    // The reasons are the same true ones either way.
    expect(quoted(price)).toEqual(quoted(putoff));
  });
});
