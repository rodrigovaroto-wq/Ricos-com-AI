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
    // Courtesy or a complaint around the refusal is still only the refusal (2026-09-29, grafo §31).
    "Não quero mais ofertas, obrigada",
    "Não quero receber mais mensagens de vocês, que saco",
    "Chega de mensagem, que chato!",
    // "Não para de mandar" is the complaint, as it read until 2026-09-28.
    "Vocês não para de mandar mensagem, que saco",
    "Não para de me mandar mensagem, que chato!",
    "Essa loja não para de mandar mensagem",
    "Vocês não param de mandar mensagem",
    "Não para de mandar mensagem, não gosto disso",
    "Não para de me mandar mensagem, boa noite",
    "Vocês não param de mandar mensagem, que saco",
    "Oi, vocês não param de me mandar mensagem",
    "Não param de me mandar mensagem",
    "Aff, não para de mandar promoção",
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
    // Refusing the upsell, or the carrier, inside a purchase (2026-09-29, grafo §31): terminal
    // `bloqueado` for a buyer. The refusal is an allow-list now, not the purchase a deny-list.
    "Não quero mais oferta de kit, quero só 1.",
    "Não, não quero mais oferta, só uma peça mesmo.",
    "Não quero mais ofertas, obrigada, vou ficar só com o de 1.",
    "Não quero mais promoção, pode mandar o link do de 1.",
    "Chega de promoção, me manda o link logo.",
    "Não quero receber nada pelo correio, prefiro retirar.",
    "Não quero receber nada na entrega sem conferir.",
    // The negated "não para de mandar" beside a liking she says.
    "Não para de mandar não, tô gostando",
    "Não para de mandar, quero ver as promoções",
    "Eles param de mandar se eu pedir?",
    // Someone else who keeps sending (grafo §32): the subject is an allow-list, no subject or this shop.
    "Minhas amigas não param de me mandar foto com o colete, quero comprar um",
    "A transportadora não para de mandar mensagem, cadê meu pedido?",
    "O correio não para de me mandar SMS e o colete não chegou",
    "Meu marido não para de mandar mensagem perguntando do colete, quando chega?",
    "O entregador não para de me mandar mensagem, ele já saiu?",
    // No subject said: what keeps coming has to be the messages or the offers, with no subject after
    // them (grafo §33; explicit at c0c8dbe, a terminal block for a buyer).
    "Oi, não param de me mandar notificação do correio, meu pedido chegou?",
    "Olá, não param de mandar SMS da transportadora",
    "Não param de me mandar SMS de rastreio, já saiu pra entrega?",
    "Gente não param de me mandar foto do colete no grupo, quero um",
    "Nossa, não para de mandar mensagem a transportadora",
    "não para de me mandar msg o entregador, ele já saiu?",
  ])("controle de negação: %s continua none", (text) => {
    expect(classifyOptOut(text)).toBe("none");
  });
});

/** The allow-list is an exception to a terminal action, so it gets its generator (both ways). */
describe("opt-out: gerador de recusa × resto da mensagem", () => {
  const REFUSALS = ["Não quero mais promoção", "Não quero mais oferta", "Não quero receber mais mensagens", "Chega de mensagem", "Chega de promoção", "Não quero receber nada", "Não quero receber nenhuma oferta"];
  const BARE = ["", ".", "!", ", obrigada", ", por favor", ", que saco", " de vocês", ", chega", ", tá?"];
  const BUYING = [", quero só 1", ", só uma peça", ", vou ficar com o M", ", pode mandar o link", ", me manda o pix", ", quero fechar", ", fico com o de 2", ", só o colete", " de kit, quero o G", " pelo correio", ", só quero saber do meu pedido", ", quando chega?"];
  it(`${REFUSALS.length * BARE.length} recusas sozinhas param a agente`, () => {
    const read = REFUSALS.flatMap((r) => BARE.map((b) => r + b)).filter((m) => classifyOptOut(m) !== "explicit");
    expect(read).toEqual([]);
  });
  it(`${REFUSALS.length * BUYING.length} recusas numa compra não bloqueiam a compradora`, () => {
    const read = REFUSALS.flatMap((r) => BUYING.map((b) => r + b)).filter((m) => classifyOptOut(m) !== "none");
    expect(read).toEqual([]);
  });
});
