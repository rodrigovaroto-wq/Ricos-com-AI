/**
 * Plan 16 §4.6 (operator, 2026-10-21): real scarcity. Below `scarcity.lowStock` units of HER size in the Logzz stock,
 * Malu may say her size is running out, with the real number — and `scarcity_claim` lets through only that sentence,
 * with that lookup in its context. Absent `lowStock` (the secret today) or absent lookup: today's veto. Deadlines never.
 */
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates, type GateContext } from "@/agent/guardrails.js";
import { scarcityBriefing, stockScarcityLine, systemPrompt } from "@/agent/prompt.js";
import { config as base, ctx } from "./fixtures.js";

const config = { ...base, scarcity: { lowStock: 20 } };
const LINE = "O *GG* está acabando pra entrega na sua região: restam só *12* 😮";
const real = (over: Partial<GateContext> = {}) => ctx({ config, stockLeft: { size: "GG", qty: 12 }, knownSize: "GG", ...over });
const blocked = (text: string, c: GateContext) => runGates(text, c).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("stockScarcityLine: só com o limite no config e o estoque real abaixo dele", () => {
  it("feliz: GG com 12 e limite 20 — a frase com o número real", () => {
    expect(stockScarcityLine(config, "GG", 12)).toBe(LINE);
  });
  it("borda: 19 sai, 20 não sai (abaixo do limite), 1 sai", () => {
    expect(stockScarcityLine(config, "GG", 19)).toContain("*19*");
    expect(stockScarcityLine(config, "GG", 20)).toBeNull();
    expect(stockScarcityLine(config, "GG", 1)).toContain("*1*");
  });
  it("falha: sem lowStock (o secret hoje), zero, negativo, NaN, fracionário, nulo, tamanho estranho", () => {
    expect(stockScarcityLine(base, "GG", 12)).toBeNull();
    expect(stockScarcityLine({ scarcity: { unitsLeft: 12 } }, "GG", 12)).toBeNull();
    for (const q of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 2.5, null, undefined]) expect(stockScarcityLine(config, "GG", q)).toBeNull();
    expect(stockScarcityLine(config, "{{SIZE}}", 12)).toBeNull();
  });
});

describe("scarcity_claim com a consulta do estoque", () => {
  it("feliz: a frase que o prompt ensina passa a cadeia inteira, nos dois caminhos", () => {
    for (const paymentPath of ["cod", "prepay"] as const) expect(blocked(LINE, real({ paymentPath }))).toEqual([]);
    expect(blocked("Restam só 12 no seu tamanho.", real())).toEqual([]);
  });

  it("a mesma frase sem a consulta, ou sem o limite no config, continua vetada (a verdade de hoje)", () => {
    expect(blocked(LINE, ctx({ config }))).toContain("scarcity_claim");
    expect(blocked(LINE, ctx({ stockLeft: { size: "GG", qty: 12 } }))).toContain("scarcity_claim");
    // A count at or above the limit is no scarcity, whatever the turn passed.
    expect(blocked(LINE, real({ stockLeft: { size: "GG", qty: 25 } }))).toContain("scarcity_claim");
    expect(blocked("O GG está acabando: restam só 0 no estoque.", real({ stockLeft: { size: "GG", qty: 0 } }))).toContain("scarcity_claim");
  });

  it("o negrito do WhatsApp não esconde mais a contagem (antes passava sem consulta nenhuma)", () => {
    expect(blocked("Restam só *12* no estoque.", ctx())).toContain("scarcity_claim");
  });

  it("borda: outro número, número por extenso, outro tamanho, estoque geral sem tamanho — vetados", () => {
    for (const text of [
      "O GG está acabando: restam só 5 no estoque.",
      "O GG está acabando: restam só doze.",
      "O M está acabando: restam só 12 no estoque.",
      "Restam só 12 no estoque.",
      "O GG está acabando: restam só 12, por R$ 129,90.",
    ])
      expect({ text, blocked: blocked(text, real()) }).toEqual({ text, blocked: expect.arrayContaining(["scarcity_claim"]) });
  });

  it("falha: prazo nunca passa, nem junto do estoque real (a oferta não tem data de fim)", () => {
    for (const text of [
      "O GG está acabando, e a promoção acaba hoje.",
      "Restam só 12 no seu tamanho. Esse preço vale só até hoje.",
      "Últimos dias da promoção!",
      "Restam só 12 no seu tamanho, corre que acaba!",
    ])
      expect({ text, blocked: blocked(text, real()) }).toEqual({ text, blocked: expect.arrayContaining(["scarcity_claim"]) });
  });

  it("negação: a frase negada passa com e sem a consulta, e a que não nega continua vetada", () => {
    expect(blocked("O estoque do GG não está acabando.", real())).not.toContain("scarcity_claim");
    expect(blocked("O estoque do GG não está acabando.", ctx())).not.toContain("scarcity_claim");
    // "não demora" does not deny the count.
    expect(blocked("Não demora: restam só 5 no seu tamanho.", real())).toContain("scarcity_claim");
  });
});

describe("prompt e gate: a mesma promessa", () => {
  it("sem frase do turno, o bloco de urgência é o de hoje", () => {
    expect(scarcityBriefing(config)).toEqual(["", "URGÊNCIA: não cite estoque, unidades restantes nem prazo de oferta — a loja não te deu nenhum número."]);
  });

  it("com a frase do turno, o prompt ensina ela palavra por palavra, uma vez, sem prazo", () => {
    const prompt = systemPrompt(config, gateBriefing(config), null, null, null, { stockLine: LINE }).replace(/\s+/g, " ");
    expect(prompt).toContain(`com estas palavras: "${LINE}"`);
    expect(prompt).toContain("Você pode dizer isso uma vez");
    expect(prompt).toContain(`nada de "só hoje", "tempo limitado" ou "corre"`);
    expect(prompt).not.toMatch(/tempo limitado(?!")/);
  });

  // For every count around the limit, the line exists exactly when the gate lets it through.
  it("para todo estoque de 0 a 30, a frase sai se e só se o gate deixa passar", () => {
    for (let qty = 0; qty <= 30; qty++) {
      const line = stockScarcityLine(config, "GG", qty);
      const said = line ?? `O *GG* está acabando pra entrega na sua região: restam só *${qty}* 😮`;
      const passes = !blocked(said, real({ stockLeft: { size: "GG", qty } })).includes("scarcity_claim");
      expect({ qty, passes }).toEqual({ qty, passes: line !== null });
    }
  });
});

describe("allowUnverified saiu do código (operador, 2026-10-22: só escassez real)", () => {
  it("um segredo que ainda traga a chave antiga não libera urgência sem contagem, nem quando ela adia", () => {
    const old = { ...base, scarcity: { allowUnverified: true } } as never;
    for (const text of ["Corre que estão acabando as últimas peças do lote!", "Só restam 4 unidades!", "A promoção acaba hoje, viu?"])
      for (const postponing of [false, true]) expect(blocked(text, ctx({ config: old, postponing })), `${text} / ${postponing}`).toContain("scarcity_claim");
  });

  it("o fallback do código não declara escassez nenhuma", async () => {
    const { readFileSync } = await import("node:fs");
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).not.toMatch(/scarcity:\s*\{\s*unitsLeft/);
    expect(turn).not.toMatch(/allowUnverified:\s*true/);
  });
});
