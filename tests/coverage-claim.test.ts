import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const verdict = (text: string, regionKnown: boolean | undefined) =>
  runGates(text, ctx(regionKnown === undefined ? {} : { regionKnown })).traces.find((t) => t.gate === "coverage_claim")?.verdict;

/**
 * Persona round 3 (2026-09-24, Cleide): the region lookup failed and the agent said "Chega
 * sim aí em Manaus". Without an answer for her postcode, coverage may not be affirmed.
 */
describe("coverage_claim: cobertura afirmada sem consulta de região", () => {
  it("veta a afirmação de que chega quando a região não respondeu", () => {
    for (const texto of [
      "Chega sim aí em Manaus, você recebe em até 3 dias.",
      "A gente entrega aí no seu CEP, pode ficar tranquila.",
      "Chega em Manaus em até 3 dias.",
      "Não se preocupe, chega sim aí.",
      "Atendemos aí sua cidade também.",
      "Entregamos nesse CEP sem problema.",
    ]) {
      expect(verdict(texto, false), texto).toBe("block");
    }
  });

  it("deixa passar a condição, a conferência e a negação honestas", () => {
    for (const texto of [
      "O checkout confirma se chega aí quando você digitar o CEP.",
      "Deixa eu ver se entrega no seu CEP.",
      "Não consigo confirmar agora se chega em Manaus.",
      "Chega em até 3 dias depois do pedido, e você escolhe o dia.",
      "Você recebe em casa e paga na entrega.",
      // Code review, 2026-09-24: os seis falsos vetos.
      "O checkout confirma a entrega no seu CEP quando você digitar.",
      "No checkout você vê as datas de entrega pro seu CEP.",
      "Lá você completa o endereço e escolhe o dia da entrega lá mesmo.",
      "Atendemos aqui pelo WhatsApp todo dia.",
      "A entrega aqui é agendada: você escolhe o dia.",
      "Quando chega aí você tem 7 dias pra trocar.",
      "Chega em Até 3 dias.",
    ]) {
      expect(verdict(texto, false), texto).toBe("pass");
    }
  });

  it("com a região respondida, ou fora do turno (sem o sinal), não se aplica", () => {
    expect(verdict("Chega sim aí em Manaus.", true)).toBe("pass");
    expect(verdict("Chega sim aí em Manaus.", undefined)).toBe("pass");
  });

  it("está no briefing, sem ensinar a frase que veta", () => {
    const linha = gateBriefing(config).find((l) => l.includes("região dela não foi consultada"));
    expect(linha).toBeDefined();
    expect(verdict(linha!, false)).toBe("pass");
  });
});
