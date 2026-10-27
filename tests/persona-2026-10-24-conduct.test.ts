/**
 * The persona review of 2026-10-24 (docs/agente-ia/10-auditoria/personas-2026-10-24-revisao-final.md §3), conduct and text: the
 * vague objection out of place, the coupon denied while the ruler holds one, "na maioria das regiões", the personal trigger past
 * three uses, the audio 4 promising tomorrow, the sales opening to a buyer, Spanish and audio requests, "pagar depois", the offers
 * accepted in words, the goodbye loop, the reserve and the deleted data. Every phrase is a persona's, word for word; each has its
 * negation. The closure of `handleTurn` does not run in a unit test: its wiring is read from the source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BusinessConfig } from "@/config/business.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { changesAddress, declinesInBurst, hesitates, isBareAck, isBareThanks, reportsOrderTrouble, statesPastPurchase } from "@/agent/interpret.js";
import { acceptsOffers, suspendsMarketingOptIn } from "@/agent/opt-in.js";
import { countTriggerUses, honestyBriefing, systemPrompt } from "@/agent/prompt.js";
import { OFFERS_YES_EXAMPLE, VAGUE_OBJECTION_QUESTION, VAGUE_PRICE_QUESTION, vagueObjectionSituation } from "@/agent/retry.js";
import { offerBubbles, type FunnelConfig } from "@/agent/funnel.js";
import { ackGoesUnanswered, conversationCoupon } from "@/agent/followups.js";
import { ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-23.min.json", "utf8")) as BusinessConfig;
/** The conversation's config before the `silence_3` touch: the coupon held for the ruler (R17.4). */
const held = conversationCoupon(prod, false);
const flat = (s: string) => s.replace(/\s+/g, " ");
const prompt = flat(systemPrompt(held, gateBriefing(held), null));
const quoted = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
const blocked = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ config: held, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("1. a objeção vaga só para a hesitação dela", () => {
  it("as hesitações reais das personas contam", () => {
    for (const s of [
      "ta bom amiga vou pensar viu obrigada",
      "blz, vou ver aqui dps te falo",
      "tá bom, vou terminar de olhar aqui com calma",
      "vou fechar semana que vem",
      "então vou deixar pra depois",
      "Entendi, vou olhar o link com calma e te falo",
      "tá carregando... ainda to vendo se pego",
    ]) expect(hesitates(s), s).toBe(true);
  });

  it("negação: despedida, recado e o CEP que ela vai buscar não são hesitação", () => {
    for (const s of [
      "[áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] obrigada meu anjo que Deus te abençoe a neta ta aqui vendo desenho eu vou descansar a vista agora",
      "entendi, obrigada viu, vou falar com ela pra ver se ela fica em casa e te chamo depois",
      "ta bom minha filha muito obrigada vou chamar ele aqui depois entao",
      "agora to no servico",
    ]) expect(hesitates(s), s).toBe(false);
    // "no almoço eu vejo o cep e te chamo ai": no hesitation word, and the CEP excludes it in the turn anyway.
    expect(hesitates("no almoço eu vejo o cep e te chamo ai")).toBe(false);
  });

  it("a fiação: hesitação nas palavras dela, nunca ao lado do CEP nem do sim às ofertas; a reclamação de preço segue", () => {
    expect(turn).toContain("const vagueObjection = !declined && !interpretation.wants_to_buy && !offersYes &&");
    expect(turn).toContain(
      '(interpretation.price_signal === "complaint" || (parts.some((p: string) => hesitates(spoken(p))) && !parts.some((p: string) => /\\bcep\\b/i.test(spoken(p))))) &&',
    );
  });

  it("\"deixa pra lá, prefiro provar antes\" é recusa (a despedida curta, sem a pergunta)", () => {
    expect(declinesInBurst(["entao deixa pra la", "prefiro provar antes"])).toBe(true);
    expect(declinesInBurst(["entao deixa pra la\n\nprefiro provar antes"])).toBe(true);
    expect(declinesInBurst(["deixa pra lá, prefiro provar antes"])).toBe(true);
  });

  it("negação: preferir provar sozinho, a pergunta e o \"não deixa\" não são recusa", () => {
    expect(declinesInBurst(["prefiro provar antes"])).toBe(false);
    expect(declinesInBurst(["deixa pra la", "prefiro provar antes?"])).toBe(false);
    expect(declinesInBurst(["não deixa pra lá, prefiro provar o M"])).toBe(false);
  });

  it("a garantia só com medo de tamanho ou de golpe; sem motivo nenhum, só a pergunta", () => {
    const facts = { codAvailable: false, firstDateIsTomorrow: false, scarcityLine: null };
    expect(vagueObjectionSituation(prod, { ...facts, warranty: false })).not.toContain("dias após o recebimento");
    expect(vagueObjectionSituation(prod, { ...facts, warranty: false })).toContain("sem motivo nenhum no meio");
    expect(quoted(vagueObjectionSituation(prod, { ...facts, warranty: true }))).toEqual(["Você tem 7 dias após o recebimento pra trocar ou devolver."]);
    expect(turn).toContain('.some((o) => o === "tamanho" || o === "confianca")');
  });

  it("a reclamação de preço ganha o kit do caminho dela, e a frase passa a cadeia", () => {
    const cod = vagueObjectionSituation(prod, { codAvailable: true, firstDateIsTomorrow: false, scarcityLine: null, price: true, warranty: false, kitPath: "cod" });
    expect(quoted(cod)).toContain("Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega.");
    const pre = vagueObjectionSituation(prod, { codAvailable: false, firstDateIsTomorrow: false, scarcityLine: null, price: true, warranty: false, kitPath: "prepay" });
    expect(quoted(pre)).toEqual(["Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado."]);
    expect(blocked(`Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega. ${VAGUE_PRICE_QUESTION}`, { regionKnown: true })).toEqual([]);
    expect(blocked(`Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado. ${VAGUE_PRICE_QUESTION}`, { regionKnown: true, paymentPath: "prepay", codUnavailable: true })).toEqual([]);
  });

  it("negação: sem reclamação de preço ou sem região, nenhum kit", () => {
    const put = vagueObjectionSituation(prod, { codAvailable: true, firstDateIsTomorrow: false, scarcityLine: null, kitPath: "cod" });
    expect(put).not.toContain("Levando");
    const unknown = vagueObjectionSituation(prod, { codAvailable: false, firstDateIsTomorrow: false, scarcityLine: null, price: true, kitPath: null });
    expect(unknown).not.toContain("Levando");
    expect(VAGUE_OBJECTION_QUESTION.startsWith("Claro!")).toBe(true);
  });
});

