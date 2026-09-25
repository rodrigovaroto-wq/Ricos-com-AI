import { describe, expect, it } from "vitest";
import { extractName } from "@/agent/identity.js";
import { asksAboutOrder, closesConversation, handoffFor, NEUTRAL_INTERPRETATION, type Interpretation } from "@/agent/interpret.js";

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
    expect(asksAboutOrder("obrigada, tchau")).toBe(false);
  });

  it("fechamento é reconhecido; decisão de compra não é fechamento", () => {
    for (const msg of ["tchau brigada", "Obrigada, encerro por aqui.", "ja fechei aqui valeu", "já fiz, obrigada"]) expect(closesConversation(msg), msg).toBe(true);
    for (const msg of ["quero o G", "me manda o link", "vou pensar"]) expect(closesConversation(msg), msg).toBe(false);
  });
});
