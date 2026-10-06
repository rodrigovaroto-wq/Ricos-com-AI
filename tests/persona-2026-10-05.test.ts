import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/** Rodada de personas 2026-10-05, porta local, `agent_version` 2. */
const verdict = (gate: string, text: string) => runGates(text, ctx()).traces.find((t) => t.gate === gate)?.verdict;
const FREE = "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.";

describe("shipping_promise: a frase do frete grátis ao lado de quem nega pagar antes", () => {
  it("Jussara: \"isso mesmo\" é concordância e \"não paga nada antes/adiantado\" fala da entrega", () => {
    for (const texto of [
      `Isso mesmo, você não paga nada antes, só quando o colete chegar na sua mão, tá?\n\n${FREE}`,
      `É isso mesmo, você paga só quando receber.\n\n${FREE}`,
      `Você não paga nada adiantado.\n\n${FREE}`,
      `Você não precisa pagar nada antes, só ao entregador.\n\n${FREE}`,
    ]) {
      expect(verdict("shipping_promise", texto), texto).toBe("pass");
    }
  });

  it("estender o grátis a outro pagamento continua vetado", () => {
    for (const texto of [
      `${FREE}\n\nNo pix também.`,
      `${FREE}\n\nIsso mesmo, no pix também é grátis.`,
      `${FREE}\n\nPagando antes é o mesmo.`,
      `Você não paga nada adiantado, e no pix o frete também é grátis.`,
      `${FREE}\n\nSe pagar adiantado também.`,
      // A terceira frase do texto da Jussara: "é o mesmo" ao lado de "checkout" tem a forma exata de
      // "no checkout é o mesmo (grátis)". Fica vetada de propósito — a reescrita tira só ela.
      `Isso mesmo, você não paga nada antes, só quando o colete chegar na sua mão, tá?\n\n${FREE}\n\nPra Fortaleza o valor é o mesmo, e o checkout confirma quando você digita o CEP se a entrega chega aí, quer seguir?`,
    ]) {
      expect(verdict("shipping_promise", texto), texto).toBe("block");
    }
  });
});

describe("unverified_size: \"guardando seu M\" é reserva", () => {
  it("Karol: dizer que está guardando o tamanho, antes de conferir nada", () => {
    for (const texto of ["Que bom te ver de volta, tava guardando seu M aqui.", "Já guardei o G pra sua mãe.", "O M tá guardado pra você."]) {
      expect(verdict("unverified_size", texto), texto).toBe("block");
    }
  });

  it("indicar o tamanho continua livre", () => {
    for (const texto of ["Pelo que você contou o seu é M mesmo.", "Pra sua mãe então é G, que acomoda bem.", "Guarda essa dica: o M veste justinho."]) {
      expect(verdict("unverified_size", texto), texto).not.toBe("block");
    }
  });
});
