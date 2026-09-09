import { describe, expect, it } from "vitest";
import { gateNames, gateRemedies, remedyFor, runGates, type Remedy } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * A block must never become silence, and never become the operator's inbox by
 * default. Each gate says what to do about it: rewrite the reply, schedule it for
 * later, or stop. These tests fix that mapping — a gate that changes class changes
 * how a real conversation ends, so it should not change quietly.
 */

const byClass = (remedy: Remedy) =>
  gateNames.filter((name) => gateRemedies[name] === remedy).sort();

describe("classificação dos dezenove gates", () => {
  it("todo gate tem uma classe, e só existem três", () => {
    expect(Object.keys(gateRemedies)).toHaveLength(19);
    expect(new Set(Object.values(gateRemedies))).toEqual(
      new Set<Remedy>(["rewrite", "defer", "stop"]),
    );
  });

  it("reescrever: o que a operação não sustenta, a agente escreve de novo", () => {
    expect(byClass("rewrite")).toEqual([
      "charge_promise",
      "coupon_exists",
      "delivery_promise",
      "health_claim",
      "humanity_claim",
      "identical_template",
      "installment_promise",
      "invented_testimonial",
      "price_promise",
      "scarcity_claim",
      "shipping_promise",
      "unattributed_window",
      "unavailable_offer",
      "unverified_size",
      "warranty_promise",
      "weight_loss_claim",
    ]);
  });

  it("adiar: a resposta está certa, o relógio é que não", () => {
    expect(byClass("defer")).toEqual(["business_hours", "pacing"]);
  });

  it("parar: opt-out é o único que nunca é reescrito", () => {
    expect(byClass("stop")).toEqual(["opt_out"]);
  });
});

describe("qual remediação um bloqueio pede", () => {
  it("mensagem aprovada não pede remediação nenhuma", () => {
    const result = runGates("Chega em 1 a 3 dias, com entrega agendada.", ctx());
    expect(result.allowed).toBe(true);
    expect(remedyFor(result)).toBeNull();
  });

  it("preço inventado pede reescrita", () => {
    const result = runGates("Sai por R$ 99,90 hoje!", ctx());
    expect(remedyFor(result)).toBe("rewrite");
  });

  it("fora do horário pede adiamento, não reescrita", () => {
    const result = runGates(
      "Chega em 1 a 3 dias, com entrega agendada.",
      ctx({ now: new Date("2026-09-06T03:00:00") }),
    );
    expect(remedyFor(result)).toBe("defer");
  });

  it("opt-out pede parada", () => {
    const result = runGates("Oi! Tudo bem?", ctx({ optedOut: true }));
    expect(remedyFor(result)).toBe("stop");
  });

  // A regra que protege a cliente que pediu para sair: reescrever o preço
  // produziria uma mensagem correta — enviada a quem não quer receber nada.
  it("quando dois gates barram, vence o mais estrito", () => {
    const result = runGates("Sai por R$ 99,90 hoje!", ctx({ optedOut: true }));
    expect(result.traces.filter((t) => t.verdict === "block").length).toBeGreaterThan(1);
    expect(remedyFor(result)).toBe("stop");
  });

  // A ordem que faltava: `defer` não é um veredito mais duro, é um mais tarde. Quando
  // os dois barram, o conteúdo é corrigido primeiro e o texto já certo é que espera a
  // janela. Ranquear ao contrário guardava a resposta errada e a descartava no dia
  // seguinte, sem mensagem, sem handoff e sem ninguém saber.
  it("conteúdo errado fora da janela: reescreve primeiro, adia depois", () => {
    const result = runGates(
      "Sai por R$ 99,90 hoje!",
      ctx({ pacing: { sentLastHour: 60, hourlyLimit: 60, sentToday: 100, dailyLimit: 400 } }),
    );
    expect(remedyFor(result)).toBe("rewrite");
  });

  it("e opt-out continua vencendo os dois", () => {
    const result = runGates(
      "Sai por R$ 99,90 hoje!",
      ctx({
        optedOut: true,
        pacing: { sentLastHour: 60, hourlyLimit: 60, sentToday: 100, dailyLimit: 400 },
      }),
    );
    expect(remedyFor(result)).toBe("stop");
  });
});

/**
 * O achado nº 1 dos reviews, travado como teste: de madrugada, um gate de conteúdo
 * era engolido pelo `defer`, o texto errado ia guardado, e a varredura o descartava
 * na manhã seguinte — sem mensagem, sem handoff, sem ninguém avisado.
 */
describe("madrugada com conteúdo errado", () => {
  const madrugada = ctx({ now: new Date("2026-09-07T03:00:00Z") });

  it("o horário e o cupom barram juntos, e o conteúdo vence", () => {
    const result = runGates("Temos um cupom de desconto pra você!", madrugada);
    const bloqueados = result.traces.filter((t) => t.verdict === "block").map((t) => t.gate);
    expect(bloqueados).toContain("coupon_exists");
    expect(bloqueados).toContain("business_hours");
    expect(remedyFor(result)).toBe("rewrite");
  });

  it("com o conteúdo já limpo, sobra só o relógio", () => {
    const result = runGates("Chega em 1 a 3 dias, com entrega agendada.", madrugada);
    expect(remedyFor(result)).toBe("defer");
  });
});
