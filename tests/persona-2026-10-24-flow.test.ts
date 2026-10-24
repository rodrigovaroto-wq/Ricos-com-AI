/**
 * The persona review of 2026-10-24 (docs/agente-ia/10-auditoria/personas-2026-10-24-revisao-final.md §2–§3), the turn's flow:
 * the link on her request (A1), the name (A2), the delivery offer before the size (A3), the reason before the prepaid box (A4), the
 * size read the other way round (A5), the new CEP after the link (A6), the street with the city's nickname (A7), the prepaid link
 * without the CEP (A8) and a payment link she pasted (A9). Every phrase is a persona's, word for word; each has its negation.
 * The closure of `handleTurn` does not run in a unit test: its wiring is read from the source, as the other turn tests do.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksForName, extractIdentityBurst, extractName } from "@/agent/identity.js";
import { asksForLink, foreignCheckoutUrl, missingForLink, NEUTRAL_INTERPRETATION, quantityOf, sendLinkNow } from "@/agent/interpret.js";
import {
  NAME_ASK,
  noCodReasonLine,
  offerAsk,
  offerBubbles,
  PREPAY_HEADLINE,
  PREPAY_NAME_ASK,
  SIZE_ASK,
  sizeFirstBubbles,
  sizeNoCodAsk,
  type FunnelConfig,
} from "@/agent/funnel.js";
import { statedSizeOf } from "@/agent/sizing.js";
import { streetQueries } from "@/agent/address.js";
import { lookupRegion } from "@/agent/availability.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-23.min.json", "utf8")) as FunnelConfig;

describe("A1 — o link sai quando ela pede", () => {
  it("as frases reais das personas são pedido de link", () => {
    for (const s of [
      "manda o link ai",
      "me manda o link",
      "sim, manda",
      "pode agendar pra mim",
      "blz, me manda o link então",
      "cade o link então",
      "manda o link so ai eu vejo",
      "so manda o link ai eu vejo",
      "ta então me manda o link que eu ja confirmo tudo lá 🙏😍",
      "me manda o link do kit de 3 logo",
    ]) expect(asksForLink(s), s).toBe(true);
  });

  it("negação: recusa, adiamento, dia, só um 'manda' solto e a agenda dela não são pedido", () => {
    for (const s of [
      "não manda o link ainda",
      "manda o link amanhã",
      "manda o link só às 18h",
      "manda",
      "não pode agendar ainda",
      "agenda pra sexta",
      "minha agenda ta cheia",
      "agenda cheia hoje",
      "pode agendar outro dia",
      "pode agendar pra semana que vem?",
      "você já mandou o link",
    ]) expect(asksForLink(s), s).toBe(false);
  });

  it("com tamanho, CEP e caminho, o pedido dela solta o link sem o nome (o turno conta o pedido como nome resolvido)", () => {
    const data = { sizeKnown: true, cepKnown: true, pathSettled: true, cpfDone: true, emailDone: true, identityAtCheckout: false };
    expect(missingForLink({ ...data, nameKnown: false })).toBe("name");
    expect(sendLinkNow({ ...data, nameKnown: true, yesBesideQuestion: false })).toBe(true);
    expect(turn).toContain("const linkAsked = parts.some(asksForLink) || foreignUrl !== null;");
    expect(turn).toContain("nameKnown: Boolean(identityDraft.name) || nameRefused || pressed || linkAsked || linkWentBefore,");
  });

  it("negação: a entrega continua esperando o CEP, e o tamanho e o caminho continuam exigidos", () => {
    expect(turn).toContain('cepKnown: (Boolean(addressDraft.cep) && !cepNotFound) || (linkAsked && paymentChoice === "prepay" && linkPath === "prepay"),');
    expect(missingForLink({ sizeKnown: false, cepKnown: true, pathSettled: true, nameKnown: true, cpfDone: true })).toBe("size");
    expect(missingForLink({ sizeKnown: true, cepKnown: true, pathSettled: false, nameKnown: true, cpfDone: true })).toBe("payment");
  });
});

describe("A2 — o nome de duas palavras basta, sem lixo no link", () => {
  it("o pedido de nome da própria oferta é lido como pedido (era lido como motivo: 'do seu nome')", () => {
    expect(asksForName(NAME_ASK)).toBe(true);
    expect(asksForName(PREPAY_NAME_ASK)).toBe(true);
  });

  it("negação: o nome como motivo continua não sendo pedido", () => {
    expect(asksForName("O pedido sai no seu nome completo, tá?")).toBe(false);
    expect(asksForName("Fica tudo no seu nome, pode ficar tranquila.")).toBe(false);
  });

  it.each([
    ["Fernanda Lima ok manda o link", "Fernanda Lima"],
    ["Fernanda Lima Souza o resto passo no link", "Fernanda Lima Souza"],
    ["Gisele Rocha. resto eu passo no link", "Gisele Rocha"],
    ["jussara menezes ja mandei ai em cima\n\npode mandar que eu so pago quando chegar aqui viu", "jussara menezes"],
    ["aline prado\n\nmas queria na entrega mesmo", "aline prado"],
    ["Vilma Torres\n\no da minha mae é 63.010.000", "Vilma Torres"],
    ["Patrícia Souza pode agendar pra mim 🙏 quero ficar linda na formatura", "Patrícia Souza"],
    ["Patrícia Souza é completo amore kkk Souza é sobrenome 😂 pode mandar o link??", "Patrícia Souza"],
    ["eh Carla Menezes\n\nmas me manda o link pra comprar? fica mais facil pra mim", "Carla Menezes"],
  ])("logo depois do pedido de nome: %j → %s", (msg, name) => {
    expect(extractName(msg, true)).toBe(name);
  });

  it("apresentando-se, o resto da frase não entra no nome (Daiane+Santos+O+Resto+Passo)", () => {
    expect(extractName("amiga achei que era pagar quando receber viu meu nome é Daiane Santos o resto passo no link obrigada")).toBe("Daiane Santos");
    expect(extractIdentityBurst(["meu nome é Daiane Santos o resto passo no link obrigada"]).name).toBe("Daiane Santos");
  });

  it("negação: interjeição, pergunta e frase comum depois do pedido de nome não viram nome", () => {
    for (const s of [
      "Antes disso, me manda o link",
      "Pera ai, cadê o link?",
      "Vixe maria, esqueci o cpf",
      "Nossa senhora\nque demora",
      "Pera ai\nvou pegar o documento",
      "Antes disso\nqual o prazo?",
      "Nossa que demora!",
      "Bom Dia 😊",
      "Parque Dez\nRua Paraiba 210",
      "Quero o link agora!",
    ]) expect(extractName(s, true), s).toBeNull();
  });

  it("negação: sem o pedido de nome, as palavras cortadas não fabricam um nome", () => {
    expect(extractName("Achei caro mas ok")).toBeNull();
    expect(extractName("Fernanda Lima ok manda o link")).toBeNull();
  });
});

describe("A3 — sem tamanho, a entrega não é prometida", () => {
  it("o CEP antes do tamanho pergunta o tamanho, sem oferta nem data", () => {
    const b = sizeFirstBubbles().map((x) => x.text);
    expect(b.at(-1)).toBe(SIZE_ASK);
    expect(b.join("\n")).not.toMatch(/Chegará|Não Paga Nada|FRETE GRÁTIS|R\$/);
  });

  it("o turno segura a oferta da entrega até o tamanho, e não repete a pergunta logo depois dela", () => {
    expect(turn).toContain('} else if (region !== null && offerNow === "cod" && !sizeKnown) {');
    // Once a conversation, her question answered after it (Opus review, grafo §132).
    expect(turn).toContain("if (!recentOutbound.includes(SIZE_BEFORE_OFFER)) {");
    expect(turn).toContain('const sent = await sendFunnelTurn(sizeFirstBubbles(), "roteiro v3: CEP antes do tamanho, a oferta espera o tamanho", {}, answerAfterOffer);');
  });

  it("negação: com o tamanho, a consulta é pelo tamanho e a oferta segue (a pergunta fica depois do ramo do 'No M…')", () => {
    expect(turn).toContain("const regionSize = (SIZES as readonly string[]).includes(stated?.size ?? lead.size ?? \"\")");
    expect(turn.indexOf('} else if (region !== null && offerNow === "cod" && !sizeKnown) {')).toBeGreaterThan(turn.indexOf("lastOutbound !== sizeNoCodAsk(region.size)) {"));
  });
});

describe("A4 — o motivo antes do cartão do antecipado, e sem 'Vamos agendar' nele", () => {
  const IDS = { productId: "165378", saleId: "75567" };
  const PID: Record<string, number> = { P: 165379, M: 165381, G: 165382, GG: 165383, XG: 165384 };
  const prod_ = (name: string, qty: number) => ({ product_id: PID[name], product_name: `Cinta Colete Modeladora-${name}`, stock_per_operations: [{ operation_id: 9, quantity: qty }] });
  const fetcherWith = (stock: unknown) => async (url: string) => {
    if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Brooklin" };
    if (url.includes("get-available-stock")) return stock;
    if (url.includes("get-delivery-days")) return { status: "success", data: [{ deliveryTypeCode: "x", deliverySameDay: 0, dates: [{ date: "2026-10-26" }] }] };
    throw new Error(url);
  };

  it("o M em São Paulo: sem entrega, com os tamanhos que têm lá", async () => {
    const sp = { status: "success", data: { products: [prod_("P", 0), prod_("M", 0), prod_("G", 180), prod_("GG", 12), prod_("XG", 73)] } };
    const l = await lookupRegion(fetcherWith(sp), "04710090", "M", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(false);
    expect(l.kind === "found" ? [...(l.region.otherSizesInStock ?? [])].sort() : null).toEqual(["G", "GG", "XGG"]);
  });

  it("negação: nenhum tamanho na cidade (Recife) não aponta outro tamanho", async () => {
    const none = { status: "success", data: { products: [prod_("P", 0), prod_("M", 0), prod_("G", 0), prod_("GG", 0), prod_("XG", 0)] } };
    const l = await lookupRegion(fetcherWith(none), "51021080", "G", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(false);
    expect(l.kind === "found" ? l.region.otherSizesInStock : null).toEqual([]);
  });

  it("a linha: o tamanho quando outro tamanho tem; a região quando nenhum tem ou o tamanho não é sabido", () => {
    expect(noCodReasonLine("M", true)).toBe("No M, aí na sua cidade o pagamento na entrega não está disponível agora");
    expect(noCodReasonLine("M", false)).toBe("Aí na sua região o pagamento na entrega ainda não chega");
    expect(noCodReasonLine(null, true)).toBe("Aí na sua região o pagamento na entrega ainda não chega");
  });

  it("o motivo vai antes do cartão; o cartão continua abrindo pela manchete; a pergunta do antecipado não agenda", () => {
    const reason = noCodReasonLine("M", true);
    const b = offerBubbles(prod, { cod: false, dates: [] }, new Date("2026-10-24T15:00:00Z"), offerAsk(false, true), reason).map((x) => x.text);
    expect(b[0]).toBe(reason);
    expect(b.find((t) => t.startsWith(PREPAY_HEADLINE(prod)))).toBeDefined();
    expect(b.join("\n")).not.toMatch(/agendar/i);
    expect(offerAsk(false, true)).toBe(PREPAY_NAME_ASK);
  });

  it("negação: na entrega o motivo não sai e o 'Vamos agendar' continua", () => {
    const b = offerBubbles(prod, { cod: true, dates: ["2026-10-26"] }, new Date("2026-10-24T15:00:00Z"), offerAsk(true, true), noCodReasonLine("M", true)).map((x) => x.text);
    expect(b.join("\n")).not.toContain("não está disponível");
    expect(offerAsk(true, true)).toBe(NAME_ASK);
    expect(offerAsk(false, false)).toBe(SIZE_ASK);
  });

  it("a pergunta do 'No M' culpa o tamanho, não a região; o turno passa o motivo ao cartão", () => {
    expect(sizeNoCodAsk("M")).not.toContain("na sua região");
    expect(turn).toContain("const noCodReason = cod ? null : noCodReasonLine(region.size ?? null, (region.otherSizesInStock?.length ?? 0) > 0);");
    expect(turn).toContain("otherSizesInStock: regionSize ? [regionSize] : [] };");
  });
});

describe("A5 — o tamanho dito de outro jeito", () => {
  it.each([
    ["40 eu uso\n\nfica apertado", "M"],
    ["vesto 44\n\npaga na entrega aqui em recife??", "G"],
    ["tem calça 48 em estoque?", "GG"],
    ["36\n\nvisto\n\ntamamho\n\nM ???", "P"],
    ["42 de calça", "G"],
  ])("%j → %s", (msg, size) => expect(statedSizeOf(msg)).toBe(size));

  it("negação: pergunta sobre outra pessoa, idade, sapato e número negado não são o tamanho dela", () => {
    for (const s of ["o M serve em quem usa 44?", "pra quem usa 50?", "44 eu uso de sapato", "tenho 40 anos", "minha irmã 44 usa", "não tem calça 48?", "tem calça 70?"]) {
      expect(statedSizeOf(s), s).toBeNull();
    }
  });

  it("um G e um M: os tamanhos de cada peça", () => {
    expect(quantityOf("quero mais um G pra mim e um M pra minha cunhada", NEUTRAL_INTERPRETATION)).toEqual({ units: 2, sizes: ["G", "M"] });
  });

  it("negação: um tamanho negado não é peça, e um só não é kit", () => {
    expect(quantityOf("não quero um M, quero um G", NEUTRAL_INTERPRETATION)).toBeNull();
    expect(quantityOf("quero um G", NEUTRAL_INTERPRETATION)).toBeNull();
  });
});

describe("A6 — CEP novo depois do link", () => {
  it("depois de um link, o nome não segura o próximo (aline prado nunca lida segurava o link do CEP novo)", () => {
    expect(turn).toContain("const linkWentBefore = recentOutbound.some((m: string) => CHECKOUT_BASES.some((b) => m.includes(b)));");
  });

  it("a pergunta dela ao lado do CEP novo não devolve o link ao modelo: vai fixo, e a pergunta é respondida depois", () => {
    expect(turn).toContain("if (guides.length === 0 && checkoutUrl !== null && openNow && !farewell && (!askedBeside || cepMoved)) {");
    expect(turn).toContain("        cepMoved && askedBeside && !isResume,\n      );");
    expect(turn).toContain('...(cepMoved && linkPath === "prepay" && region?.cod === false ? [{ text: opening(CEP_MOVED_PREPAY) }] : []),');
  });

  it("negação: sem consulta do CEP novo (falha) não há cepMoved; depois do pedido, nunca", () => {
    expect(turn).toContain("const cepMoved = region !== null && Boolean(storedAddress.cep && addressDraft.cep)");
    expect(turn).toContain('!["pedido_criado", "em_rota", "entregue_pago", "recusado"].includes(storedStage) && lastLinkBase(linkHistory, CHECKOUT_BASES) !== null &&');
  });
});

describe("A7 — rua com o apelido da cidade", () => {
  it("'av afonso pena 1500 centro bh' é Belo Horizonte, MG, sem o bairro na cidade", () => {
    for (const s of ["moro na av afonso pena 1500 centro bh", "é av afonso pena 1500 mesmo centro bh"]) {
      expect(streetQueries(s)).toEqual([{ street: "avenida afonso pena", city: "Belo Horizonte", number: "1500", state: "MG" }]);
    }
  });

  it("negação: sem apelido, a leitura de antes; 'bh' no meio não é a cidade", () => {
    expect(streetQueries("rua marechal floriano cruz alta rs")[1]).toEqual({ street: "rua marechal floriano", city: "cruz alta", number: null, state: "RS" });
    expect(streetQueries("rua bh 10, contagem").every((q) => q.city !== "Belo Horizonte")).toBe(true);
  });
});

describe("A8 — o antecipado escolhido não espera o CEP", () => {
  it("pediu o link no pix: o CEP não é exigido (o checkout pede o endereço)", () => {
    expect(missingForLink({ sizeKnown: true, cepKnown: true, pathSettled: true, nameKnown: true, cpfDone: true })).toBeNull();
    expect(turn).toContain('(linkAsked && paymentChoice === "prepay" && linkPath === "prepay")');
  });

  it("negação: sem o pedido dela, ou na entrega, o CEP continua exigido", () => {
    expect(missingForLink({ sizeKnown: true, cepKnown: false, pathSettled: true, nameKnown: true, cpfDone: true })).toBe("cep");
  });
});

describe("A9 — link de pagamento de terceiro", () => {
  const ours = ["entrega.logzz.com.br", "app.coinzz.com.br"];
  it("o link colado na venda-decidida é de terceiro", () => {
    expect(foreignCheckoutUrl("Prontinho aqui o link com G e desconto já aplicado 👇\nhttps://encorpa.pay/checkout?size=G\nÉ só completar endereço e pagar", ours)).toBe("https://encorpa.pay/checkout?size=G");
    expect(foreignCheckoutUrl("paguei nesse aqui www.lojaxyz.com/pagamento/123", ours)).toBe("www.lojaxyz.com/pagamento/123");
  });

  it("negação: o nosso link colado de volta, o site e um post não são de terceiro", () => {
    expect(foreignCheckoutUrl("https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?name=X", ours)).toBeNull();
    expect(foreignCheckoutUrl("abri esse https://entrega.logzz.com.br/pay/ccm-1-unidade", ours)).toBeNull();
    expect(foreignCheckoutUrl("vi no instagram.com/encorpa", ours)).toBeNull();
    expect(foreignCheckoutUrl("encorpa-fashion.com.br/produto", ours)).toBeNull();
  });

  it("o turno não segura o nosso link, diz que o dela não é nosso e nunca endossa", () => {
    expect(turn).toContain("const linkJustSent = !cepMoved && foreignUrl === null && linkHeldBack(");
    expect(turn).toContain("...(foreignUrl !== null ? [{ text: opening(foreignLinkLine(CONFIG.brand)) }] : []),");
    expect(turn).toContain('"link de terceiro colado pela cliente",');
  });
});