describe("2. o cupom guardado pra régua nunca é negado", () => {
  it("o briefing não ensina \"não temos cupom\"; diz o melhor valor de hoje", () => {
    const briefing = gateBriefing(held).join(" ");
    expect(briefing).not.toMatch(/não temos cupom no momento/i);
    expect(briefing).toContain("não diga que não existe nem que não temos: diga o melhor valor de hoje");
    expect(quoted(prompt).filter((q) => /n[ãa]o temos cupom/i.test(q))).toEqual([]);
    expect(prompt).toContain("nunca diga que não existe nem que não temos cupom");
  });

  it("a frase ensinada passa a cadeia nos dois caminhos, com e sem região", () => {
    const line = "O melhor valor de hoje é no antecipado, com 10% de desconto: R$ 116,91.";
    expect(prompt).toContain(`"${line}"`);
    for (const regionKnown of [false, true]) {
      expect(blocked(line, { regionKnown })).toEqual([]);
      expect(blocked(line, { regionKnown, paymentPath: "prepay" })).toEqual([]);
    }
  });

  it("sem desconto no antecipado, nenhum exemplo com número; o cupom ligado continua citável", () => {
    const flatNoDiscount = honestyBriefing({ ...held, prices: { ...held.prices, prepayDiscountPercent: 0 } }).join(" ");
    expect(flatNoDiscount).not.toMatch(/R\$/);
    expect(gateBriefing(prod).join(" ")).toContain("20% está ativo");
  });
});

describe("3. antes do CEP, \"dependendo da sua cidade e do tamanho\", nunca \"na maioria das regiões\"", () => {
  it("o prompt ensina a ressalva verdadeira", () => {
    expect(prompt).toContain(`diga "dependendo da sua cidade e do tamanho", nunca como certo pra ela, e nunca "na maioria das regiões".`);
    expect(prompt.match(/maioria das regi/g)?.length).toBe(1);
  });
  it("a frase com a ressalva passa a cadeia com a região desconhecida", () => {
    expect(blocked("Dependendo da sua cidade e do tamanho, dá pra pagar só quando o colete chegar.", { regionKnown: false })).toEqual([]);
  });
});

