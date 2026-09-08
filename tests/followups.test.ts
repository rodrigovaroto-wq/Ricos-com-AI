import { describe, expect, it } from "vitest";
import {
  pickVariant,
  renderFollowup,
  scheduleOrder,
  scheduleSilence,
  nextOpening,
  type RenderContext,
} from "@/agent/followups.js";
import { hourIn, remedyFor, runGates } from "@/agent/guardrails.js";
import { config, ctx as gateCtx } from "./fixtures.js";

/** O que o relógio de São Paulo marca naquele instante. */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );

const render = (over: Partial<RenderContext> = {}): RenderContext => ({
  leadId: "lead-abc",
  config,
  now: new Date("2026-09-10T10:00:00"), // uma quinta
  ...over,
});

describe("régua de silêncio", () => {
  const now = new Date("2026-09-06T14:00:00");

  it("são três toques, espaçados como decidido", () => {
    const [t1, t2, t3] = scheduleSilence(now);
    expect(t1!.runAt.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(horaEmSP(t2!.runAt)).toBe(9);
    expect(t2!.runAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t3!.runAt.getTime() - now.getTime()).toBe(3 * 24 * 60 * 60_000);
  });

  // O horário é o do negócio, não o do servidor: a Edge Function roda em UTC, onde
  // "9h" virava 6h da manhã em Brasília.
  it("o segundo toque cai às 9h de Brasília, venha o instante de onde vier", () => {
    for (let h = 0; h < 24; h++) {
      const at = scheduleSilence(new Date(`2026-09-06T${String(h).padStart(2, "0")}:40:00Z`));
      expect(horaEmSP(at[1]!.runAt), `entrada ${h}:40Z`).toBe(9);
    }
  });

  it("o primeiro toque retoma do ponto exato onde ela parou", () => {
    expect(renderFollowup("silence_1", render({ stopPoint: "before_size" }))).toMatch(/manequim/i);
    expect(renderFollowup("silence_1", render({ stopPoint: "after_price" }))).toMatch(/não paga nada agora|não sai nada do seu bolso/i);
    expect(renderFollowup("silence_1", render({ stopPoint: "link_sent" }))).toMatch(/pedido/i);
  });

  it("o segundo toque muda de ângulo — não repete a frase do primeiro", () => {
    const t1 = renderFollowup("silence_1", render({ stopPoint: "after_price" }))!;
    const t2 = renderFollowup("silence_2", render())!;
    expect(t2).not.toBe(t1);
    expect(t2).toMatch(/7 dias/);
  });

  it("o terceiro toque fica em silêncio enquanto o cupom não existe na Coinzz", () => {
    expect(renderFollowup("silence_3", render())).toBeNull();
  });

  it("com o cupom ativo, o terceiro toque sai com a moldura do dia da semana", () => {
    const ativo = { ...config, coupon: { ...config.coupon, active: true } };
    const texto = renderFollowup("silence_3", render({ config: ativo }))!;
    expect(texto).toContain("Super Quinta");
    expect(texto).toContain("20% de desconto");
    expect(texto).toMatch(/não te mando mais nada/i); // saída digna
  });
});

describe("variantes sem chamar modelo", () => {
  it("mesma cliente, mesma variante", () => {
    const a = renderFollowup("silence_2", render({ leadId: "lead-1" }));
    const b = renderFollowup("silence_2", render({ leadId: "lead-1" }));
    expect(a).toBe(b);
  });

  it("clientes diferentes não recebem todas a mesma frase literal", () => {
    const textos = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
        renderFollowup("silence_2", render({ leadId: id })),
      ),
    );
    expect(textos.size).toBeGreaterThan(1);
  });

  it("a escolha é estável e dentro da lista", () => {
    expect(pickVariant("qualquer", ["x"])).toBe("x");
    expect(["x", "y"]).toContain(pickVariant("outro", ["x", "y"]));
  });
});

