/**
 * The Opus review of the three correction waves of the 2026-10-24 persona review (grafo §129–§131 → §132). Each phrase the review
 * showed slipping through, or read wrong, is reproduced here; each has the negation that the wave fixed — the persona's own phrase
 * still reads the way the wave made it read. The closure of `handleTurn` does not run in a unit test: its wiring is read from the source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates, TABLE_TOP_PANTS, type GateContext } from "@/agent/guardrails.js";
import type { BusinessConfig } from "@/config/business.js";
import { extractName } from "@/agent/identity.js";
import {
  asksForLink,
  foreignCheckoutUrl,
  hesitates,
  NEUTRAL_INTERPRETATION,
  quantityOf,
  reportsOrderTrouble,
  statesPastPurchase,
  changesAddress,
} from "@/agent/interpret.js";
import { TABLE_TOP_DRESS } from "@/agent/sizing.js";
import { ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const config = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const gates = (text: string, over: Partial<GateContext> = {}) =>
  runGates(text, ctx({ config, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const COD = { paymentPath: "cod" as const };
const passes = (gate: string, cases: readonly string[], over: Partial<GateContext> = COD) =>
  it.each(cases)(`${gate} passa: %s`, (text) => expect(gates(text, over)).not.toContain(gate));
const vetoes = (gate: string, cases: readonly string[], over: Partial<GateContext> = COD) =>
  it.each(cases)(`${gate} veta: %s`, (text) => expect(gates(text, over)).toContain(gate));

const FREE = "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.";
const CHARGED = "No antecipado o frete é calculado por região no checkout.";

describe("1. quantityOf: dúvida, pergunta e passado não são kit", () => {
  it.each([
    "Fica um M ou um G pra mim? uso 42",
    "Será que um M ou um G fica melhor?",
    "um G ou um GG?",
    "Era um M, mas troquei por um G",
    "Comprei um G e um M mês passado, quero mais um G",
    "um G ou um GG",
    "um G não, quero um M",
    "Comprei um G e um M mês passado",
    "Será que um G e um M servem?",
  ])("%s → nenhuma peça", (s) => expect(quantityOf(s, NEUTRAL_INTERPRETATION)).toBeNull());

  it("negação: as peças ligadas por 'e', no presente, contam (cob-recompra)", () => {
    expect(quantityOf("quero mais um G pra mim e um M pra minha cunhada", NEUTRAL_INTERPRETATION)).toEqual({ units: 2, sizes: ["G", "M"] });
    expect(quantityOf("vou querer um G pra mim e um M pra minha mãe", NEUTRAL_INTERPRETATION)).toEqual({ units: 2, sizes: ["G", "M"] });
  });
});

describe("2. shipping_promise: o valor do antecipado ou o 'tudo incluso' ao lado da frase do frete calculado", () => {
  vetoes("shipping_promise", [
    `${FREE}\n\n${CHARGED} E no pix fica R$ 116,91 com tudo incluso.`,
    `${FREE}\n\n${CHARGED} No pix sai por R$ 116,91, sem nada a mais.`,
    `${FREE}\n\n${CHARGED} No pix você paga só R$ 116,91 e pronto.`,
    `${FREE}\n\n${CHARGED} No pix fica tudo incluso.`,
    `${FREE}\n\n${CHARGED} E no pix fica R$ 116,91.`,
  ]);
  passes("shipping_promise", [
    `Na lotérica também não consigo, tá? A loja não tem boleto em nenhum caminho, só Pix ou cartão no antecipado.\n\n${FREE}\n\nNo antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91.`,
    `Entendo que você sempre paga assim, mas boleto não tem mesmo, nem na lotérica, só pix ou cartão no antecipado.\n\n${FREE}\n\n${CHARGED}`,
    `${FREE}\n\n${CHARGED} O antecipado é só no pix ou no cartão.`,
  ]);
});

describe("3. size_claim: só o teto real da tabela não é medida dela", () => {
  const before = { ...COD, knownSize: null, herWords: "uso 58 de calça" };
  it("o teto do gate é o da tabela", () => expect(TABLE_TOP_PANTS).toBe(TABLE_TOP_DRESS));
  vetoes("size_claim", ["O XGG veste até o 60 de calça.", "A tabela vai até o 56 de calça, então o XGG te serve."], before);
  passes("size_claim", [
    "A tabela para no 52 de calça, então com 58 ele ia ficar apertado.",
    "O maior que a gente tem é o XGG, que veste cintura de 92 a 100 cm, vai até o 52 de calça mais ou menos.",
  ], before);
});

describe("4. unverified_size: a grade seguida de estoque no resto da frase", () => {
  const before = { ...COD, knownSize: null, herWords: "uso 42 de calça" };
  vetoes("unverified_size", ["Temos do P ao XGG, todos disponíveis aí.", "Temos do P ao XGG, e o seu M tem sim."], before);
  passes("unverified_size", [
    "O tamanho segue a calça que você veste, a gente tem do P ao XGG pra cobrir bem todos os corpos.",
    "A maior que a gente tem é o XGG, que veste cintura até 100 cm 😊",
  ], before);
});

describe("5. cep_insist: o aviso de CEP não encontrado só vale no turno em que ele não foi encontrado", () => {
  vetoes("cep_insist", ["Não achei o seu CEP aqui na conversa, me passa?", "O seu CEP não consta aqui, me passa ele?"], { ...COD, cepForgotten: true });
  vetoes("cep_insist", ["Esse CEP não encontrei, me passa o CEP de novo?"], { ...COD, cepAsks: 1 });
  vetoes("cep_insist", ["Esse CEP não encontrei, me passa o CEP de novo?", "Não achei o seu CEP aqui na conversa, me passa?"], { ...COD, cepAsks: 1 });
  passes("cep_insist", ["Esse CEP não encontrei, me confirma depois? Qual calça você veste?"], { ...COD, cepAsks: 1, cepNotFound: true });
  passes("cep_insist", ["Tudo bem, sem pressa! Qual calça você veste?"], { ...COD, cepForgotten: true });
  it("a fiação: o cepNotFound do turno chega ao gate", () => expect(turn).toMatch(/cepNotFound,\n\s+\/\/ R26\.1: after her "não lembro o CEP"/));
});

describe("7. extractName: cidade, UF, endereço e pagamento na linha própria não são nome", () => {
  it.each([
    "Recife PE\n50000000",
    "Belo Horizonte\nrua x 10",
    "Santa Maria\nRS",
    "São Paulo capital\nCEP 01000000",
    "Cartão de crédito\nem 12x",
    "Recife PE\nquero saber o frete",
    "Cartão de crédito\nou pix",
  ])(
    "%j → nenhum nome",
    (s) => expect(extractName(s, true)).toBeNull(),
  );
  it.each([
    ["Vilma Torres\n\no da minha mae é 63.010.000", "Vilma Torres"],
    ["aline prado\n\nmas queria na entrega mesmo", "aline prado"],
  ])("negação: %j → %s", (s, name) => expect(extractName(s, true)).toBe(name));
});

describe("8. foreignCheckoutUrl: o nosso domínio, o site e uma palavra só como segmento", () => {
  const ours = ["entrega.logzz.com.br", "app.coinzz.com.br", "encorpa-fashion.com.br"];
  it.each(["https://encorpa-fashion.com.br/cart", "https://pay.coinzz.com.br/abc", "https://logzz.com.br/pedido/123", "https://maps.app.goo.gl/Pixa12"])(
    "%s não é de terceiro",
    (s) => expect(foreignCheckoutUrl(s, ours)).toBeNull(),
  );
  it("negação: o link colado na venda-decidida continua de terceiro", () => {
    expect(foreignCheckoutUrl("https://encorpa.pay/checkout?size=G", ours)).toBe("https://encorpa.pay/checkout?size=G");
    expect(foreignCheckoutUrl("paguei nesse aqui www.lojaxyz.com/pagamento/123", ours)).toBe("www.lojaxyz.com/pagamento/123");
  });
  it("a fiação: o site entra entre os nossos", () => expect(turn).toContain("foreignCheckoutUrl(p, [...CHECKOUT_HOSTS, ...(CONFIG.site ? [CONFIG.site] : [])])"));
});

describe("9. afterSale: 'comprei' de outra coisa não pula a abertura", () => {
  const afterSale = (s: string) => statesPastPurchase(s, false) || (statesPastPurchase(s) && reportsOrderTrouble(s)) || (changesAddress(s) && /\bmudei\b/i.test(s));
  it("comprei outra coisa e pergunto do colete", () => {
    expect(afterSale("comprei um vestido pra formatura, esse colete serve?")).toBe(false);
    expect(afterSale("comprei uma calça nova, qual tamanho eu uso?")).toBe(false);
  });
  it("negação: as primeiras mensagens reais depois da compra", () => {
    for (const s of [
      "oi comprei um colete com vcs e chegou aqui mas ficou grande\n\ncomo que faço pra trocar?",
      "oi tudo bem\n\ncomprei o colete com vcs e chegou, mas ficou grande queria trocar por um menor",
      "oi comprei faz 10 dias e nao chegou nada ate agora viu\n\nto achando isso uma palhaçada",
      "oi mudei de casa\n\ncom quem eu falo pra mudar o endereço?",
      "fiz o pedido semana passada, já saiu?",
    ]) expect(afterSale(s), s).toBe(true);
  });
  it("a fiação", () => {
    expect(turn).toContain(
      'const afterSale = statesPastPurchase(spoken(inbound.body ?? ""), false) ||\n    (statesPastPurchase(spoken(inbound.body ?? "")) && reportsOrderTrouble(spoken(inbound.body ?? ""))) ||',
    );
  });
});

describe("10. o CEP antes do tamanho: o fixo uma vez, e a pergunta dela respondida depois", () => {
  it("a fiação", () => {
    expect(turn).toContain("if (!recentOutbound.includes(SIZE_BEFORE_OFFER)) {");
    expect(turn).toContain('sizeFirstBubbles(), "roteiro v3: CEP antes do tamanho, a oferta espera o tamanho", {}, answerAfterOffer);');
    expect(turn).toContain('"endereço novo sem entrega: pergunta do antecipado", {}, cepMoved && askedBeside && !isResume)');
  });
});

describe("11. hesitates: adiar e não ter dinheiro agora são hesitação", () => {
  it.each([
    "deixa eu ver",
    "vou dar uma olhada",
    "depois eu compro",
    "depois te chamo",
    "hoje não",
    "agora não posso",
    "não tenho dinheiro agora",
    "to sem grana",
    "vou consultar meu marido",
  ])("%s", (s) => expect(hesitates(s)).toBe(true));
  it.each([
    "[áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] obrigada meu anjo que Deus te abençoe a neta ta aqui vendo desenho eu vou descansar a vista agora",
    "entendi, obrigada viu, vou falar com ela pra ver se ela fica em casa e te chamo depois",
    "no almoço eu vejo o cep e te chamo ai",
    "pode me mandar as promocoes sim",
    "agora to no servico",
  ])("negação: %s", (s) => expect(hesitates(s)).toBe(false));
});

describe("menores", () => {
  it("asksForLink: o dia adiado e a agenda dela não são pedido", () => {
    for (const s of ["ta, manda o link mas so no dia 5", "agenda", "pode agendar o meu horario no dentista"]) expect(asksForLink(s), s).toBe(false);
    for (const s of ["pode agendar pra mim", "manda o link ai", "sim, agenda", "pode agendar o meu pedido"]) expect(asksForLink(s), s).toBe(true);
  });
  const agent = { ...COD, layer: "agent" as const };
  passes("order_action_claim", ["Fica tranquila, eu reservo um tempinho pra te responder."], agent);
  vetoes("order_action_claim", ["Fechado, Jessica, o seu M já fica reservado pra você conferir lá.", "Já reservei o seu M.", "Reservei pra você o kit de 2."], agent);
  vetoes("size_claim", ["O maior é o XGG, que é o seu tamanho."], { ...COD, knownSize: "G" });
  passes("size_claim", ["O maior que a gente tem é o XGG mesmo.", "O seu é o G."], { ...COD, knownSize: "G" });
});
