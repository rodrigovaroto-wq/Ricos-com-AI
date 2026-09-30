import { describe, expect, it } from "vitest";
import { checkHumanReply, HUMAN_REPLY_REFUSAL, SERVICE_WINDOW_MS } from "@/agent/followups.js";

/**
 * L0.3 (2026-09-30): o operador responde a cliente pelo formulário "Responder cliente" do
 * n8n. A regra de quando o texto pode sair mora aqui, não no n8n: texto livre só dentro da
 * janela de 24 h, nunca para quem pediu para parar, e um clique duplo não vira duas mensagens.
 */
const now = new Date("2026-09-30T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const base = {
  now,
  text: "Oi, aqui é a Rô da Encorpa. O P serve sim, pode ficar tranquila.",
  lead: { opted_out_at: null },
  lastInboundAt: ago(30 * MIN),
  lastOutbound: null,
};

describe("resposta humana pelo formulário (L0.3)", () => {
  it("dentro da janela, para lead que não saiu, sai com o texto aparado", () => {
    expect(checkHumanReply({ ...base, text: "  Oi!  \n" })).toEqual({ ok: true, text: "Oi!" });
  });

  it("texto vazio ou só espaço não sai", () => {
    expect(checkHumanReply({ ...base, text: "   \n " })).toEqual({ ok: false, reason: "empty" });
  });

  it("texto acima do limite da Cloud API (4096) não sai — seria recusado depois de gravado", () => {
    expect(checkHumanReply({ ...base, text: "a".repeat(4096) }).ok).toBe(true);
    expect(checkHumanReply({ ...base, text: "a".repeat(4097) })).toEqual({ ok: false, reason: "too_long" });
  });

  it("telefone sem lead não sai: não há conversa com esse número", () => {
    expect(checkHumanReply({ ...base, lead: null })).toEqual({ ok: false, reason: "no_lead" });
  });

  it("quem pediu para parar não recebe, nem de uma pessoa", () => {
    expect(checkHumanReply({ ...base, lead: { opted_out_at: "2026-09-30T10:00:00Z" } })).toEqual({
      ok: false,
      reason: "opted_out",
    });
  });

  it("fora da janela de 24 h não sai — com a mesma margem de 10 min da régua", () => {
    expect(checkHumanReply({ ...base, lastInboundAt: null })).toEqual({ ok: false, reason: "window_closed" });
    expect(checkHumanReply({ ...base, lastInboundAt: ago(SERVICE_WINDOW_MS) })).toEqual({ ok: false, reason: "window_closed" });
    expect(checkHumanReply({ ...base, lastInboundAt: ago(SERVICE_WINDOW_MS - 5 * MIN) })).toEqual({
      ok: false,
      reason: "window_closed",
    });
    expect(checkHumanReply({ ...base, lastInboundAt: ago(SERVICE_WINDOW_MS - 11 * MIN) }).ok).toBe(true);
  });

  it("o mesmo texto de novo em menos de 2 min é clique duplo, não sai duas vezes", () => {
    const lastOutbound = { body: base.text, at: ago(1 * MIN) };
    expect(checkHumanReply({ ...base, lastOutbound })).toEqual({ ok: false, reason: "duplicate" });
    expect(checkHumanReply({ ...base, text: ` ${base.text} `, lastOutbound })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("negação do duplicado: texto diferente, ou o mesmo depois de 2 min, sai", () => {
    expect(checkHumanReply({ ...base, lastOutbound: { body: "Outra coisa", at: ago(1 * MIN) } }).ok).toBe(true);
    expect(checkHumanReply({ ...base, lastOutbound: { body: base.text, at: ago(3 * MIN) } }).ok).toBe(true);
  });

  it("todo motivo de recusa tem frase em PT-BR para o operador", () => {
    for (const reason of ["empty", "too_long", "no_lead", "opted_out", "window_closed", "duplicate"] as const) {
      expect(HUMAN_REPLY_REFUSAL[reason].length).toBeGreaterThan(10);
    }
  });
});
