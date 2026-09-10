import { describe, expect, it } from "vitest";
import { bubbleDelayMs, firstReplyAt, presenceRefreshes, splitBubbles } from "@/agent/pacing.js";
import { config } from "./fixtures.js";

/** O que o relógio de São Paulo marca naquele instante. */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );

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

  /**
   * A janela é a de São Paulo, não a do runtime: a Edge Function roda em UTC, onde
   * `openHour: 6` virava 03:00 em Brasília. Por isso todo instante daqui é escrito em
   * UTC explícito e toda expectativa é lida no relógio de São Paulo.
   */
  it("dentro do horário local, a primeira resposta sai 3 minutos depois", () => {
    // 17:00Z = 14:00 em São Paulo, dentro da janela 6-24.
    const chegou = new Date("2026-09-10T17:00:00Z");
    expect(horaEmSP(chegou)).toBe(14);
    expect(firstReplyAt(chegou, config).getTime() - chegou.getTime()).toBe(180_000);
  });

  it("depois do closeHour local, espera a abertura do dia seguinte", () => {
    const fecha22 = { ...config, hours: { openHour: 6, closeHour: 22 } };
    // 02:00Z do dia 11 = 23:00 do dia 10 em São Paulo, depois do fechamento.
    const chegou = new Date("2026-09-11T02:00:00Z");
    expect(horaEmSP(chegou)).toBe(23);
    const resposta = firstReplyAt(chegou, fecha22);
    expect(horaEmSP(resposta)).toBe(6);
    expect(resposta.toISOString()).toBe("2026-09-11T09:00:00.000Z");
  });

  it("de madrugada local, espera as 06:00 do mesmo dia em São Paulo", () => {
    // 05:00Z = 02:00 em São Paulo, mesma data local.
    const chegou = new Date("2026-09-10T05:00:00Z");
    expect(horaEmSP(chegou)).toBe(2);
    const resposta = firstReplyAt(chegou, config);
    expect(horaEmSP(resposta)).toBe(6);
    expect(resposta.toISOString()).toBe("2026-09-10T09:00:00.000Z");
  });

  /**
   * O caso que motivou o conserto. Julgado pela hora do runtime em UTC os dois
   * instantes abaixo caem do lado errado da janela — e a versão antiga do
   * `firstReplyAt`, que usava `getHours()`, respondia exatamente ao contrário.
   */
  it("decide pela hora de São Paulo, não pela do runtime em UTC", () => {
    // 08:00Z: hora 8 em UTC está DENTRO de 6-24, mas são 05:00 em São Paulo — fora.
    const antesDeAbrir = new Date("2026-09-10T08:00:00Z");
    expect(antesDeAbrir.getUTCHours()).toBe(8);
    expect(horaEmSP(antesDeAbrir)).toBe(5);
    expect(firstReplyAt(antesDeAbrir, config).toISOString()).toBe("2026-09-10T09:00:00.000Z");

    // 01:00Z: hora 1 em UTC está FORA de 6-24, mas são 22:00 em São Paulo — dentro.
    const aindaAberto = new Date("2026-09-11T01:00:00Z");
    expect(aindaAberto.getUTCHours()).toBe(1);
    expect(horaEmSP(aindaAberto)).toBe(22);
    expect(firstReplyAt(aindaAberto, config).getTime() - aindaAberto.getTime()).toBe(180_000);
  });

  it("quebra a resposta em no máximo três bolhas", () => {
    const texto = ["um", "dois", "três", "quatro", "cinco"].join("\n\n");
    const bolhas = splitBubbles(texto);
    expect(bolhas).toHaveLength(3);
    expect(bolhas[2]).toContain("cinco");
  });
});
