import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conversationFlags, coverageSystem, parseCoverageCards, PERSONA_RULES, type TranscriptEntry } from "@/dev/persona-run-core.js";

/**
 * The coverage suite (operator, 2026-10-15): the taxonomy of what a customer brings, built from the real tests, the persona
 * history and the flows the ads will bring, stays at 95% or more covered by a persona; the cards render with the shared rules;
 * the screening flags what a reader must look at.
 */
const cards = parseCoverageCards(readFileSync("src/dev/scenarios/cobertura.json", "utf8"));
const { categorias } = JSON.parse(readFileSync("src/dev/scenarios/cobertura-taxonomia.json", "utf8")) as {
  categorias: Array<{ id: string; by: string[]; fora?: string }>;
};
const personaFiles = new Set(readdirSync(".claude/agents").filter((f) => /^persona-.+\.md$/.test(f)).map((f) => f.slice(0, -3)));
const vendaIds = new Set(
  (JSON.parse(readFileSync("src/dev/scenarios/venda.json", "utf8")) as Array<{ id: string }>).map((s) => `venda-${s.id}`),
);

describe("taxonomia de cobertura", () => {
  const ids = new Set(categorias.map((c) => c.id));
  it("toda categoria citada por uma ficha existe, e toda persona citada existe", () => {
    for (const c of cards) for (const cat of c.covers) expect(ids.has(cat), `${c.id} → ${cat}`).toBe(true);
    for (const cat of categorias) for (const p of cat.by) expect(personaFiles.has(p) || vendaIds.has(p), `${cat.id} → ${p}`).toBe(true);
  });
  it("95% ou mais das categorias têm quem as exercite", () => {
    const covered = categorias.filter((cat) => cat.by.length > 0 || cards.some((c) => c.covers.includes(cat.id)));
    const missing = categorias.filter((cat) => !covered.includes(cat));
    // What is left is only what the local door cannot reach, each with where it is proved instead.
    for (const m of missing) expect(m.fora, `${m.id} sem persona e sem motivo`).toBeTruthy();
    expect(covered.length / categorias.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe("fichas compactas", () => {
  it("cada ficha vira um system prompt com a ficha e as regras comuns", () => {
    for (const c of cards) {
      const s = coverageSystem(c);
      expect(s).toContain(c.who);
      expect(s).toContain(PERSONA_RULES);
      expect(s).toContain("[FIM]");
    }
  });
  it("ficha incompleta, id repetido ou regex quebrada são recusados", () => {
    const one = cards[0]!;
    expect(() => parseCoverageCards(JSON.stringify([{ ...one, voice: "" }]))).toThrow(/voice/);
    expect(() => parseCoverageCards(JSON.stringify([one, one]))).toThrow(/repetido/);
    expect(() => parseCoverageCards(JSON.stringify([{ ...one, mustNot: ["("] }]))).toThrow();
  });
});

describe("alertas da conversa", () => {
  const malu = (text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({ from: "valen", text, ...extra });
  const her = (text: string): TranscriptEntry => ({ from: "persona", text });
  it("promessa, handoff, reescritas, proibido da ficha e pergunta repetida", () => {
    const flags = conversationFlags(
      [
        her("oi"), malu("Chega amanhã sim! Me passa seu CEP?"),
        her("nao lembro"), malu("Me passa seu CEP?", { rewrites: 3 }),
        her("?"), malu("Me passa seu CEP?", { status: "handoff" }),
        her("ok"), malu("Tudo bem, não te mando mais nada."),
      ],
      ["mais nada"],
    );
    expect(flags).toContain("turno 1: promessa de dia");
    expect(flags).toContain("turno 2: 3 reescritas");
    expect(flags).toContain("turno 3: handoff");
    expect(flags).toContain("turno 4: promete silêncio");
    expect(flags).toContain("turno 4: proibido /mais nada/");
    expect(flags).toContain("CEP pedido 3 vezes");
    expect(flags.some((f) => f.startsWith("a mesma pergunta 3 vezes"))).toBe(true);
  });
  it("negação: conversa limpa não tem alerta", () => {
    expect(conversationFlags([her("oi"), malu("Oi! Me passa seu CEP?"), her("01310100"), malu("Aí tem pagamento na entrega. Quer seguir?")])).toEqual([]);
  });
});
