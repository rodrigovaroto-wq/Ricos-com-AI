import { describe, expect, it } from "vitest";
import * as current from "@/agent/guardrails.js";
import { diff, literals } from "../src/dev/gate-diff.js";

describe("gate-diff: a comparação mecânica de vereditos", () => {
  it("extrai só frases de três palavras ou mais", () => {
    expect(literals(`x("Tiro mais alguma dúvida?"); y("ok"); z('pix')`)).toEqual(["Tiro mais alguma dúvida?"]);
  });

  it("a mesma versão não produz diferença", () => {
    expect(diff(current, current, ["Eu tiro um pouquinho.", "Na entrega chega em 1 a 3 dias."])).toEqual([]);
  });

  it("uma versão que afrouxa um gate aparece como veto → passa", () => {
    const loose = {
      ...current,
      runGates: (text: string, c: Parameters<typeof current.runGates>[1]) => {
        const r = current.runGates(text, c);
        return { ...r, traces: r.traces.map((t) => (t.gate === "price_promise" ? { ...t, verdict: "pass" as const } : t)) };
      },
    };
    const flips = diff(current, loose, ["Eu tiro um pouquinho."]);
    expect(flips).toHaveLength(1);
    expect(flips[0]).toMatchObject({ gate: "price_promise", from: "block", to: "pass" });
  });
});
