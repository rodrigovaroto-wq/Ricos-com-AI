import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryFor, orderStatusAfter, renderFollowup, stageForOrder } from "@/agent/followups.js";
import { runGates } from "@/agent/guardrails.js";
import type { BusinessConfig } from "@/config/business.js";
import { ctx } from "./fixtures.js";

/** The ruler half of the independent review of 2026-09-29 (findings 10, 18, 19). */
const example = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const withCoupon: BusinessConfig = {
  ...example,
  coupon: { ...example.coupon, code: "SUPER20", active: true },
  channel: { ...example.channel, templates: { silence_3: { name: "s3", language: "pt_BR", variables: [] } } },
} as BusinessConfig;

describe("achado 10: entregue à transportadora, com artigo, é em rota", () => {
  it.each(["Entregue para os Correios", "Entregue pros Correios", "Entregue para o transportador", "Entregue à transportadora", "Entregue aos Correios"])(
    "%s → em_rota",
    (s) => expect(stageForOrder(s)).toBe("em_rota"),
  );
  it.each(["Entregue", "Pedido entregue", "Aprovado / Entregue", "Entregue pela transportadora"])("%s → entregue_pago", (s) =>
    expect(stageForOrder(s)).toBe("entregue_pago"),
  );
});

describe("achado 19: o status nunca anda para trás", () => {
  it("em rota não volta a criado por webhook atrasado", () => {
    expect(orderStatusAfter("Em rota", "created")).toBe("Em rota");
    expect(orderStatusAfter("Aprovado / Enviado", "Aprovado")).toBe("Aprovado / Enviado");
  });
  it("mas avança, registra a tentativa frustrada e aceita a morte", () => {
    expect(orderStatusAfter("created", "Em rota")).toBe("Em rota");
    expect(orderStatusAfter("Em rota", "Entregue")).toBe("Entregue");
    expect(orderStatusAfter("Em rota", "Não entregue")).toBe("Não entregue");
    expect(orderStatusAfter("Em rota", "Cancelado")).toBe("Cancelado");
    expect(orderStatusAfter(null, "created")).toBe("created");
  });
});

describe("achado 18: o cupom do silence_3 segue o caminho dela", () => {
  const base = { leadId: "x", config: withCoupon, units: 1, now: new Date("2026-09-29T15:00:00Z") };
  it("no antecipado não cita 'pagando na entrega', e passa a cadeia sem entrega na praça", () => {
    const text = renderFollowup("silence_3", { ...base, paymentPath: "prepay" })!;
    expect(text).not.toMatch(/entrega/);
    expect(text).toMatch(/vale no pagamento antecipado/);
    const gated = runGates(text, ctx({ config: withCoupon, paymentPath: "prepay", codUnavailable: true }));
    expect(gated.traces.filter((t) => t.gate === "charge_promise" && t.verdict === "block")).toEqual([]);
  });
  it("na entrega continua valendo nos dois jeitos", () => {
    expect(renderFollowup("silence_3", { ...base, paymentPath: "cod" })).toMatch(/nos dois jeitos/);
  });
  it("fora da janela, o template (texto da entrega) não sai no antecipado", () => {
    const old = new Date("2026-09-25T15:00:00Z");
    expect(deliveryFor("silence_3", { ...base, paymentPath: "prepay", marketingOptIn: true }, old)).toEqual({ via: "blocked", reason: "no_template" });
    expect(deliveryFor("silence_3", { ...base, paymentPath: "cod", marketingOptIn: true }, old)?.via).toBe("template");
  });
});
