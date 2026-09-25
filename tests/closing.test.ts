import { describe, expect, it } from "vitest";
import { extractName } from "@/agent/identity.js";
import { closesConversation, handoffFor, NEUTRAL_INTERPRETATION, reportsDone, type Interpretation } from "@/agent/interpret.js";

/** Rodada de personas de 2026-09-25: despedida depois da compra. */
describe("despedida depois do link", () => {
  it("despedida não vira nome", () => {
    for (const msg of ["tchau brigada", "valeu tchau", "ja fechei aqui valeu", "brigada tchauzinho"]) expect(extractName(msg), msg).toBeNull();
    // Negação: nome de verdade continua lido.
    expect(extractName("Maria Souza")).toBe("Maria Souza");
    expect(extractName("meu nome é Ana Lima")).toBe("Ana Lima");
  });

  it("'já finalizei' não passa para uma pessoa; pergunta sobre o pedido passa", () => {
    const postSale = { ...NEUTRAL_INTERPRETATION, post_sale: true } as Interpretation;
    expect(handoffFor(postSale, "Obrigada, já finalizei. Encerro por aqui.", true)).toBeNull();
    expect(handoffFor(postSale, "já fiz o pedido, obrigada", true)).toBeNull();
    for (const msg of ["cadê meu pedido", "quando chega?", "meu pedido não chegou", "quero trocar o tamanho"])
      expect(handoffFor(postSale, msg, true), msg).toBe("post_sale");
    expect(reportsDone("obrigada, tchau")).toBe(true);
    for (const msg of ["Obrigada, já finalizei. Encerro por aqui.", "já fiz, obrigada", "tchau brigada", "chegou certinho, amei, obrigada"])
      expect(reportsDone(msg), msg).toBe(true);
    // Sétima revisão: todo problema real de pedido continua indo para uma pessoa.
    for (const msg of [
      "ficou pequeno", "ficou apertado", "não serviu", "ficou grande demais", "veio o tamanho G e eu pedi M", "quero outro tamanho",
      "o entregador não apareceu", "o motoboy não passou", "não vou estar em casa amanhã", "remarca a entrega pra sexta",
      "quero mudar o endereço", "me cobraram frete", "cobraram a mais", "paguei duas vezes", "o pix não caiu",
      "a caixa veio aberta", "veio rasgado", "o zíper quebrou", "até agora nada", "e o meu pedido", "já faz 10 dias",
      "obrigada, mas veio errado", "valeu, mas ficou apertado",
      // Oitava revisão: a reclamação vem depois do obrigada.
      "obrigada mas o tamanho", "valeu, veio certinho só que a cor", "obrigada, mas veio o M", "obrigada, mas ficou largo",
      "obrigada, veio faltando uma peça", "valeu, mas só veio uma", "obrigada, recebi só 1 das 2", "obrigada, a peça veio manchada",
      "obrigada, chegou o de outra pessoa", "obrigada, vou mandar de volta", "obrigada, fiz o pedido 2 vezes sem querer",
    ])
      expect(handoffFor(postSale, msg, true), msg).toBe("post_sale");
  });

  it("fechamento é reconhecido; decisão de compra não é fechamento", () => {
    for (const msg of ["tchau brigada", "Obrigada, encerro por aqui.", "ja fechei aqui valeu", "já fiz, obrigada"]) expect(closesConversation(msg), msg).toBe(true);
    for (const msg of ["quero o G", "me manda o link", "vou pensar"]) expect(closesConversation(msg), msg).toBe(false);
  });
});