describe("4. o gatilho pessoal conta a ocasião por qualquer termo dela", () => {
  const formatura = { occasion: "formatura da filha", pain: null };
  it("as frases reais da persona contam, uma cada", () => {
    expect(countTriggerUses(["Com 44 o seu é o G, que é pra cintura de 76 a 84 cm, vai deixar o vestido da formatura caindo lisinho por cima"], formatura)).toBe(1);
    expect(countTriggerUses(["Me passa seu CEP? Aí eu já vejo a primeira data de entrega aí na sua região pra formatura?"], formatura)).toBe(1);
    expect(countTriggerUses(["Pra formatura da sua filha você vai se olhar nas fotos se sentindo segura"], formatura)).toBe(1);
  });
  it("negação: palavra parecida não é a ocasião; a dor de vários termos ainda precisa de dois", () => {
    expect(countTriggerUses(["É forrado em algodão, formato anatômico."], formatura)).toBe(0);
    expect(countTriggerUses(["Fica lindo com vestido."], { occasion: null, pain: "barriga marca no vestido" })).toBe(0);
  });
});

describe("5. o áudio 4 (\"agendar pra amanhã mesmo\") só quando a primeira data é amanhã", () => {
  const config = { ...(prod as unknown as FunnelConfig), funnel: { media: { audio4: "https://x/a4.ogg" } } };
  const saturday = new Date("2026-10-24T15:00:00Z");
  const hasAudio = (dates: string[]) => offerBubbles(config, { cod: true, dates }, saturday, null).some((b) => b.media?.kind === "audio");
  it("amanhã: o áudio vai", () => expect(hasAudio(["2026-10-25"])).toBe(true));
  it("negação: segunda (26/10) num sábado, sem data, ou no antecipado: sem o áudio", () => {
    expect(hasAudio(["2026-10-26"])).toBe(false);
    expect(hasAudio([])).toBe(false);
    expect(offerBubbles(config, { cod: false, dates: ["2026-10-25"] }, saturday, null).some((b) => b.media?.kind === "audio")).toBe(false);
  });
});

describe("6. quem chega depois da compra não recebe a abertura de venda", () => {
  const afterSale = (s: string) => statesPastPurchase(s, false) || (statesPastPurchase(s) && reportsOrderTrouble(s)) || (changesAddress(s) && /\bmudei\b/i.test(s));
  it("as primeiras mensagens reais das personas", () => {
    for (const s of [
      "oi comprei um colete com vcs e chegou aqui mas ficou grande\n\ncomo que faço pra trocar?",
      "oi tudo bem\n\ncomprei o colete com vcs e chegou, mas ficou grande queria trocar por um menor",
      "oi mudei de casa\n\ncom quem eu falo pra mudar o endereço?",
      "oi vi o anuncio no insta\n\nmudei de casa esses dias, com quem eu falo pra mudar o endereço?",
      "oi comprei faz 10 dias e nao chegou nada ate agora viu\n\nto achando isso uma palhaçada",
    ]) expect(afterSale(s), s).toBe(true);
  });
  it("negação: interesse, compra em outro lugar, cinta nunca comprada e endereço de entrega diferente seguem com a abertura", () => {
    for (const s of [
      "Olá, tenho interesse no colete cinta modeladora!",
      "nunca comprei cinta, funciona?",
      "já comprei cinta antes e não gostei",
      "posso mandar pra outro endereço?",
      "e se não servir dá pra trocar?",
    ]) expect(afterSale(s), s).toBe(false);
  });
  it("a fiação: o recibo no lugar da abertura", () => {
    expect(turn).toContain('if (isNewLead && fromAd && !isResume && !skipsOpening(spoken(inbound.body ?? "")) && !afterSale) {');
    expect(turn.indexOf("const afterSale = statesPastPurchase(")).toBeLessThan(turn.indexOf("&& !afterSale) {"));
  });
});

