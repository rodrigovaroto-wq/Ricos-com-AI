import { describe, expect, it } from "vitest";
import { range } from "@/dev/simulate.js";

/**
 * A bateria de conversas roda aqui também, e não só por `pnpm dev`.
 *
 * Ela cobre o que teste unitário não cobre: cem roteiros de conversa em três escritas
 * cada, mais a cadeia inteira contra as frases que a agente pode escrever. Deixar isso
 * como script solto significa que ninguém roda — e foi exatamente assim que o `pnpm
 * lint` passou meses quebrado sem ninguém notar.
 */
describe("bateria de conversas", () => {
  const cases = range();

  it("tem cobertura de verdade, não meia dúzia de casos", () => {
    expect(cases.length).toBeGreaterThan(700);
  });

  it.each(cases.map((c) => [`${c.scenario} · ${c.angle}`, c] as const))("%s", (_nome, c) => {
    expect(`${c.input} → ${c.actual}`).toBe(`${c.input} → ${c.expected}`);
  });
});
