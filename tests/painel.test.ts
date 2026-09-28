import { describe, expect, it } from "vitest";
import { renderPainel, yesterdayInSaoPaulo, type PainelData } from "../src/dev/painel-core.js";

/** Rows as PostgREST returns them: `numeric` columns arrive as strings. */
const data = (over: Partial<PainelData> = {}): PainelData => ({
  day: "2026-10-02",
  outcomes: {
    turns: 10, sent: 7, fallbacks: 1, handoffs: 0, deferred: 1, stopped: 0, opted_out: 1,
    fallback_rate: "0.1250" as unknown as number, handoff_rate: "0.0000" as unknown as number,
    avg_rewrites: "0.40" as unknown as number, cost_brl: "0.9000" as unknown as number,
  },
  gates: [
    { gate: "price_promise", checks: 12, blocks: 3, warns: 0 },
    { gate: "delivery_promise", checks: 12, blocks: 0, warns: 1 },
  ],
  costs: [
    { conversation_id: "c1", stage: "pedido_criado", model_calls: 6, cost_brl: "0.6000" as unknown as number, counter_drift_brl: "0.0000" as unknown as number },
    { conversation_id: "c2", stage: "perdido", model_calls: 2, cost_brl: "0.3000" as unknown as number, counter_drift_brl: "0.0000" as unknown as number },
  ],
  watch: [],
  funnel: [
    { origin: "ad", stage: "perdido", stage_order: 9, conversations: 1 },
    { origin: "ad", stage: "pedido_criado", stage_order: 5, conversations: 1 },
  ],
  attribution: [{ ad: "ad1", headline: "Colete", leads: 2, leads_ordered: 1, leads_delivered: 0, leads_opted_out: 0 }],
  ...over,
});

describe("painel diário", () => {
  it("dia normal: números certos e sem alerta", () => {
    const p = renderPainel(data(), 1.875);
    expect(p.alerts).toEqual([]);
    expect(p.text).toContain("10 turnos: 7 enviados, 1 fallback, 0 handoff, 1 adiados, 0 parados, 1 opt-out");
    expect(p.text).toContain("fallback 12,5%");
    expect(p.text).toContain("price_promise: 3 de 12 (25,0%)");
    expect(p.text).not.toContain("delivery_promise:");
    expect(p.text).toContain("2 conversas · total R$ 0,90 · média R$ 0,45 · maior R$ 0,60");
    expect(p.text).toContain("anúncio: pedido_criado 1 · perdido 1");
    expect(p.text).toContain("perdido: 1");
    expect(p.text).toContain("ad1 (Colete): 2 leads, 1 com pedido");
    expect(p.text).toContain("Sem alertas.");
  });

  it("conversa acima do teto é alerta; no teto exato não é", () => {
    const costs = [
      { conversation_id: "caro", stage: "conversando", model_calls: 30, cost_brl: 1.9, counter_drift_brl: 0 },
      { conversation_id: "limite", stage: "conversando", model_calls: 30, cost_brl: 1.875, counter_drift_brl: 0 },
    ];
    const p = renderPainel(data({ costs, watch: costs }), 1.875);
    expect(p.alerts).toHaveLength(1);
    expect(p.alerts[0]).toContain("caro");
  });

  it("conversa de ontem que passou do teto hoje é alerta no painel de hoje", () => {
    // Começou às 23:50 do dia anterior: não está nas conversas do dia, está na janela.
    const tarde = { conversation_id: "tarde", stage: "conversando", model_calls: 40, cost_brl: 2.1, counter_drift_brl: 0 };
    const p = renderPainel(data({ watch: [tarde] }), 1.875);
    expect(p.text).toContain("2 conversas");
    expect(p.alerts.join()).toContain("tarde custou R$ 2,10");
  });

  it("contador de custo divergente e handoff são alertas", () => {
    const costs = [{ conversation_id: "c9", stage: "novo", model_calls: 1, cost_brl: 0.1, counter_drift_brl: -0.05 }];
    const p = renderPainel(data({ costs, watch: costs, outcomes: { ...data().outcomes!, handoffs: 2 } }), 1.875);
    expect(p.alerts.join()).toContain("c9: contador de custo difere");
    expect(p.alerts.join()).toContain("2 handoff(s)");
  });

  it("sem config, o teto não é conferido e isso é dito", () => {
    const p = renderPainel(data(), null);
    expect(p.text).toContain("teto não conferido");
    expect(p.alerts).toEqual([]);
  });

  it("dia vazio não quebra", () => {
    const p = renderPainel({ day: "2026-10-02", outcomes: null, gates: [], costs: [], watch: [], funnel: [], attribution: [] }, 1.875);
    expect(p.text).toContain("nenhum turno registrado");
    expect(p.text).toContain("perdido: 0");
    expect(p.alerts).toEqual([]);
  });

  it("ontem é o dia de São Paulo, não o de UTC", () => {
    // 02:00 UTC do dia 3 ainda é 23:00 do dia 2 em São Paulo: ontem é o dia 1.
    expect(yesterdayInSaoPaulo(new Date("2026-10-03T02:00:00Z"))).toBe("2026-10-01");
    expect(yesterdayInSaoPaulo(new Date("2026-10-03T12:00:00Z"))).toBe("2026-10-02");
  });
});
