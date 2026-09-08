import { describe, expect, it } from "vitest";
import { runAllConversations } from "@/dev/run-conversations.js";
import { ARCS, PERSONAS } from "@/dev/conversations.js";

/**
 * As conversas completas, rodando junto com o resto da suíte.
 *
 * O que elas cobrem e o teste unitário não cobre: o quarto turno. Um gate isolado prova
 * que a frase é barrada; só a conversa inteira prova que o tamanho dito no turno 2
 * sobrevive ao turno 5, que o handoff desarma a régua, e que o teto de custo cai no
 * meio de uma conversa longa sem deixar a cliente sem resposta.
 */
describe("conversas completas", () => {
  const cases = runAllConversations();

  it("são trezentas conversas, não uma amostra", () => {
    expect(ARCS.length * PERSONAS.length).toBeGreaterThanOrEqual(300);
  });

  it("cada persona carrega o próprio tamanho pela tabela publicada", () => {
    expect(PERSONAS.map((p) => `${p.number}→${p.size}`)).toEqual([
      "36→P",
      "40→M",
      "42→G",
      "46→GG",
      "50→XGG",
    ]);
  });

  it.each(cases.map((c) => [`${c.scenario} · ${c.angle}`, c] as const))("%s", (_nome, c) => {
    expect(c.actual).toBe(c.expected);
  });
});
