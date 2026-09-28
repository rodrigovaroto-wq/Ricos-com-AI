import { describe, expect, it } from "vitest";
import { classifyOptOut } from "../src/agent/guardrails.js";

/**
 * Found 2026-09-28 by the opt-in review (docs/agente-ia/05-plano/07-opt-in-marketing.md):
 * `silence_3` promises "é só me falar que eu não te mando mais nada", so the way she answers
 * it has to stop the agent. These plain requests to stop read as "none" until the same day:
 * the list fixed the word order ("não quero mais receber", never "não quero receber mais") and
 * read messages but not the offers in them (grafo §26).
 *
 * A text heuristic: the negation controls below must keep reading "none"
 * (`.claude/memory/negation-blindness.md`) — both ways, the refusal that is not one and the
 * purchase question that mentions a message or a promotion.
 */
describe("opt-out: pedidos de parar", () => {
  it.each([
    "não quero mais promoção",
    "não quero receber mais mensagens",
    "chega de mensagem",
    "para com isso",
    "Para com isso, por favor!",
    "não quero mais ofertas",
    "não quero receber mensagem",
    "não quero receber nenhuma mensagem",
    "chega de tanta mensagem",
    "chega de propaganda",
  ])("%s para a agente", (text) => {
    expect(classifyOptOut(text)).toBe("explicit");
  });

  it.each([
    "não quero mais o M, quero o G",
    "não quero mais esperar, fecha o pedido",
    "chega de dúvida, vou levar",
    // A negative that does not refuse.
    "não quero parar de receber",
    "não para de mandar oferta boa não",
    "não para com isso",
    "não quero perder a promoção",
    "não quero receber o colete em casa",
    // Refusing the offers to buy is not refusing the messages.
    "não quero mais oferta, quero fechar",
    "chega de promoção, quero comprar agora",
    // Purchase questions that mention a message or a promotion.
    "tem promoção?",
    "me manda mensagem amanhã",
    "não recebi a mensagem",
    "a mensagem chega de manhã?",
    "essa promoção chega de quando?",
    "não quero mais pagar caro, tem promoção?",
  ])("controle de negação: %s continua none", (text) => {
    expect(classifyOptOut(text)).toBe("none");
  });
});
