import { describe, expect, it } from "vitest";
import { InvalidTransitionError, canTransition, isLive, transition } from "@/agent/state-machine.js";

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
