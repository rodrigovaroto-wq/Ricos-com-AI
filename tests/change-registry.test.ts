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

/** M-07, terceira revisão: recusa honesta passa; as exceções ficam presas ao número. */
describe("M-07: recusa passa, exceção presa ao número, nomes do antecipado", () => {
  const vetadas = [
    // A negação longe do número não libera a promessa.
    "No antecipado não demora, chega em 2 dias.",
    // Exceções presas ao número.
    "No antecipado você tem 2 dias pra receber.",
    "No antecipado há 2 dias de prazo.",
    "No antecipado chega em 2 dias com garantia.",
    "No antecipado chega em 2 dias ou seu dinheiro de volta.",
    "No antecipado chega em 2 dias sem troca.",
    // Outros nomes do antecipado.
    "No pix chega em 2 dias.",
    "Pagando antes, chega em 2 dias.",
    "No cartão você recebe em 2 dias.",
    "Pagando agora você recebe em 2 dias, não precisa esperar como na entrega.",
  ];
  const passam = [
    "Não consigo garantir 2 dias no antecipado: varia por região, em média 5 dias úteis.",
    "No antecipado não dá pra prometer 2 dias, o prazo varia por região, em média 5 dias úteis.",
    "Você recebe em até 3 dias e escolhe o dia no checkout, pagando em dinheiro ou cartão.",
    "Ela paga R$ 129,90 na mão do entregador quando receber em 1 a 3 dias, com 7 dias pra trocar ou devolver se precisar.",
  ];

  it.each(vetadas)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passam)("passa no caminho da entrega: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
  });

  it("a recusa honesta passa também no antecipado", () => {
    expect(delivery(passam[0]!, "prepay")?.verdict).toBe("pass");
    expect(delivery(passam[1]!, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08 (terceira revisão da M-07): prazo do antecipado em palavras que a regra de número não
 * lia — "um/uma" fora de propósito, semanas não lidas, e a chegada dita sem verbo de entrega
 * ("está aí na sua casa"). Semana conta 7 dias corridos, e nunca é a média configurada (que é
 * em dias úteis): no antecipado, "uma semana" só pode ser a garantia de 7 dias.
 */
describe("M-08: prazo do antecipado em palavras", () => {
  const vetadasNosDois = [
    "No antecipado, um dia só.",
    "No antecipado chega em uma semana.",
    "No pix chega em 1 semana.",
    "No antecipado leva duas semanas.",
    "No antecipado chega numa semana.",
    "Pagando antes, em um dia você recebe.",
    "No antecipado varia, em média uma semana.",
  ];
  const vetadasNoAntecipado = [
    "Em 2 dias ele está aí na sua casa.",
    "Em uma semana ele está na sua mão.",
    "Em 2 dias o colete é seu.",
    // A negativa que não nega.
    "Não posso negar que chega em uma semana.",
    "Não demora, em um dia tá aí.",
    "Não se preocupa, em 3 dias ele está com você.",
  ];
  const passamNosDois = [
    "Não consigo garantir uma semana no antecipado: varia por região, em média 5 dias úteis.",
    "No antecipado não dá pra prometer um dia, o prazo varia por região, em média 5 dias úteis.",
    "Na entrega você escolhe um dia marcado com o entregador.",
    "No antecipado varia, em média 5 dias úteis.",
    "No pix você tem uma semana pra trocar.",
    "No antecipado você também tem 7 dias corridos para devolver.",
    "Em uma semana de uso você já nem sente o colete.",
    "Você escolhe um dia marcado com o entregador.",
    "Ele fica lindo num dia de festa.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });

  it("o qualificador não esconde a contagem", () => {
    expect(delivery("No antecipado chega em um dia marcado, um dia só.", "prepay")?.verdict).toBe("block");
    expect(delivery("Num dia especial como o seu, em 2 dias ele está aí.", "prepay")?.verdict).toBe("block");
  });
});

/**
 * M-08, revisão independente: a faixa em semanas passava pelo "fim de faixa" (a checagem de
 * faixa só lia dias); a âncora da garantia recuava dentro de "chega" até escapar do próprio
 * lookahead; e a isenção de uso olhava a oração inteira, não o que governa a contagem.
 */
describe("M-08, revisão: semanas em faixa, âncora da garantia, uso que governa a contagem", () => {
  const vetadasNosDois = [
    "Na entrega chega em 1 a 2 semanas.",
    "No antecipado chega em 1 a 2 semanas.",
    "No pix leva de 1 a 2 semanas.",
    "Chega em 2 a 3 semanas.",
    "No antecipado chega em 1 e 2 semanas.",
    "No antecipado tem uma semana pra trocar depois que chega em uma semana.",
    "No antecipado tem uma semana pra trocar depois que chega em 7 dias.",
    "No antecipado você tem 7 dias pra trocar quando receber em uma semana.",
    "No antecipado você tem 7 dias pra trocar quando chegar em 7 dias.",
  ];
  const vetadasNoAntecipado = [
    "Em 3 dias ele está aí pra você se adaptar.",
    "Em dois dias ele tá aí pra você se acostumar com ele.",
    "Em uma semana ele está aí pra você se acostumar.",
    "Em uma semana tá na sua mão pra você adaptar a rotina.",
    "Em 3 dias de uso ele está aí.",
    "Em 2 dias você se acostuma e ele está aí.",
  ];
  const passamNosDois = [
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "Na entrega você recebe em 1 a 3 dias.",
    "Em média 2 dias de uso e você já nem sente o colete.",
    "A maioria das clientes se acostuma com o colete em cerca de 3 dias.",
    "Em uma semana de uso você já nem sente o colete.",
    "Em 2 dias você se acostuma com ele.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, segunda revisão: o lookahead da âncora só protegia a contagem logo depois do verbo
 * ("quando chegar aí em 7 dias" virava garantia), e a palavra de troca antes de ":" ou de
 * "e ele está aí" isentava a chegada; "que é quando ele chega" era apagado como âncora.
 */
describe("M-08, segunda revisão: âncora com enchimento, troca ao lado da chegada", () => {
  const vetadasNosDois = ["No antecipado você tem 7 dias pra desistir quando chegar aí em 7 dias."];
  const vetadasNoAntecipado = [
    "Tem 7 dias pra desistir a contar do dia que chegar aí em 7 dias.",
    "Tem 7 dias pra trocar a contar do dia que chegar aí em 7 dias.",
    "Você tem 7 dias pra trocar a contar do dia que chegar aí em 7 dias.",
    "Tem 7 dias pra trocar quando chegar aí em 7 dias.",
    "Pode desistir: em 7 dias ele está aí.",
    "Você tem 7 dias pra desistir e ele está aí em 7 dias.",
    "Pode desistir em uma semana, que é quando ele chega.",
    "Pode trocar: em 7 dias ele está aí.",
    "Você tem 7 dias pra trocar e ele está aí em 7 dias.",
    "Pode trocar em uma semana, que é quando ele chega.",
  ];
  const passamNosDois = [
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "Você tem uma semana pra desistir, a contar do dia que receber.",
    "No pix você tem 7 dias pra desistir, a contar do dia que receber.",
    "No pix você tem uma semana pra desistir, a contar do dia que receber.",
    "No antecipado, quando o colete chegar você tem até 7 dias pra trocar.",
    "Depois que receber, você tem 7 dias pra trocar.",
    "No antecipado a garantia é de 7 dias.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, terceira revisão: os consertos da segunda eram de sintoma. Causa: a contagem na mesma
 * oração do verbo da âncora é complemento dele (qualquer preposição); a conjunção colada à
 * contagem abre oração; a âncora depois da contagem só vale colada a ela ou ao propósito; e
 * ":" seguido de "você tem" não abre oração.
 */
describe("M-08, terceira revisão: pela causa, não pela forma", () => {
  const vetadasNoAntecipado = [
    "Tem 7 dias pra trocar quando chegar lá pra você em uns 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você em cerca de 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você em torno de 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você em mais ou menos 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você em no máximo 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você no prazo de 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você por volta de 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você com 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você depois de 7 dias.",
    "Tem 7 dias pra trocar quando chegar lá pra você após 7 dias.",
    "Tem 7 dias pra trocar quando chegar pra você poder usar em 7 dias.",
    "Tem 7 dias pra trocar quando chegar na casa que você tem em 7 dias.",
    "Tem 7 dias pra trocar quando chegar pra você trocar em 7 dias.",
    "Pode trocar e em 7 dias ele está aí.",
    "Pode trocar e daqui a 7 dias tá aí.",
    "Você tem 7 dias pra desistir e em 7 dias o colete tá em casa.",
    "Pode trocar porque em 7 dias ele tá aí.",
    "Pode trocar em uma semana, que é bem quando ele chega.",
    "Pode trocar em uma semana, que é justamente quando ele chega.",
    "Pode trocar em 7 dias, quando ele chega.",
    "Pode trocar em 7 dias, bem quando ele chega.",
    "Pode trocar em 7 dias, exatamente quando ele chega.",
    "Pode trocar em uma semana, o mesmo tempo de quando ele chega.",
  ];
  const passamNosDois = [
    "Se não servir, é só trocar: você tem 7 dias depois que ele chegar.",
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "No pix você tem 7 dias pra desistir, a contar do dia que receber.",
    "A garantia é a mesma: 7 dias.",
    "Se não servir, você pode trocar em até 7 dias depois que receber.",
    "Pode trocar ou devolver em até 7 dias, e o frete da troca é por nossa conta.",
    "Você pode trocar em 7 dias e ele fica guardado com você.",
    "No antecipado, quando o colete chegar você tem até 7 dias pra trocar.",
    "Depois que receber, você tem 7 dias pra trocar.",
  ];

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, quarta revisão: quatro rodadas fechando formas enquanto as irmãs ficavam abertas. O ônus
 * foi invertido: a contagem da garantia só é isenta quando uma forma de garantia a governa, e o
 * que vem depois dela é fim de frase, "corridos/úteis", o propósito ou a âncora de início.
 */
describe("M-08, quarta revisão: a garantia governa a contagem, ou é prazo", () => {
  const vetadasNosDois = ["No pix pode trocar, e o prazo até quando chegar é de 7 dias."];
  const vetadasNoAntecipado = [
    "Pode trocar, o prazo até quando chegar é de 7 dias.",
    "Pode devolver, e o tempo até quando chegar é de 7 dias.",
    "Pode trocar depois que chegar, são 7 dias de viagem.",
    "Pode trocar depois que chegar são 7 dias de viagem.",
    "Pode trocar, e quando o colete chegar é de 7 dias.",
    "Tem garantia de troca quando chegar e são 7 dias até lá.",
    "Pode trocar quando chegar é 7 dias.",
    "Pode trocar e em até 7 dias ele está aí.",
    "Pode trocar e em até uma semana ele está aí.",
    "Pode trocar e numa semana ele está aí.",
    "Pode trocar e em uns 7 dias ele tá aí.",
    "Pode trocar e em média 7 dias ele está aí.",
    "Pode trocar e com 7 dias ele tá aí.",
    "Pode trocar e 7 dias depois ele tá aí.",
    "Pode trocar porque em uns 7 dias ele tá aí.",
    "Pode trocar mas uns 7 dias ele tá aí.",
    "O prazo até quando chegar é de 7 dias pra trocar.",
  ];
  const passamNosDois = [
    "A troca é em 7 dias.",
    "A troca é em 7 dias corridos.",
    "Você tem 7 dias pra trocar, contados de quando ele chegar.",
    "Você tem 7 dias pra trocar, contados a partir de quando receber.",
    "Você tem 7 dias pra trocar, a contar de quando receber.",
    "Você tem 7 dias pra trocar, quando receber.",
    "Depois que receber são 7 dias pra trocar.",
    "Quando o colete chegar você tem até 7 dias pra trocar.",
    "Depois que o colete chegar, a troca é em até 7 dias.",
    "A garantia é a mesma: 7 dias.",
    "Você tem 7 dias pra trocar, a partir do recebimento.",
    "Pode trocar em até 7 dias, contados do recebimento.",
    "Tem 7 dias de garantia a partir do recebimento.",
    "São 7 dias de arrependimento depois que chega.",
    "Você tem uma semana pra trocar depois que recebe.",
    "Se não servir, é só trocar: você tem 7 dias depois que ele chegar.",
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "No pix você tem 7 dias pra desistir, a contar do dia que receber.",
    "Quando chega aí você tem 7 dias pra trocar.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, quinta revisão (aprovada com ressalvas): falsos positivos em frases honestas — as
 * falas do roteiro com "contando do dia que receber", a troca com objeto ou adjetivo ("pra
 * trocar de tamanho", "a troca é grátis em até 7 dias"), "a garantia de 7 dias vale" — e a
 * chegada em palavras depois da garantia ("e ele está com você", "e o colete é seu").
 */
describe("M-08, quinta revisão: falas honestas passam", () => {
  const passamNosDois = [
    "Você tem 7 dias pra trocar ou devolver contando do dia que receber.",
    "A gente troca ou devolve, sem drama, você tem 7 dias contando do dia que receber.",
    "Você tem 7 dias contando de quando recebeu.",
    "Você tem 7 dias pra trocar, contando da data em que você recebe.",
    "São 7 dias de garantia, contados da entrega.",
    "Tem 7 dias pra trocar a partir do dia que receber.",
    "Você tem 7 dias pra trocar de tamanho.",
    "Você tem 7 dias pra trocar o tamanho.",
    "Você tem 7 dias pra trocar por outro tamanho.",
    "Você tem 7 dias pra devolver o produto.",
    "Pode trocar o tamanho em até 7 dias.",
    "Você pode trocar de tamanho em até 7 dias.",
    "Se o tamanho não servir, a troca é grátis em até 7 dias.",
    "A troca é gratuita em até 7 dias.",
    "A garantia de 7 dias vale nos dois.",
    "No antecipado, a garantia é igual: 7 dias.",
    "A garantia de 7 dias vale também no antecipado.",
    "Você tem 7 dias pra pedir a troca.",
  ];
  const vetadasNoAntecipado = [
    "Pode trocar em 7 dias, e ele está com você.",
    "Pode trocar em 7 dias, e o colete é seu.",
    "Pode trocar em 7 dias, que você já abre a caixa.",
    "A garantia é de 7 dias, ou seja, você já tem ele.",
    "Pode trocar em até uma semana e ele tá contigo.",
    "Pagando no pix, 7 dias de garantia e ele é seu.",
    "A troca é em uma semana, e o colete tá contigo.",
    "A garantia de 7 dias vale até chegar.",
    "Pode trocar em 7 dias; e ele chega junto.",
  ];

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });
});

/**
 * M-08, sexta revisão: dois afrouxamentos reais da quinta. "Você tem N" + início da contagem só é
 * garantia com ela recebendo ("contando de quando recebeu"); "são 7 dias depois que recebermos" e
 * "o prazo é de 7 dias a partir do recebimento" são prazo. E depois de ";" tudo é julgado — só a
 * locução do roteiro "do pedido até a entrega" sai antes.
 */
describe("M-08, sexta revisão: sem troca não há garantia; depois de ';' tudo é julgado", () => {
  const vetadasNosDois = [
    "No pix, são 7 dias depois que recebermos.",
    "No pix são 7 dias úteis depois que recebermos.",
    "No pix, são 7 dias a partir do recebimento.",
    "No pix o prazo é de 7 dias, contados a partir do recebimento.",
    "No antecipado, o prazo é de 7 dias a partir de quando recebermos.",
    "No antecipado são 7 dias depois do recebimento.",
    "No pix você tem 7 dias pra trocar; a entrega também.",
  ];
  const vetadasNoAntecipado = [
    // O nome do antecipado na frase anterior ("Pagou no pix?") não é lido no caminho da entrega —
    // família anterior à M-08, fora deste conserto.
    "Pagou no pix? São 7 dias contados da data que recebermos.",
    "Pode trocar em 7 dias; a entrega também.",
    "Você tem 7 dias pra trocar; a entrega é igual.",
    "Você tem 7 dias pra trocar; é o mesmo prazo da entrega.",
    "Você tem 7 dias pra trocar; o frete é no mesmo prazo.",
    "Você tem 7 dias pra trocar; a transportadora faz no mesmo prazo.",
    "Você tem 7 dias pra trocar; a entrega segue o mesmo prazo.",
    "Você tem 7 dias pra trocar; é o prazo da transportadora também.",
    "Pode trocar em 7 dias; o correio faz igual.",
    "Pode trocar em 7 dias; e ele vem nesse tempo.",
    "Pode trocar em 7 dias; ele aparece aí nesse prazo.",
    "Pode trocar em 7 dias; nesse prazo ele bate na sua porta.",
    "Pode trocar em 7 dias; nesse tempo ele tá na sua casa.",
    "Pode trocar em 7 dias; que é o tempo da viagem.",
  ];
  const passamNosDois = [
    "Eu sei que pagar antes muda a conversa, então deixa eu te dar as garantias: a compra é feita no ambiente da Coinzz, com nota; você tem 7 dias pra trocar ou devolver contando do dia que receber; e eu fico aqui no WhatsApp com você do pedido até a entrega, pode me cobrar.",
    "Você tem 7 dias contando de quando recebeu.",
    "Você tem 7 dias pra trocar, contando da data em que você recebe.",
    "São 7 dias de garantia, contados da entrega.",
    "Tem 7 dias pra trocar a partir do dia que receber.",
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "No pix você tem 7 dias pra desistir, a contar do dia que receber.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, sétima revisão: "do pedido até a entrega" saía da cauda em qualquer lugar (só a fala do
 * roteiro, com o sujeito dela, sai); "o prazo pra trocar é de 7 dias" era vetada; e a presença com
 * "aqui/aí" no meio ("tá aqui com você") não era lida.
 */
describe("M-08, sétima revisão", () => {
  const vetadasNosDois = [
    "No pix, você tem 7 dias pra trocar do pedido até a entrega.",
    "No pix, pode trocar em 7 dias, do pedido até a entrega.",
    "No pix o prazo é de 7 dias, contados a partir do recebimento.",
  ];
  const vetadasNoAntecipado = [
    "Pode trocar em 7 dias do pedido até a entrega.",
    "Você tem 7 dias pra trocar, e eu te acompanho do pedido até a entrega, que é rapidinha.",
    "Pode trocar, o prazo até quando chegar é de 7 dias.",
    "Pode trocar em 7 dias, e ele tá aqui com você.",
  ];
  const passamNosDois = [
    "O prazo pra trocar é de 7 dias.",
    "O prazo pra devolver é de 7 dias.",
    "Seu prazo pra desistir é de 7 dias.",
    "Pra trocar, o prazo é de 7 dias.",
    "O prazo pra trocar ou devolver é de 7 dias depois que receber.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(vetadasNoAntecipado)("veta no antecipado: %s", (texto) => {
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});

/**
 * M-08, oitava revisão: "o prazo é 7 dias" depois de qualquer palavra de troca, em outra oração,
 * era tomado pela garantia ("a troca é fácil, e o prazo é 7 dias"). A troca só toma a contagem
 * quando a governa: "o prazo pra trocar é de", "pra trocar, o prazo é de", "se precisar trocar,
 * são", "é só trocar: você tem".
 */
describe("M-08, oitava revisão: a troca governa a contagem, ou não a toma", () => {
  const vetadasNosDois = [
    "No antecipado a troca é fácil, e o prazo é 7 dias.",
    "No pix a troca é fácil, e o prazo é 7 dias.",
    "No antecipado pode trocar, e o prazo é 7 dias.",
    "No antecipado tem troca, e o prazo é 7 dias.",
    "No antecipado tem garantia, e o prazo é 7 dias.",
    "No antecipado a troca é fácil, e o prazo é de 7 dias.",
    "No antecipado a troca é simples e o prazo é 7 dias.",
    "Pagando antes a devolução é fácil, e o prazo é de uma semana.",
    "No antecipado a troca é grátis e o prazo fica 7 dias.",
    "No antecipado a troca é fácil, e o prazo são 7 dias.",
    "No pix, com garantia, o prazo é de 7 dias.",
    "No pix tem troca grátis e o prazo é de 7 dias.",
    "No pix tem garantia e são 7 dias.",
    "Pagando antes, tem garantia, e fica 7 dias.",
    "No pix, pode trocar; o prazo é de 7 dias.",
    "No pix, troca garantida, o prazo é de uma semana.",
    "No antecipado com garantia, é uma semana.",
    "Pagando no pix, com direito a troca, são 7 dias.",
    // Nona revisão: o "se" não atravessa verbo de chegada até a troca.
    "No pix, se precisar receber e trocar, são 7 dias.",
    "No antecipado, se precisar receber e trocar, são 7 dias.",
  ];
  const passamNosDois = [
    "O prazo pra trocar é de 7 dias.",
    "O prazo pra devolver é de 7 dias.",
    "Seu prazo pra desistir é de 7 dias.",
    "Pra trocar, o prazo é de 7 dias.",
    "O prazo pra trocar ou devolver é de 7 dias depois que receber.",
    "A garantia é a mesma: 7 dias.",
    "A troca é em 7 dias.",
    "No pix, se precisar trocar, são 7 dias a partir de quando você receber.",
    "Se não servir, é só trocar: você tem 7 dias depois que ele chegar.",
    "Se precisar trocar, são 7 dias.",
    "Se quiser devolver, você tem 7 dias.",
    "Se não servir, você tem 7 dias pra trocar.",
    "Você tem 7 dias pra desistir, a contar do dia que receber.",
    "No pix você tem 7 dias pra desistir, a contar do dia que receber.",
  ];

  it.each(vetadasNosDois)("veta nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("block");
    expect(delivery(texto, "prepay")?.verdict).toBe("block");
  });

  it.each(passamNosDois)("passa nos dois caminhos: %s", (texto) => {
    expect(delivery(texto, "cod")?.verdict).toBe("pass");
    expect(delivery(texto, "prepay")?.verdict).toBe("pass");
  });
});
