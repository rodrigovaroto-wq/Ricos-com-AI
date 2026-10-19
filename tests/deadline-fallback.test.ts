/**
 * Grafo §74 — persona Rafa (2026-10-11): "me fala o dia certinho??" + "tem entrega expressa?" got four
 * vetoed promises of a day and went to a person. With every draft vetoed, her deadline question now gets
 * the deadline the prompt teaches, the day left to the checkout.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { asksDeadline, deadlineFallbackMessage } from "@/agent/prompt.js";
import { runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("pergunta de prazo", () => {
  it.each(["mas me fala o dia certinho??", "tem entrega expressa?", "qual o prazo?", "quando chega?", "demora muito pra chegar?", "quanto tempo demora?", "demora muito?", "quantos dias demora?", "demora quanto tempo?", "quanto tempo leva pra chegar?", "chega em que dia?", "chega ate sabado?", "quanto tempo pra chegar",
    // Rafa (2026-10-13)
    "consigo receber ate sexta??", "e se nao chegar ate sexta?", "da tempo de chegar ate sexta?", "chegaria ate sexta?", "e se nao chegar a tempo?", "e se não chegar antes do casamento?",
    // R21.5h (2026-10-13): the refund in another sentence does not erase the delivery's deadline
    "quando chega? e se eu pedir reembolso?", "qual o prazo de entrega? o dinheiro volta se eu devolver?"])(
    "lê: %s",
    (frase) => expect(asksDeadline(frase)).toBe(true),
  );
  it.each(["bom dia", "oi, tudo bem?", "uso 42", "quanto custa?", "pode mandar o link", "dia 10 eu recebo meu salario", "nossa, demorou pra responder hein", "quanto tempo posso usar por dia?", "que dia lindo",
    // negations of the new readings
    "da tempo de pensar?", "recebi seu audio", "se nao servir eu troco?", "chegando em casa te respondo",
    // v20 review (2026-10-13): a size doubt and a refund are not the delivery's deadline
    "e se nao chegar a servir?", "e se não chegar a fechar?", "recebo até sexta o reembolso?", "o estorno chega ate sexta?", "recebo o dinheiro antes de sexta?",
    // R21.5h: per sentence, the refund in the deadline's own sentence still is not the delivery's
    "quando chega o reembolso?", "e se eu devolver? quanto tempo demora o estorno?", "quando chega, e o dinheiro?"])(
    "não lê: %s",
    (frase) => expect(asksDeadline(frase)).toBe(false),
  );
});

describe("a resposta pronta de prazo passa a cadeia inteira", () => {
  for (const [codUnavailable, regionKnown] of [[false, false], [false, true], [true, true]] as const) {
    it(`sem COD ${codUnavailable}, região conhecida ${regionKnown}`, () => {
      const text = deadlineFallbackMessage(config, codUnavailable, regionKnown);
      expect(text).not.toMatch(/\d{1,2}\/\d{1,2}|amanh|expressa/);
      const blocked = runGates(text, ctx({ config, codUnavailable, paymentPath: codUnavailable ? "prepay" : "cod" })).traces.filter((t) => t.verdict === "block");
      expect(blocked.map((t) => t.gate)).toEqual([]);
    });
  }
  it("antes do CEP diz 'dependendo da sua região'", () => {
    expect(deadlineFallbackMessage(config, false, false)).toMatch(/^Dependendo da sua região/);
  });
});

describe("o turno usa a resposta de prazo no lugar do handoff", () => {
  it("pergunta de prazo com todas as reescritas vetadas não vira handoff", () => {
    expect(turn).toContain("const asksWhen = !asksPrice && clauses.some(asksDeadline) && (deadlineVetoOnly || clauses");
    expect(turn).toContain(".filter((q: string) => asksSomething(q) && !leadsIn(q))");
    expect(turn).toContain("/^\\s*(?:me\\s+(?:diz|fala|conta|explica)(?:\\s+uma\\s+coisa)?|deixa\\s+eu\\s+te\\s+perguntar|uma\\s+duvida|outra\\s+coisa)[\\s,:.!]*$/i");
    expect(turn).toContain("    .every(asksDeadline));");
    // Rafa (2026-10-13): a deadline-only veto answers with the fixed deadline even beside another question
    expect(turn).toContain('gates.traces.every((t) => t.verdict !== "block" || t.gate === "delivery_promise" || t.gate === "coverage_claim");');
    // R22.1: nothing that is not a ceiling goes to a person any more; the generic fallback is the safe reply.
    expect(turn).toContain("const fallbackIsGeneric = !asksPrice && !asksOffer && !asksWhen && !firstReply && !asksHowToPay;");
    // Prepaid chosen: her own path's deadline, never the delivery's (/code-review of E1).
    expect(turn).toContain('deadlineFallbackMessage(CONFIG, codUnavailable || paymentChoice === "prepay", knownRegion !== null)');
  });
});

describe("a primeira resposta nunca vira handoff (grafo §76)", () => {
  it("com todas as reescritas vetadas no primeiro contato, sai a saudação e a frase de preço", () => {
    expect(turn).toContain("const firstReply = greeting !== null && !clauses.some((q: string) => asksSomething(q));");
    expect(turn.indexOf("const firstReply = greeting !== null")).toBeGreaterThan(turn.indexOf("const greeting = recentOutbound"));
  });
});