describe("7, 8 e 11. espanhol, áudio, pagar depois, reserva e dados", () => {
  it("o prompt ensina cada um", () => {
    expect(prompt).toContain("Você escreve só em português.");
    expect(prompt).toContain(`"Perdón, solo puedo escribir en portugués, pero te escribo bien simple."`);
    expect(prompt).toContain(`"Por aqui eu não consigo gravar áudio pra te responder, mas escrevo bem curtinho pra você."`);
    expect(prompt).toContain("Pagar na entrega não é pagar depois.");
    expect(prompt).toContain(`("só no dia 5", "quando o salário cair"), nunca diga que dá`);
    expect(prompt).toContain("Nenhum tamanho fica reservado, separado ou guardado pra ela");
    expect(prompt).toContain("nunca diga que apagou, excluiu ou esqueceu o que ela informou");
    expect(prompt).toContain(`"O pedido pra apagar os seus dados é pelo e-mail contato@encorpa-fashion.com.br."`);
  });
  it("as frases ensinadas passam a cadeia nos dois caminhos", () => {
    for (const s of [
      "Perdón, solo puedo escribir en portugués, pero te escribo bien simple.",
      "Por aqui eu não consigo gravar áudio pra te responder, mas escrevo bem curtinho pra você.",
      "O pedido pra apagar os seus dados é pelo e-mail contato@encorpa-fashion.com.br.",
    ]) {
      expect(blocked(s), s).toEqual([]);
      expect(blocked(s, { paymentPath: "prepay", codUnavailable: true }), s).toEqual([]);
    }
  });
  it("negação: sem e-mail de suporte no config, nenhum e-mail ensinado", () => {
    const { support: _s, ...noSupport } = held;
    void _s;
    expect(honestyBriefing(noSupport as BusinessConfig).join(" ")).not.toContain("e-mail");
  });
});

describe("9. o sim às ofertas por escrito: respondido como sim, sem gravar consentimento", () => {
  it("as frases reais da persona são um sim", () => {
    for (const s of ["pode me mandar as promocoes sim", "pode mandar oferta sim", "pode me mandar as promocoes sim  ai mes que vem eu chamo aqui d novo obgda viu tchau tchau"])
      expect(acceptsOffers(s), s).toBe(true);
  });
  it("negação: pergunta, recusa, parar, desconto e link não são um sim", () => {
    for (const s of ["vc vai me mandar cupom?", "vc pode me mandar promoção?", "não precisa mandar promoção", "para de mandar oferta", "tem desconto no pix?", "pode me mandar o link", "não quero ofertas"])
      expect(acceptsOffers(s), s).toBe(false);
  });
  it("o texto dela só suspende (a regra raiz do opt-in.ts), e o turno nunca grava consentimento por ele", () => {
    expect(suspendsMarketingOptIn({ body: "pode me mandar as promocoes sim" })).toBe(true);
    const wiring = turn.slice(turn.indexOf("const offersYes ="), turn.indexOf("const vagueObjection ="));
    expect(wiring).toContain("ASK_OPT_IN");
    expect(wiring).not.toContain("marketing_opt_in_at");
  });
  it("o modelo de resposta não promete nada e passa a cadeia", () => {
    expect(OFFERS_YES_EXAMPLE).not.toMatch(/vou te mandar|cupom|\?/i);
    expect(blocked(OFFERS_YES_EXAMPLE)).toEqual([]);
    expect(blocked(OFFERS_YES_EXAMPLE, { paymentPath: "prepay", codUnavailable: true })).toEqual([]);
  });
});

describe("10. a despedida não vira laço", () => {
  it("o agradecimento solto das personas, depois da nossa despedida, fica sem resposta", () => {
    for (const s of ["ta bom amiga obrigada viu", "ta bom amiga obrigada", "obrigada", "obg viu amiga, tchau"]) expect(isBareThanks([s]), s).toBe(true);
    expect(ackGoesUnanswered(isBareThanks(["ta bom amiga obrigada viu"]), "Por nada, Daiane, fico por aqui quando precisar 😊", null)).toBe(true);
  });
  it("negação: com pergunta, com hesitação, com outro assunto, ou depois de uma pergunta nossa, tem resposta", () => {
    for (const s of [
      "obrigada, qual o prazo?",
      "ta bom amiga vou pensar viu obrigada",
      "sem duvida agora nao viu obrigada",
      "obrigada meu anjo que Deus te abençoe a neta ta aqui vendo desenho",
      "ok",
    ]) expect(isBareThanks([s]), s).toBe(false);
    expect(isBareAck(["ok"])).toBe(true);
    expect(ackGoesUnanswered(isBareThanks(["obrigada"]), "Quer que eu te mande o link?", null)).toBe(false);
  });
  it("a fiação: só sem dado pedido", () => {
    expect(turn).toContain("ackGoesUnanswered(isBareAck(parts) || (datum === null && isBareThanks(parts)), lastOutbound, datum)");
  });
});
