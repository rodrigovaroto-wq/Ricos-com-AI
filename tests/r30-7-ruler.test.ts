/**
 * R30.7 (operator, 2026-10-23): the ruler lost `silence_2` (0 of 40 answered). Two holes the test review found and closed:
 * the reply with the link, past the entry's band, armed no silence touch and the lead was never `perdido`; and `silence_3`
 * could land a minute after `silence_1` (with `silence_2` between them the shortest gap was 8 h).
 */
import { describe, expect, it } from "vitest";
import { SILENCE_GAP_MS, endsSilenceRuler, rulerFor, scheduleSilence } from "@/agent/followups.js";

describe("R30.7: a régua sem o 2º lembrete", () => {
  it("a resposta com o link, passada a faixa da entrada, ainda arma um toque de silêncio que fecha a régua", () => {
    const entry = new Date("2026-10-28T19:23:00.000Z");
    const reply = new Date("2026-11-01T22:17:26.098Z");
    const ruler = rulerFor(reply, "link_sent", undefined, true, { entry, lastInbound: new Date("2026-11-01T22:15:26.098Z") });
    expect(ruler.map((f) => f.kind)).toEqual(["checkout_reminder", "silence_1"]);
    expect(ruler.some((f, i) => endsSilenceRuler(f.kind, ruler.slice(i + 1).map((g) => g.kind)))).toBe(true);
  });

  it("com o cupom ainda na faixa, a resposta com o link continua sem o silence_1 (opção 1 do operador)", () => {
    const entry = new Date("2026-10-28T19:23:00.000Z");
    const reply = new Date("2026-10-28T20:00:00.000Z");
    const kinds = rulerFor(reply, "link_sent", undefined, true, { entry, lastInbound: reply }).map((f) => f.kind);
    expect(kinds).toEqual(["checkout_reminder", "silence_3"]);
  });

  it("nunca dois toques colados: o silence_3 fica a pelo menos 8 h do silence_1, ou não é armado", () => {
    expect(SILENCE_GAP_MS).toBe(8 * 60 * 60 * 1000);
    const entry = new Date("2026-10-05T03:00:00Z");
    let min = Infinity;
    for (let m = 0; m < 72 * 60; m += 7) {
      const now = new Date(entry.getTime() + m * 60_000);
      const r = scheduleSilence(now, "after_price", { entry, lastInbound: now });
      expect(r.map((f) => f.kind)).not.toContain("silence_2");
      if (r.length === 2) min = Math.min(min, r[1]!.runAt.getTime() - r[0]!.runAt.getTime());
    }
    expect(min).toBeGreaterThanOrEqual(SILENCE_GAP_MS);
  });
});
