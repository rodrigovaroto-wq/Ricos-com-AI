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

/**
 * M-01, segunda revisão (2026-09-24): a proximidade só vale quando o antecipado tem a
 * própria janela na frase e nada iguala ou estende um caminho ao outro.
 */
describe("M-01: antecipado igualado à entrega continua vetado", () => {
  const vetadas = [
    "No antecipado ou na entrega, chega em 1 a 3 dias.",
    "Pagando antecipado, igual na entrega, chega em 1 a 3 dias.",
    "No antecipado, que nem na entrega, 1 a 3 dias.",
    "Antecipado chega rápido, na entrega também, 1 a 3 dias.",
    "No antecipado é como na entrega: 1 a 3 dias.",
    "Tanto no antecipado quanto na entrega, 1 a 3 dias.",
    "Antecipado ou pagando na entrega, você recebe em 1 a 3 dias.",
    "No antecipado, nesse caso, igual ao pagamento na entrega, 1 a 3 dias.",
    "No antecipado não muda nada em relação a pagar na entrega, 1 a 3 dias.",
    "Pagando antecipado você não precisa esperar o pagamento na entrega, chega em 1 a 3 dias.",
    "Antecipado sem esperar pagar na entrega: 1 a 3 dias.",
    "No antecipado ela chega mais rápido que na entrega, em 1 a 2 dias.",
    "Na entrega é 1 a 3 dias; no antecipado também.",
    "Na entrega é de 1 a 3 dias, e no antecipado também.",
    // Com a janela própria do antecipado, a palavra que iguala ainda veta.
    "No antecipado varia por região, igual na entrega, 1 a 3 dias.",
    "Tanto no antecipado quanto na entrega varia por região, 1 a 3 dias.",
    "No antecipado varia por região, mas na entrega também, 1 a 3 dias.",
    // Segunda revisão: a palavra que iguala depois do antecipado, com o caminho nomeado por apelido.
    "No antecipado varia por região, na entrega chega em 1 a 3 dias, e pagando antes também chega em 1 a 3 dias.",
    "No antecipado varia por região, na entrega chega em 1 a 3 dias, e no Pix é igual.",
    "No antecipado o prazo varia por região, na entrega chega em 1 a 3 dias, mas na prática os dois chegam igual.",
    "No antecipado o prazo varia por região, na entrega é de 1 a 3 dias, e pagando agora é o mesmo prazo.",
    "No antecipado varia por região, na entrega 1 a 3 dias; pagando antes também.",
    "No antecipado varia por região, mas na entrega é 1 a 3 dias, e o outro também.",
    "No antecipado varia por região, mas na entrega é 1 a 3 dias, tanto um quanto o outro.",
    "No antecipado varia por região, mas hoje sai igual: na entrega, 1 a 3 dias.",
    "Antecipado varia por região, mas é o mesmo prazo, na entrega 1 a 3 dias.",
    "No antecipado varia por região, só que sai no mesmo dia que na entrega, 1 a 3 dias.",
    "No antecipado varia por região; na entrega, 1 a 3 dias; pros dois vale o mesmo.",
    "Na entrega e também pagando antes chega em 1 a 3 dias, no antecipado varia por região.",
    // Segunda revisão, segunda rodada: segunda opção de pagamento fora da lista de apelidos.
    "Na entrega ou não, chega em 1 a 3 dias; no antecipado varia por região, mas na entrega é garantido.",
    "Na entrega e na outra opção também chega em 1 a 3 dias, no antecipado o prazo varia por região.",
    "Na entrega ou no boleto, chega em 1 a 3 dias; no antecipado varia por região.",
    "Na entrega ou de qualquer outro jeito, chega em 1 a 3 dias, no antecipado varia por região.",
    "Pagando na entrega ou antes, chega em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega ou à vista, 1 a 3 dias, no antecipado varia por região.",
    "Na entrega também é 1 a 3 dias, no antecipado varia por região, igualzinho.",
    "No antecipado varia por região, na entrega chega em 1 a 3 dias, e pagando antes idem.",
    "No antecipado varia por região, na entrega chega em 1 a 3 dias, e pagando antes é igualzinho.",
  ];
  const passam = [
    "No pagamento na entrega você recebe em 1 a 3 dias, no antecipado o prazo varia por região, em média 5 dias.",
    "Na entrega chega em 1 a 3 dias; no antecipado varia, em média 5 dias.",
    "No antecipado varia, em média 5 dias; na entrega chega em 1 a 3 dias.",
    "Você escolhe: na entrega, 1 a 3 dias; antecipado, varia por região.",
    "No antecipado o prazo varia, e na entrega é de 1 a 3 dias.",
    // Code review, 2026-09-24: palavra comum longe do antecipado não iguala os caminhos.
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por região.",
    "Ou seja, na entrega você recebe em 1 a 3 dias, no antecipado varia por região.",
  ];

  it.each(vetadas)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passam)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});
