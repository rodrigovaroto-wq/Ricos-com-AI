import { describe, expect, it } from "vitest";
import { nextOpening, renderFollowup } from "@/agent/followups.js";
import { config } from "./fixtures.js";

/**
 * Adiar é a remediação de quem escreveu a resposta certa na hora errada. O texto já
 * custou uma chamada de modelo: ele é guardado e reenviado, não reescrito.
 */
describe("quando a janela reabre", () => {
  it("de madrugada, abre no mesmo dia", () => {
    const at = nextOpening(new Date("2026-09-07T03:20:00"), 6);
    expect(at.getDate()).toBe(7);
    expect(at.getHours()).toBe(6);
    expect(at.getMinutes()).toBe(0);
  });

  it("depois da abertura, só no dia seguinte", () => {
    const at = nextOpening(new Date("2026-09-07T23:40:00"), 6);
    expect(at.getDate()).toBe(8);
    expect(at.getHours()).toBe(6);
  });

  it("na hora exata da abertura, joga para amanhã em vez de agora", () => {
    const at = nextOpening(new Date("2026-09-07T06:00:00"), 6);
    expect(at.getDate()).toBe(8);
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
