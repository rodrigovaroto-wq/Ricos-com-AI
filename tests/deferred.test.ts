import { describe, expect, it } from "vitest";
import { nextOpening, renderFollowup } from "@/agent/followups.js";
import { config } from "./fixtures.js";

/**
 * Adiar é a remediação de quem escreveu a resposta certa na hora errada. O texto já
 * custou uma chamada de modelo: ele é guardado e reenviado, não reescrito.
 *
 * Todo horário aqui é hora de Brasília (UTC-3), e os instantes são escritos em UTC
 * de propósito — foi confundir os dois que agendava resposta para as 3 da manhã.
 */
const brt = (iso: string) => new Date(iso);
/** O que o relógio de São Paulo marca naquele instante. */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );

describe("quando a janela reabre", () => {
  it("de madrugada em Brasília, abre às 6h do mesmo dia", () => {
    // 03:00Z = 00:00 em Brasília.
    const at = nextOpening(brt("2026-09-07T03:00:00Z"), 6);
    expect(horaEmSP(at)).toBe(6);
    expect(at.toISOString()).toBe("2026-09-07T09:00:00.000Z");
  });

  it("à noite em Brasília, abre às 6h do dia seguinte", () => {
    // 23:00Z = 20:00 em Brasília.
    const at = nextOpening(brt("2026-09-07T23:00:00Z"), 6);
    expect(horaEmSP(at)).toBe(6);
    expect(at.toISOString()).toBe("2026-09-08T09:00:00.000Z");
  });

  // A regressão que motivou tudo isto: com o relógio do servidor, 06:00 UTC virava
  // 03:00 em Brasília — a hora que o próprio arquivo diz que faz número ser denunciado.
  it("nunca agenda para a madrugada de Brasília", () => {
    for (let h = 0; h < 24; h++) {
      const at = nextOpening(brt(`2026-09-07T${String(h).padStart(2, "0")}:30:00Z`), 6);
      expect(horaEmSP(at), `entrada ${h}:30Z`).toBe(6);
    }
  });
});

describe("a resposta adiada", () => {
  const base = { leadId: "lead-1", config };

  it("reenvia exatamente o texto guardado, sem regerar nada", () => {
    const texto = "Oi! O colete custa R$ 129,90 com frete incluído.";
    expect(renderFollowup("deferred_reply", { ...base, body: texto })).toBe(texto);
  });

  it("sem corpo não vira mensagem vazia: a linha é cancelada", () => {
    expect(renderFollowup("deferred_reply", base)).toBeNull();
    expect(renderFollowup("deferred_reply", { ...base, body: "   " })).toBeNull();
  });
});
