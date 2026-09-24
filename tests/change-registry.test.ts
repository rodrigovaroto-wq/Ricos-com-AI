import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import { config, ctx } from "./fixtures.js";

const delivery = (text: string, paymentPath: "cod" | "prepay" = "cod") =>
  runGates(text, ctx({ paymentPath, regionKnown: false })).traces.find((t) => t.gate === "delivery_promise");

/**
 * M-01 (rodada 4, Cleide): a frase que nomeia os dois caminhos era julgada toda como
 * antecipado, e o "1 a 3 dias" da entrega virava veto três vezes → resposta pronta.
 */
describe("M-01: a faixa pertence ao caminho nomeado mais perto dela", () => {
  it("a frase de comparação da Cleide passa", () => {
    const cleide =
      "Sobre chegar aí pagando na entrega, quem confirma é o checkout quando você digita seu CEP, e no " +
      "pagamento na entrega você escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por " +
      "região, em média 5 dias úteis";
    expect(delivery(cleide)?.verdict).toBe("pass");
    expect(delivery(cleide, "prepay")?.verdict).toBe("pass");
    expect(delivery("Na entrega chega em 1 a 3 dias, e no antecipado varia, em média 5 dias úteis.")?.verdict).toBe("pass");
  });

  it("faixa no antecipado continua vetada, mesmo com a entrega citada antes", () => {
    expect(delivery("No antecipado chega em 1 a 3 dias.")?.verdict).toBe("block");
    expect(delivery("Na entrega é rapidinho, e no antecipado chega em 2 a 4 dias.")?.verdict).toBe("block");
    expect(delivery("Na entrega chega em 1 a 5 dias.")?.verdict).toBe("block");
  });
});

/** M-04: o prompt pergunta o tamanho no interesse de compra, e manda o link antes da identidade. */
describe("M-04: pergunta do tamanho e link antes da identidade", () => {
  const prompt = systemPrompt(config, [], null).replace(/\s+/g, " ");

  it("ensina a não emendar a pergunta do tamanho em toda resposta de preço", () => {
    expect(prompt).toContain("Pergunte o tamanho quando ela mostrar interesse em comprar");
    expect(prompt).toContain("não emende a pergunta do tamanho em toda mensagem");
  });

  it("ensina o link antes de nome, e-mail e CPF quando ela já quer comprar", () => {
    expect(prompt).toContain("mande o link e NÃO peça nome, e-mail nem CPF antes");
    expect(prompt).toContain("o link primeiro, nunca o CPF primeiro");
    // O fluxo antigo continua para quando o link ainda não pode sair.
    expect(prompt).toContain("Nunca repita a mesma pergunta com as mesmas palavras.");
  });
});
