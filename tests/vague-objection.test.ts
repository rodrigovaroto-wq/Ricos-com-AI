/**
 * Plan 16 §4.5 (operator, 2026-10-21): "tá caro", "achei mais barato", "vou ver", "vou pensar" get one question — the
 * operator's — with one TRUE reason to buy now, only the reasons true in that turn, each in a sentence the chain passes.
 */
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { askedVagueQuestion, THINK_REPLY, VAGUE_OBJECTION_QUESTION, vagueObjectionSituation } from "@/agent/retry.js";
import { config as base, ctx } from "./fixtures.js";

const config = { ...base, prices: { ...base.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }, scarcity: { lowStock: 20 } };
const LINE = "O *GG* está acabando: restam só *12* no estoque 😮";
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

  it("falha: sem entrega na porta — nada de pagar na entrega nem de amanhã, a âncora com o preço do antecipado", () => {
    const s = vagueObjectionSituation(config, { codAvailable: false, firstDateIsTomorrow: true, scarcityLine: null });
    expect(s).not.toMatch(/não paga nada agora|amanhã|na entrega\./);
    expect(s).toContain(`"Ele sai de R$ 216,50 por R$ 116,91 no antecipado."`);
    const verdict = runGates("Ele sai de R$ 216,50 por R$ 116,91 no antecipado.", ctx({ config, paymentPath: "prepay", codUnavailable: true }));
    expect(verdict.allowed).toBe(true);
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
