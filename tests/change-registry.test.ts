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
    // Terceira rodada: outra opção fora da lista, prazo para todos, e sinônimo do antecipado depois da entrega.
    "Na entrega e via transferência também chega em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega e online também chega em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega e com crédito também chega em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega também chega em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega você também escolhe o dia, no antecipado varia por região; quem paga na entrega recebe em 1 a 3 dias, pagando antes 2 a 3 dias.",
    "Na entrega você também escolhe o dia, no antecipado varia por região; na entrega são 1 a 3 dias, e no Pix 2 a 3 dias.",
    "Na entrega também dá, e todo mundo recebe em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega também, recebendo em 1 a 3 dias qualquer pagamento, no antecipado varia por região.",
    "Na entrega você também recebe em 1 a 3 dias, independente do pagamento; no antecipado varia por região.",
    "No antecipado varia por região; na entrega são 1 a 3 dias, e no Pix 2 a 3 dias.",
    // Quarta rodada.
    "Na entrega você também pode receber em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega também pode chegar em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega e via débito você também pode receber em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega e via link você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega você também marca o dia, e no final é 1 a 3 dias pra todas, no antecipado varia por região.",
    "No antecipado varia por região, ou seja, na entrega e antes chega em 1 a 3 dias.",
    "No antecipado varia por região, ou seja, na entrega chega em 1 a 3 dias, e no débito 2 a 3 dias.",
    "No antecipado varia por região, mas na entrega chega em 1 a 3 dias, e no débito 2 a 3 dias.",
    "No antecipado varia por região, mas na entrega chega em 1 a 3 dias, e via link 2 a 3 dias.",
    "No antecipado varia por região, mas na entrega chega em 1 a 3 dias e pra todas as clientes é assim.",
    // Quinta rodada: a exceção do "também escolhe" só vale se a frase termina na janela do antecipado.
    "Na entrega você também escolhe o dia, no antecipado varia por região; na entrega são 1 a 3 dias, e quem paga na compra 2 a 3 dias.",
    "Na entrega você também escolhe o dia, no antecipado varia por região; na entrega são 1 a 3 dias, e no depósito 2 a 3 dias.",
    "Na entrega você também escolhe o dia, no antecipado varia por região; na entrega são 1 a 3 dias, e no pré-pago 2 a 3 dias.",
    "Na entrega você também escolhe o dia, no antecipado varia por região; na entrega são 1 a 3 dias, e pelo site 2 a 3 dias.",
    "Na entrega você também marca o dia e em 1 a 3 dias chega, no antecipado varia por região, mas chega junto.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por região e chega junto.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região e costuma bater com esse prazo.",
    // Sexta rodada: depois da janela do antecipado, só pontuação.
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, nada muda.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, é parecido.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, mas é parecido.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, mas na prática é idêntico.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, mas é praticamente isso.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado varia por região, só que não.",
    "Na entrega você também escolhe o dia, e todo pedido chega em 1 a 3 dias, no antecipado o prazo varia por região.",
  ];
  const passam = [
    "No pagamento na entrega você recebe em 1 a 3 dias, no antecipado o prazo varia por região, em média 5 dias.",
    "Na entrega chega em 1 a 3 dias; no antecipado varia, em média 5 dias.",
    "No antecipado varia, em média 5 dias; na entrega chega em 1 a 3 dias.",
    "Você escolhe: na entrega, 1 a 3 dias; antecipado, varia por região.",
    "No antecipado o prazo varia, e na entrega é de 1 a 3 dias.",
    // Code review, 2026-09-24: palavra comum longe do antecipado não iguala os caminhos.
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por região.",
    "Na entrega você também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por região, em média 5 dias úteis.",
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

/**
 * M-05 (rodada 5, Jussara): "tiro mais alguma dúvida" é a pergunta de fechamento, e o gate
 * lia "tiro … mais" como concessão de preço → três vetos → resposta pronta.
 */
describe("M-05: tirar dúvida não é desconto", () => {
  const price = (text: string) => runGates(text, ctx()).traces.find((t) => t.gate === "price_promise");

  it("a pergunta de fechamento passa", () => {
    for (const honest of [
      "Quer que eu siga com seu pedido pra pagar na entrega ou tiro mais alguma dúvida antes?",
      "Posso seguir com o pedido, ou tiro mais uma dúvida sua?",
      "Tiro pra você qualquer dúvida sobre o tamanho.",
      "Se quiser, tiro mais suas dúvidas antes de fechar.",
      "Tiro mais alguma das suas dúvidas?",
      "Tiro mais uma dúvidinha sua?",
      "Tiro mais uma dúvida, ou fechamos?",
      "Tiro mais alguma dúvida ou já posso seguir com o pedido?",
    ]) {
      expect(price(honest)?.verdict, honest).toBe("pass");
    }
  });

  it("a concessão sem número continua vetada, mesmo ao lado da dúvida", () => {
    for (const lie of [
      "Tiro mais um pouquinho pra você fechar.",
      "Eu tiro mais pra você, sem dúvida.",
      "Tiro mais alguma dúvida e tiro mais um pouco do valor.",
      "Tiro pra você um pouco, dúvida nenhuma.",
      "Tiro mais do preço se tirar sua dúvida.",
      // Segunda revisão: o verbo serve a um segundo objeto, e a negação distante.
      "Tiro qualquer dúvida e mais um pouco do preço.",
      "Tiro suas dúvidas e mais um pouco do valor.",
      "Tiro mais uma dúvida e um pouco do valor, fechado?",
      "Tiro pra você a dúvida e mais um pouquinho no preço.",
      "Tiro essa dúvida e pra você faço por menos.",
      "Tiro sua dúvida, mais um pouco do valor.",
      "Não se preocupe com nada, tiro qualquer dúvida e tiro mais um pouco pra você.",
      "Tiro a dúvida pra você e um pouco do valor.",
      "Tiro sua dúvida pra você e um pouquinho do preço.",
      "Tiro sua duvidinha, pra você um pouco mais barato.",
      "Tiro sua dúvida: pra você, um pouquinho a menos.",
      "Tiro sua dúvida, pra você sai por menos.",
      // Quarta rodada: outra pontuação ou conectivo entre a dúvida e a concessão.
      "Tiro sua dúvida – pra você um pouquinho.",
      "Tiro sua dúvida (pra você um pouquinho).",
      'Tiro sua dúvida "pra você" um pouquinho.',
      "Tiro sua dúvida, ainda mais um pouco do valor.",
      "Tiro sua dúvida, até mais um pouquinho.",
      "Tiro sua dúvida, um pouquinho do valor também.",
      // "pouc\w+" não casava "pouquinho": o exemplo do próprio briefing passava.
      "Eu tiro um pouquinho.",
      "Abato um pouquinho no valor.",
    ]) {
      expect(price(lie)?.verdict, lie).toBe("block");
    }
  });
});

/**
 * M-06 (segunda revisão do ajuste de M-01): sem "também", a proximidade dava a faixa à
 * entrega sempre que "na entrega" era o último caminho citado — e um nome do antecipado
 * fora da lista, ou uma igualdade no fim da frase, escapava.
 */
describe("M-06: depois da faixa da entrega, só a janela do antecipado", () => {
  const vetadas = [
    "No antecipado varia por região; na entrega são 1 a 3 dias, e no depósito 2 a 3 dias.",
    "No antecipado varia por região; na entrega são 1 a 3 dias, e quem paga na compra 2 a 3 dias.",
    "No antecipado varia por região; na entrega são 1 a 3 dias, e no pré-pago 2 a 3 dias.",
    "No antecipado varia por região; na entrega são 1 a 3 dias, e pelo site 2 a 3 dias.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado varia por região, nada muda.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado varia por região, é parecido.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado o prazo varia por região e chega junto.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado varia por região e costuma bater com esse prazo.",
    "No antecipado o prazo varia, e na entrega é de 1 a 3 dias, dá na mesma.",
    // Segunda revisão: as palavras novas na lista permitida não abrem espaço para faixa nem igualdade.
    "Na entrega você recebe em 1 a 3 dias úteis, e no pagamento antecipado também.",
    "Na entrega você recebe em 1 a 3 dias, já no antecipado 2 a 3 dias.",
    "Na entrega você recebe em 1 a 3 dias, enquanto no pagamento antecipado é o mesmo.",
    "Na entrega você recebe em 1 a 3 dias úteis, no antecipado depende da região, mas chega junto.",
    "Na entrega você recebe em 1 a 3 dias (no antecipado também).",
    "Na entrega você recebe em 1 a 3 dias, no antecipado conforme a região, 2 a 3 dias.",
  ];
  const passam = [
    "Na entrega você recebe em 1 a 3 dias, no antecipado varia por região.",
    "Na entrega você recebe em 1 a 3 dias, e no antecipado o prazo varia por região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, mas no antecipado varia por região.",
    "No antecipado varia por região; na entrega são 1 a 3 dias.",
    // Segunda revisão: a mesma janela nas palavras do modelo.
    "Na entrega você recebe em 1 a 3 dias úteis, e no antecipado o prazo varia por região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, e no pagamento antecipado o prazo varia por região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado o prazo varia por região (em média 5 dias úteis).",
    "Na entrega você recebe em 1 a 3 dias, já no antecipado o prazo varia por região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, enquanto no antecipado o prazo varia por região.",
    "Na entrega você recebe em 1 a 3 dias, e pagando antecipado o prazo varia conforme a região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado o prazo varia de acordo com a região, em média 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado o prazo depende da região, em média 5 dias úteis.",
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

/**
 * M-07 (segunda revisão da M-06): (1) nome do antecipado ligado à entrega antes da faixa;
 * (2) média do antecipado sem "úteis" não era conferida; (3) depois da faixa, o antecipado
 * sem janela própria lê como "a mesma faixa lá".
 */
describe("M-07: a faixa e a média pertencem ao caminho certo", () => {
  const vetadas = [
    // (1)
    "No antecipado varia por região, e no pix e na entrega, 1 a 3 dias.",
    "No antecipado o prazo varia por região; no cartão e na entrega, 1 a 3 dias.",
    "No antecipado varia por região, mas pagando antes e na entrega, 1 a 3 dias.",
    "No antecipado, e na entrega, em 1 a 3 dias; o prazo varia por região.",
    "Antecipado varia por região, adiantado e na entrega, 1 a 3 dias.",
    "No antecipado varia por região, no antecipado e na entrega chega em 1 a 3 dias.",
    // (2)
    "Na entrega chega em 1 a 3 dias, e no antecipado o prazo varia em média 1 dias.",
    "No antecipado o prazo varia, em média 2 dias.",
    "No antecipado varia, cerca de 3 dias.",
    // (3)
    "No antecipado o prazo varia por região; na entrega chega em 1 a 3 dias e no pagamento antecipado.",
    "Na entrega chega em 1 a 3 dias, e no antecipado.",
  ];
  const passam = [
    "No antecipado varia, em média 5 dias; na entrega chega em 1 a 3 dias.",
    "No antecipado o prazo varia por região, em média 5 dias; na entrega é de 1 a 3 dias.",
    "No antecipado o prazo varia, em média 5 dias.",
    "Na entrega chega em 1 a 3 dias, e no pagamento antecipado, variando por região.",
    "Pagando na entrega, você recebe em 1 a 3 dias; pagando antecipado, o prazo varia por região, em média 5 dias úteis.",
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

/**
 * M-07, segunda revisão: a média era lida por lista de formatos, e cada formato novo
 * escapava. Regra única: em frase do antecipado, todo número de dias fora da faixa da
 * entrega é a média configurada (5 no fixture).
 */
describe("M-07: todo número de dias do antecipado é a média configurada", () => {
  const vetadas = [
    "No antecipado são 2 dias em média.",
    "No antecipado a média é de 2 dias.",
    "No antecipado, média: 2 dias.",
    "No antecipado varia, em média uns 2 dias.",
    "No antecipado varia, em média 2,5 dias.",
    "No antecipado varia, em média dois dias úteis.",
    "No antecipado, uns 3 dias.",
    "No antecipado leva por volta de 2 dias.",
    "No antecipado chega em até 2 dias.",
    "No antecipado varia, mais ou menos 2 dias.",
    "No antecipado varia, geralmente 2 dias.",
    "No antecipado varia em média 5 dias úteis, mas pra sua região 2 dias.",
  ];
  const passam = [
    "No antecipado o prazo varia conforme a região, cerca de 5 dias úteis, e na entrega 1 a 3 dias.",
    "No antecipado varia por região, em torno de 5 dias úteis, e na entrega 1 a 3 dias.",
    "No antecipado varia, média de 5 dias, e na entrega 1 a 3 dias.",
    "No antecipado depende do seu CEP, em média 5 dias úteis; na entrega você recebe em 1 a 3 dias.",
    "No antecipado o prazo varia de acordo com a sua região, em média 5 dias úteis, e na entrega de 1 a 3 dias.",
    "Na entrega você recebe em 1 a 3 dias, no antecipado varia, em torno de 5 dias úteis.",
    "Na entrega você recebe em 1 a 3 dias; no antecipado o prazo varia bastante por região, em média 5 dias úteis.",
    "No antecipado você também tem 7 dias de garantia.",
    // Número de dias que não é prazo de entrega não é média do antecipado.
    "Em média 2 dias de uso e você já nem sente o colete.",
    "A maioria das clientes se acostuma com o colete em cerca de 3 dias.",
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