describe("régua de pós-pedido", () => {
  const ordered = new Date("2026-09-06T12:00:00");

  it("são quatro mensagens entre o pedido e a porta", () => {
    const plano = scheduleOrder(ordered, config.delivery.codDaysMin);
    expect(plano.map((p) => p.kind)).toEqual([
      "order_confirmed",
      "order_shipped",
      "order_eve",
      "order_delivered",
    ]);
  });

  it("a confirmação sai no mesmo dia e a véspera antes da entrega", () => {
    const [confirmado, , vespera] = scheduleOrder(ordered, 3);
    expect(confirmado!.runAt.getDate()).toBe(ordered.getDate());
    expect(vespera!.runAt.getTime()).toBeLessThan(ordered.getTime() + 3 * 24 * 60 * 60_000);
  });

  it("a véspera manda separar o valor certo — é a mensagem que evita a recusa", () => {
    const texto = renderFollowup("order_eve", render())!;
    expect(texto).toContain("R$ 129,90");
    expect(texto).toMatch(/amanhã/i);
    expect(texto).toMatch(/maquininha/i);
  });

  it("a confirmação repete tamanho e endereço", () => {
    const texto = renderFollowup("order_confirmed", render({ size: "G", address: "Rua das Flores, 120" }))!;
    expect(texto).toContain("G");
    expect(texto).toContain("Rua das Flores, 120");
  });
});

describe("toda mensagem da régua passa pelos onze guardrails", () => {
  const kinds = ["silence_1", "silence_2", "order_confirmed", "order_shipped", "order_eve", "order_delivered"] as const;

  it("nenhuma delas viola guardrail", () => {
    for (const kind of kinds) {
      const texto = renderFollowup(kind, render({ stopPoint: "after_price", size: "G" }))!;
      const veredito = runGates(texto, gateCtx({
        now: new Date("2026-09-10T10:00:00"),
        // Post-order messages report what logistics scheduled; they do not promise it.
        stage: kind.startsWith("order_") ? "logistics" : "presale",
      }));
      expect({ kind, blocked: veredito.traces.filter((t) => t.verdict === "block") }).toEqual({
        kind,
        blocked: [],
      });
    }
  });

  it("o toque do cupom é vetado pelo gate se escapar com o cupom inativo", () => {
    const ativo = { ...config, coupon: { ...config.coupon, active: true } };
    const texto = renderFollowup("silence_3", render({ config: ativo }))!;
    // Mesmo texto, agora julgado com o cupom desligado: o gate tem que barrar.
    const veredito = runGates(texto, gateCtx({ now: new Date("2026-09-10T10:00:00") }));
    expect(veredito.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain(
      "coupon_exists",
    );
  });
});

/**
 * A régua de silêncio se destruía de madrugada, e este é o motivo: quem para de
 * responder às 23:30 tem o `silence_1` vencendo à meia-noite, fora da janela 6-24.
 * A varredura tratava todo bloqueio como cancelamento, então o toque mais valioso da
 * régua — o de 30 minutos depois — era jogado fora em vez de sair ao amanhecer.
 *
 * O teste trava a decisão que a varredura consulta: o veto do horário é `defer`.
 */
describe("o relógio adia o toque, não o destrói", () => {
  const cfg = {
    prices: { codBrl: 129.9, prepayBrl: 110.42, prepayDiscountPercent: 15, anchorBrl: 216.5 },
    delivery: { codDaysMin: 3, codDaysMax: 5 },
    hours: { openHour: 6, closeHour: 24 },
    coupon: { percent: 20, active: false },
    cod: { physicalOnDeliveryActive: true },
  };

  it("o silence_1 de quem sumiu às 23:30 vence à meia-noite, fora da janela", () => {
    const [first] = scheduleSilence(new Date("2026-09-08T02:30:00Z")); // 23:30 BRT
    expect(hourIn(first!.runAt, "America/Sao_Paulo")).toBe(0);
  });

  it("e o veto que ele leva ali é de adiar, não de cancelar", () => {
    const text = renderFollowup("silence_1", { leadId: "l1", config: cfg, stopPoint: "before_size" })!;
    const gates = runGates(text, {
      config: cfg,
      layer: "agent",
      optedOut: false,
      now: new Date("2026-09-08T03:00:00Z"), // 00:00 BRT
      paymentPath: "cod",
      stage: "presale",
    });
    expect(gates.allowed).toBe(false);
    expect(remedyFor(gates)).toBe("defer");
  });

  it("e a reabertura que a varredura agenda cai dentro da janela", () => {
    const runAt = nextOpening(new Date("2026-09-08T03:00:00Z"), 6);
    expect(hourIn(runAt, "America/Sao_Paulo")).toBe(6);
  });
});
