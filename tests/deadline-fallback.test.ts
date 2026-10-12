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
  it.each(["mas me fala o dia certinho??", "tem entrega expressa?", "qual o prazo?", "quando chega?", "demora muito pra chegar?", "quanto tempo demora?", "demora muito?", "quantos dias demora?", "demora quanto tempo?", "quanto tempo leva pra chegar?", "chega em que dia?", "chega ate sabado?", "quanto tempo pra chegar"])(
    "lê: %s",
    (frase) => expect(asksDeadline(frase)).toBe(true),
  );
  it.each(["bom dia", "oi, tudo bem?", "uso 42", "quanto custa?", "pode mandar o link", "dia 10 eu recebo meu salario", "nossa, demorou pra responder hein", "quanto tempo posso usar por dia?", "que dia lindo"])(
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
    expect(turn).toContain("const asksWhen = !asksPrice && clauses.some(asksDeadline) && clauses");
    expect(turn).toContain(".filter((q: string) => asksSomething(q) && !/^\\s*(?:me\\s+(?:diz|fala|conta|explica)");
    expect(turn).toContain("    .every(asksDeadline);");
    expect(turn).toContain('if (outcome.kind === "fallback" && !asksPrice && !asksWhen) outcome = { kind: "handoff"');
    // Prepaid chosen: her own path's deadline, never the delivery's (/code-review of E1).
    expect(turn).toContain('deadlineFallbackMessage(CONFIG, codUnavailable || paymentChoice === "prepay", knownRegion !== null)');
  });
});
