import { describe, expect, it } from "vitest";
import { MAX_BUBBLE_WORDS, bubbleDelayMs, firstReplyAt, presenceRefreshes, splitBubbles } from "@/agent/pacing.js";
import { config } from "./fixtures.js";

/** O que o relógio de São Paulo marca naquele instante. */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
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
  it("dentro do horário local, a primeira resposta sai 1 minuto depois (R18.1)", () => {
    // 17:00Z = 14:00 em São Paulo, dentro da janela 6-24.
    const chegou = new Date("2026-09-10T17:00:00Z");
    expect(horaEmSP(chegou)).toBe(14);
    expect(firstReplyAt(chegou, config).getTime() - chegou.getTime()).toBe(60_000);
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
    expect(firstReplyAt(aindaAberto, config).getTime() - aindaAberto.getTime()).toBe(60_000);
  });

  it("quebra a resposta em no máximo três bolhas", () => {
    const texto = ["um", "dois", "três", "quatro", "cinco"].join("\n\n");
    const bolhas = splitBubbles(texto);
    expect(bolhas).toHaveLength(3);
    expect(bolhas[2]).toContain("cinco");
  });
});

/**
 * Bolhas de até ~30 palavras, cortadas só em fim de frase (R13.4): as personas mediram
 * mediana de 49 palavras por mensagem.
 */
describe("bolhas curtas, nunca no meio da frase", () => {
  const palavras = (s: string) => s.trim().split(/\s+/).length;
  const frase = (n: number, fim = ".") => `${Array(n).fill("palavra").join(" ")}${fim}`;

  it("o limite é 30 palavras", () => {
    expect(MAX_BUBBLE_WORDS).toBe(30);
  });

  it("parágrafo longo vira várias bolhas, cada uma com até 30 palavras", () => {
    const texto = [frase(12), frase(12, "!"), frase(12, "?"), frase(12)].join(" ");
    const bolhas = splitBubbles(texto);
    expect(bolhas.length).toBeGreaterThan(1);
    for (const b of bolhas) expect(palavras(b)).toBeLessThanOrEqual(30);
    expect(bolhas.join(" ")).toBe(texto);
  });

  it("nunca corta uma frase: cada bolha termina onde uma frase termina", () => {
    const texto =
      "Ele tava R$ 216,50 no site e agora sai por R$ 129,90 pra pagar na entrega. " +
      "Você recebe em casa e escolhe o dia no checkout, e paga só quando o colete chegar na sua mão. " +
      "Tem alguma roupa que você adora e deixou de usar? Me conta qual é!";
    const bolhas = splitBubbles(texto);
    expect(bolhas.length).toBeGreaterThan(1);
    for (const b of bolhas) expect(b).toMatch(/[.!?]$/);
    // A vírgula decimal e o ponto do domínio não são fim de frase.
    expect(bolhas[0]).toContain("R$ 129,90");
    expect(splitBubbles("Acesse encorpa-fashion.com.br pra ver.")).toEqual(["Acesse encorpa-fashion.com.br pra ver."]);
  });

  it("uma frase sozinha acima do limite sai inteira, sem corte", () => {
    const longa = frase(45);
    expect(splitBubbles(longa)).toEqual([longa]);
  });

  it("quebra de linha entre duas frases que cabem juntas é mantida", () => {
    const texto = `${frase(5)}\n${frase(5)} ${frase(25)}`;
    const bolhas = splitBubbles(texto);
    expect(bolhas).toEqual([`${frase(5)}\n${frase(5)}`, frase(25)]);
  });

  it("junta bolhas curtas do fim só se a junção couber no limite", () => {
    const longas = [frase(25), frase(25), frase(25), frase(25)].join("\n\n");
    expect(splitBubbles(longas)).toHaveLength(4);
  });
});
