import { describe, expect, it } from "vitest";
import { InvalidTransitionError, canTransition, furthest, isLive, rankOf, transition } from "@/agent/state-machine.js";

describe("máquina de estados", () => {
  it("não regride: quem já tem pedido não volta a conversar", () => {
    expect(canTransition("pedido_criado", "conversando")).toBe(false);
    expect(() => transition("pedido_criado", "conversando", "mandou oi de novo")).toThrow(
      InvalidTransitionError,
    );
  });

  it("avança pelo caminho feliz", () => {
    expect(canTransition("novo", "conversando")).toBe(true);
    expect(canTransition("conversando", "tamanho_definido")).toBe(true);
    expect(canTransition("endereco_coletado", "pedido_criado")).toBe(true);
    expect(canTransition("em_rota", "entregue_pago")).toBe(true);
  });

  it("exige evidência para avançar", () => {
    expect(() => transition("novo", "conversando", "  ")).toThrow(/evidência/);
    expect(transition("novo", "conversando", "respondeu: quero sim").to).toBe("conversando");
  });

  it("bloqueado é terminal para o agente", () => {
    expect(canTransition("bloqueado", "conversando")).toBe(false);
    expect(canTransition("bloqueado", "perdido")).toBe(false);
  });

  it("perdido pode voltar sozinha", () => {
    expect(canTransition("perdido", "conversando")).toBe(true);
  });

  it("sabe onde ainda vale gastar modelo", () => {
    expect(isLive("conversando")).toBe(true);
    expect(isLive("entregue_pago")).toBe(false);
    expect(isLive("bloqueado")).toBe(false);
  });
});

/**
 * `furthest` existe porque a conversa não avança de um em um. Quem abre com "oi, uso 42,
 * meu CEP é 13010-100" pula três degraus numa mensagem só, e `canTransition` responde
 * `false` para um avanço que aconteceu de verdade. A regra da spec é sem regressão, não
 * sem salto.
 */
describe("furthest — o estágio que fica gravado", () => {
  it("avança quando o turno chegou mais longe", () => {
    expect(furthest("novo", "conversando")).toBe("conversando");
    expect(furthest("conversando", "pedido_criado")).toBe("pedido_criado");
  });

  it("permite salto de mais de um degrau", () => {
    // "oi, uso 42, meu CEP é 13010-100" numa mensagem só.
    expect(furthest("novo", "endereco_coletado")).toBe("endereco_coletado");
    expect(canTransition("novo", "endereco_coletado")).toBe(false);
  });

  it("nunca regride", () => {
    // Ela manda "oi" de novo depois do pedido; o estágio não volta.
    expect(furthest("pedido_criado", "conversando")).toBe("pedido_criado");
    expect(furthest("entregue_pago", "novo")).toBe("entregue_pago");
  });

  it("estágio terminal vence qualquer avanço", () => {
    expect(furthest("conversando", "bloqueado")).toBe("bloqueado");
    expect(furthest("pedido_criado", "perdido")).toBe("perdido");
  });

  it("de um terminal não se sai", () => {
    // `bloqueado` é opt-out: irreversível pelo agente, só uma pessoa desfaz.
    expect(furthest("bloqueado", "conversando")).toBe("bloqueado");
    expect(furthest("bloqueado", "pedido_criado")).toBe("bloqueado");
  });

  it("todo estágio terminal tem rank -1, e todo linear tem rank >= 0", () => {
    for (const s of ["recusado", "perdido", "bloqueado"] as const) expect(rankOf(s)).toBe(-1);
    for (const s of ["novo", "conversando", "pedido_criado", "entregue_pago"] as const) {
      expect(rankOf(s)).toBeGreaterThanOrEqual(0);
    }
  });
});
