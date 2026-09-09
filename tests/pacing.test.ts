import { describe, expect, it } from "vitest";
import { bubbleDelayMs, firstReplyAt, presenceRefreshes, splitBubbles } from "@/agent/pacing.js";
import { config } from "./fixtures.js";

describe("ritmo humano", () => {
  it("o atraso é por bolha, proporcional ao tamanho dela", () => {
    const curta = bubbleDelayMs("oi tudo bem");
    const longa = bubbleDelayMs(Array(50).fill("palavra").join(" "));
    expect(longa).toBeGreaterThan(curta);
    expect(longa).toBe(50 * 800);
  });

  it("nunca responde instantaneamente, mesmo numa bolha de uma palavra", () => {
    expect(bubbleDelayMs("oi")).toBeGreaterThanOrEqual(1_000);
  });

  it("reenvia o 'digitando' em blocos, porque a presença expira", () => {
    expect(presenceRefreshes(60_000)).toBe(4);
    expect(presenceRefreshes(5_000)).toBe(1);
  });

  it("dentro do horário, a primeira resposta sai 3 minutos depois", () => {
    const chegou = new Date("2026-09-06T14:00:00");
    expect(firstReplyAt(chegou, config).getTime() - chegou.getTime()).toBe(180_000);
  });

  it("de madrugada, espera as 06:00 do mesmo dia", () => {
    const chegou = new Date("2026-09-06T03:20:00");
    const resposta = firstReplyAt(chegou, config);
    expect(resposta.getHours()).toBe(6);
    expect(resposta.getDate()).toBe(chegou.getDate());
  });

  it("quebra a resposta em no máximo três bolhas", () => {
    const texto = ["um", "dois", "três", "quatro", "cinco"].join("\n\n");
    const bolhas = splitBubbles(texto);
    expect(bolhas).toHaveLength(3);
    expect(bolhas[2]).toContain("cinco");
  });
});
