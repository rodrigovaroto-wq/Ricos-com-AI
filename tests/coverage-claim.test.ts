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

/**
 * Code review, 2026-09-24 (blocking): the loose exemptions let lies through. A condition
 * counts only attached right before the claim, and the checkout only when named before it.
 */
describe("coverage_claim: condição colada e checkout antes", () => {
  it("veta a mentira que só menciona uma condição ou o checkout em outro lugar", () => {
    for (const texto of [
      "Quando você fizer o pedido chega sim aí em Manaus",
      "Não se preocupa que chega sim aí 😊",
      "Chega sim aí e você vê o dia no checkout",
      "Chega sim aí em Manaus e o checkout confirma a data",
      "Atendemos Manaus sim",
      "A gente entrega em todo o Amazonas",
    ]) {
      expect(verdict(texto, false), texto).toBe("block");
    }
  });

  it("continua deixando passar as linhas honestas", () => {
    for (const texto of [
      "O checkout confirma se chega aí",
      "Quando chega aí você tem 7 dias",
      "Não sei ainda se chega aí",
      "O checkout confirma a entrega no seu CEP",
      "No checkout você vê as datas de entrega pro seu CEP",
      "Lá você completa o endereço e escolhe o dia da entrega lá mesmo.",
      "Atendemos aqui pelo WhatsApp todo dia.",
      "A entrega aqui é agendada: você escolhe o dia.",
      "Deixa eu ver se entrega no seu CEP.",
      "Não consigo confirmar agora se chega em Manaus.",
    ]) {
      expect(verdict(texto, false), texto).toBe("pass");
    }
  });
});

/** Code review, 2026-09-24 (terceira): "e"/"que" abrem oração nova, e "sim" nunca é desculpado. */
describe("coverage_claim: oração nova e afirmação com \"sim\"", () => {
  it("veta a promessa depois do checkout em outra oração, ou com \"sim\"", () => {
    for (const texto of [
      "É só digitar o CEP no checkout e chega aí em até 3 dias.",
      "No checkout você escolhe o dia e chega aí direitinho.",
      "Faz o pedido pelo checkout que chega aí sim",
      "Pelo checkout chega sim aí",
      "Você digita o CEP e chega sim aí em 3 dias",
      "Chegamos aí sim",
      "Entrega sim na sua região",
      "Atendemos na sua cidade sim.",
    ]) {
      expect(verdict(texto, false), texto).toBe("block");
    }
  });

  it("o checkout que confirma, e o dia da semana, continuam passando", () => {
    for (const texto of [
      "O checkout confirma a entrega no seu CEP",
      "No checkout você vê as datas de entrega pro seu CEP",
      "Digitando o CEP no checkout, ele mostra se entrega aí",
      "Assim que você digitar o CEP, o checkout confirma se entregamos aí",
      "O checkout vai te mostrar se a entrega chega no seu CEP",
      "Nossa equipe atende Segunda a Sábado.",
      "A entrega na sua região aparece no checkout.",
    ]) {
      expect(verdict(texto, false), texto).toBe("pass");
    }
  });
});
