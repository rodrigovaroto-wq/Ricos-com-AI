import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIO_TRANSCRIPTS,
  bothLinksBubbles,
  openingWasSent,
  bothPrepayBubbles,
  saysNoDeliveryDay,
  LEGACY_SIZE_ASK,
  codOfferText,
  firstDayLine,
  firstMessageNeedsAnswer,
  funnelLinkMessage,
  isLikelyCodCity,
  lastOfferKind,
  priceLabel,
  skipsOpening,
  offerAsk,
  offerBubbles,
  offerWasSent,
  openingBubbles,
  prepayOfferText,
  SIZE_ASK,
  type FunnelConfig,
} from "@/agent/funnel.js";

/** The production config of 2026-10-15, with the R28 additions. */
const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-15.min.json", "utf8")) as FunnelConfig;
const media = {
  audio1: "https://x/funil/audio-1.ogg",
  audio2: "https://x/funil/audio-2.ogg",
  audio4: "https://x/funil/audio-4.ogg",
  video: "https://x/funil/video-1.mp4",
  reviews: "https://x/funil/avaliacoes.png",
  sizes: "https://x/funil/tamanhos.png",
  price: "https://x/funil/preco.png",
};
const config: FunnelConfig = { ...prod, socialProof: { satisfiedCustomers: 500, reviews: 124 }, funnel: { media } };
const now = new Date("2026-10-19T15:00:00Z"); // 12h in São Paulo

describe("roteiro v3: a abertura (R28)", () => {
  it("mostra o produto antes de perguntar: 2 áudios, vídeo, avaliações (a tabela só a pedido, 20/10), e só então a calça", () => {
    const b = openingBubbles(config);
    expect(b.map((x) => x.media?.kind ?? "text")).toEqual(["text", "audio", "audio", "text", "video", "text", "image", "text"]);
    expect(b.at(-1)?.text).toBe(SIZE_ASK);
    expect(b[0]!.text).toContain("Aqui é a Malu");
    // "Oi, tudo bem?" is the greeting; between it and the size ask, nothing asks her anything.
    expect(b.slice(1, -1).filter((x) => !x.media && x.text.includes("?")).length).toBe(0);
  });

  it("a história guarda o que o áudio diz, palavra por palavra", () => {
    const b = openingBubbles(config);
    expect(b[1]!.text).toContain(AUDIO_TRANSCRIPTS.audio1);
    expect(AUDIO_TRANSCRIPTS.audio1).toContain("reduz até três tamanhos de cintura imediatamente");
  });

  it("os números de prova social vêm do config, e a chave ausente some", () => {
    expect(openingBubbles(config).map((b) => b.text).join(" ")).toContain("*Mais de 500 Clientes Satisfeitas* e 124 avaliações positivas!!");
    const none = openingBubbles({ ...config, socialProof: {} }).map((b) => b.text).join(" ");
    expect(none).not.toMatch(/\d+ (?:clientes|avalia)/);
  });

  it("sem as mídias no config, só o texto sai (nunca um link vazio)", () => {
    const b = openingBubbles({ ...config, funnel: {} });
    expect(b.every((x) => !x.media)).toBe(true);
    expect(b.at(-1)?.text).toBe(SIZE_ASK);
  });
});

describe("a primeira mensagem dela pede resposta depois da abertura?", () => {
  it.each([
    "Olá, tenho interesse no colete cinta modeladora!",
    "Olá, tenho interesse nessa cinta modeladora",
    "oi",
    "Boa noite",
    "Quero saber mais",
  ])("não: %s", (m) => expect(firstMessageNeedsAnswer(m)).toBe(false));

  it.each([
    "Qual é o preço do colete?",
    "Quais são as regiões atendidas?",
    "O valor",
    "tem tamanho g2",
    "não tenho interesse, foi engano",
    "Boa noite, eu tava no Face daí veio esse colete e eu moro em Coronel Bicaco e tenho problema na coluna",
  ])("sim: %s", (m) => expect(firstMessageNeedsAnswer(m)).toBe(true));
});

describe("a oferta depois do CEP", () => {
  it("na entrega: o preço do config, frete grátis, quem recebe e a data da consulta", () => {
    // Copy v4 (operator, 2026-10-20): "Menos de 24 Horas" only when the checkout's first day is tomorrow.
    const t = codOfferText(config, "2026-10-20", now);
    // The operator's exact text (2026-10-21, grafo §121).
    expect(t).toBe(
      "⭐*~R$ 216,50~ POR R$ 129,90*⭐\n\n🚚 *FRETE GRÁTIS*\nSeu Pedido Chegará em *Menos de 24 Horas!!*\n\nOu se preferir outro dia, é só escolher lá no checkout." +
        "\n\n✅*Não Paga Nada Agora*, só quando chegar aí, no dinheiro, Pix ou cartão!\n\n🔁 *7 Dias de Garantia* pra trocar ou devolver se não gostar.",
    );
    expect(t).toContain("Seu Pedido Chegará em *Menos de 24 Horas!!*");
    expect(t).toContain("no dinheiro, Pix ou cartão");
    expect(t).toContain("*7 Dias de Garantia* pra trocar ou devolver");
    const later = codOfferText(config, "2026-10-22", now);
    expect(later).toContain("Seu Pedido Chegará já *quinta (22/10)!!*");
    expect(later).not.toContain("24 Horas");
  });

  it("sem data na consulta, a faixa do config; nunca 'hoje'", () => {
    const t = codOfferText(config, undefined, now);
    expect(t).toContain("Seu Pedido Chegará em *1 a 3 dias!!*");
    expect(t).not.toContain("24 Horas");
    expect(t).not.toMatch(/\bhoje\b/);
  });

  it("negação: a data que não é amanhã não vira 'amanhã'", () => {
    expect(firstDayLine("2026-10-21", now)).toBe("quarta (21/10)");
    expect(firstDayLine("2026-10-20", now)).toBe("amanhã, terça (20/10)");
    // 23h30 in São Paulo is still the 19th: tomorrow is the 20th, not the 21st.
    expect(firstDayLine("2026-10-20", new Date("2026-10-20T02:30:00Z"))).toBe("amanhã, terça (20/10)");
    expect(firstDayLine("lixo", now)).toBeNull();
  });

  it("no antecipado: o desconto e as parcelas do config, e nunca frete grátis", () => {
    const t = prepayOfferText(config);
    expect(t).toContain("R$ 116,91");
    expect(t).toContain("Desconto Adicional de *10%!!!*");
    expect(t).toContain("em até *12x no cartão!*");
    expect(t).toContain("pelos Correios, com código de rastreio");
    expect(t).not.toMatch(/gr[aá]tis/i);
  });

  it("o áudio 4 só vai onde a entrega chega", () => {
    expect(offerBubbles(config, { cod: true, dates: ["2026-10-20"] }, now, null).some((b) => b.media?.url === media.audio4)).toBe(true);
    expect(offerBubbles(config, { cod: false, dates: [] }, now, null).some((b) => b.media?.url === media.audio4)).toBe(false);
  });

  it("a pergunta depois da oferta: o tamanho se faltar, senão só o nome — nunca CPF nem e-mail", () => {
    expect(offerAsk(true, false)).toBe(SIZE_ASK);
    expect(offerAsk(true, true)).toContain("nome completo");
    expect(offerAsk(false, true)).toContain("nome completo");
    expect([offerAsk(true, true), offerAsk(false, true)].join(" ")).not.toMatch(/cpf|e-?mail/i);
  });

  it("a oferta mandada é reconhecida no histórico, nos dois caminhos", () => {
    expect(offerWasSent([codOfferText(config, undefined, now)], config)).toBe(true);
    expect(offerWasSent([prepayOfferText(config)], config)).toBe(true);
    expect(offerWasSent(["Com 46 o seu é o GG"], config)).toBe(false);
  });
});

describe("entrega não confirmada numa cidade da Logzz: os dois links (operador, 2026-10-19)", () => {
  const list = ["Campinas/SP", "São Paulo/SP"];
  it("a cidade da lista, com acento ou sem, com apóstrofo ou hífen", () => {
    expect(isLikelyCodCity({ city: "Santa Bárbara d'Oeste", state: "SP" }, ["Santa Bárbara d'Oeste/SP"])).toBe(true);
    expect(isLikelyCodCity({ city: "Santa Barbara D Oeste", state: "SP" }, ["Santa Bárbara d'Oeste/SP"])).toBe(true);
    expect(isLikelyCodCity({ city: "Ceará-Mirim", state: "RN" }, ["Ceará-Mirim/RN"])).toBe(true);
    expect(isLikelyCodCity({ city: "Campinas", state: "SP" }, list)).toBe(true);
    expect(isLikelyCodCity({ city: "Sao Paulo", state: "SP" }, list)).toBe(true);
  });
  it("negação: fora da lista, sem lista, ou o mesmo nome em outro estado", () => {
    expect(isLikelyCodCity({ city: "Abaeté", state: "MG" }, list)).toBe(false);
    expect(isLikelyCodCity({ city: "Campinas", state: "SP" }, undefined)).toBe(false);
    expect(isLikelyCodCity({ city: "Campinas", state: "SC" }, list)).toBe(false);
  });
  it("os dois links, diferentes de bater o olho, sem o áudio 4, e o aviso da consulta", () => {
    // Copy v4, section 4: the delivery link first; the prepaid one when she says no day showed up.
    const b = bothLinksBubbles(config, "Campinas", "https://entrega/x", "https://coinzz/y", "GG");
    const all = b.map((x) => x.text).join("\n");
    expect(all).toContain("🟢 *Pagar SÓ Quando Receber*");
    expect(all).toContain("⭐*~R$ 216,50~ POR R$ 129,90*⭐");
    expect(all).toContain("https://entrega/x");
    expect(all).not.toContain("https://coinzz/y");
    expect(all).toContain("Se não aparecer me fala aqui");
    expect(b.some((x) => x.media?.kind === "audio")).toBe(false);
    expect(lastOfferKind([b.find((x) => !x.media)!.text], config)).toBe("both");
    const second = bothPrepayBubbles(config, "Ana Lima", "https://coinzz/y").map((x) => x.text).join("\n");
    expect(second).toContain("Ah que pena Ana...");
    expect(second).toContain("*Você Ganhou Mais 10% de Desconto!!*");
    expect(second).toContain("⭐*~R$ 216,50~ POR R$ 116,91*⭐");
    expect(second).toContain("https://coinzz/y");
  });
});

describe("a mensagem do link", () => {
  it("na entrega: o preço, o endereço no checkout e os kits como opção", () => {
    const t = funnelLinkMessage(config, "https://entrega/x", "cod", "Cláudia Ferreira Lima", "GG", 1);
    expect(t).toContain("Pronto, Cláudia! 🎉");
    expect(t).toContain("Seu Colete no GG por R$ 129,90");
    // The operator's exact text (2026-10-21, grafo §121): the price of each piece in the kit.
    expect(t).toBe(
      "Pronto, Cláudia! 🎉\nSeu Colete no GG por R$ 129,90, com frete grátis, e você só paga quando receber!!\n\n" +
        "É só abrir o link, completar o endereço e escolher o dia da entrega que preferir: https://entrega/x\n\n" +
        "Valores dos Kits\n• 2 peças saem por apenas *R$ 116,91* cada!\n• 3 peças saem por apenas *R$ 103,92* cada!",
    );
    expect(t).not.toMatch(/cpf|e-?mail/i);
  });
  it("no antecipado: o preço do antecipado e os kits do antecipado, nunca os da entrega", () => {
    const t = funnelLinkMessage(config, "https://coinzz/y", "prepay", null, "M", 1);
    expect(t).toContain("R$ 116,91");
    expect(t).toContain("• 2 peças saem por apenas *R$ 103,92* cada!");
    expect(t).not.toContain("*R$ 116,91* cada");
    expect(t).not.toMatch(/gr[aá]tis/i);
  });
  it("no kit, o preço do kit e nenhuma oferta de kit de novo", () => {
    const t = funnelLinkMessage(config, "https://entrega/k", "cod", "Ana", null, 2);
    expect(t).toContain("Seu Kit com 2 peças por R$ 233,82");
    expect(t).not.toContain("Valores dos Kits");
  });
});

describe("a turn: dois links só quando a consulta falha numa cidade da lista (index.ts lido como fonte)", () => {
  const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("o \"não\" da Logzz para o tamanho dela é estoque, e vai o antecipado; os dois links só na consulta que falhou (operador, 20/10)", () => {
    expect(turn).toContain("const likelyPlace = region !== null ? null : failedPlace;");
    expect(turn).toContain("failedPlace = lookup.kind === \"failed\" ? lookup.place ?? null : null;");
    expect(turn).toContain('const offerNow: OfferKind | null = region !== null ? (region.cod ? "cod" : "prepay") : likely ? "both" : null;');
    // The directive about the two links only where they went (never over a real "no").
    expect(turn).toContain('regionDirectiveFor(knownRegion, paymentChoice, agreedOnly, offerBefore === "both", ');
    // Never after a link or a sale, only inside the window, and the two checkouts only with her size (review of v3).
    expect(turn).toContain('if (guides.length === 0 && offerNow !== null && offerNow !== offerBefore && !pastLink && openNow && !farewell && !withdrew && (offerNow !== "both" || sizeKnown)) {');
  });
});

describe("revisão do v3: os furos que ela achou", () => {
  it.each(["me tira dessa lista", "Número errado", "PARE", "quero falar com atendente", "Msg vc enviou pra pessoa errada"])(
    "1. sem abertura para quem pede pra parar, errou o número ou quer uma pessoa: %s",
    (m) => expect(skipsOpening(m)).toBe(true),
  );
  it.each(["Olá, tenho interesse no colete cinta modeladora!", "Qual é o preço do colete?", "oi"])(
    "1. negação — a abertura segue: %s",
    (m) => expect(skipsOpening(m)).toBe(false),
  );
  it.each(["Oi, uso 42", "13010-000", "Boa noite, visto GG", "quero 2", "tenho interesse, sou M"])(
    "3. um dado na primeira mensagem é respondido depois da abertura: %s",
    (m) => expect(firstMessageNeedsAnswer(m)).toBe(true),
  );
  it("5. os dois links de um kit dizem o preço do kit", () => {
    const all = bothLinksBubbles(config, "Campinas", "https://e/k", "https://c/k", null, 2).map((b) => b.text).join("\n");
    expect(all).toContain("⭐*2 PEÇAS POR R$ 233,82*⭐");
    expect(bothPrepayBubbles(config, null, "https://c/k", 2).map((b) => b.text).join("\n")).toContain("⭐*2 PEÇAS POR R$ 207,84*⭐");
    expect(all).not.toContain("POR R$ 129,90");
  });
  it("9. o CEP que muda de região muda a oferta: o histórico diz qual foi a última", () => {
    const cod = codOfferText(config, undefined, now);
    const both = bothLinksBubbles(config, "Campinas", "https://e", "https://c", "G").find((b) => !b.media)!.text;
    expect(lastOfferKind([cod], config)).toBe("cod");
    expect(lastOfferKind([cod, "oi", prepayOfferText(config)], config)).toBe("prepay");
    expect(lastOfferKind([both], config)).toBe("both");
    expect(lastOfferKind(["Com 46 o seu é o GG"], config)).toBeNull();
  });
  it("8. frete grátis e parcela no link só como o config diz", () => {
    const paid = { ...config, delivery: { ...config.delivery, codFreeShipping: false } };
    expect(funnelLinkMessage(paid, "https://e", "cod", null, "G", 1)).not.toMatch(/gr[aá]tis/i);
    const one = { ...config, prices: { ...config.prices, prepayMaxInstallments: 1 } };
    expect(funnelLinkMessage(one, "https://c", "prepay", null, "G", 1)).not.toContain("1x");
    expect(priceLabel({ ...config, prices: { ...config.prices, codBrl: 139.9 } })).toContain("R$ 139,90");
  });
  it("13. a pergunta da abertura termina em '?'", () => {
    expect(SIZE_ASK).toContain("?");
  });
});


describe("copy v4 (operador, 2026-10-20): o que já estava no ar continua reconhecido", () => {
  it("a abertura e as ofertas de antes ainda contam como mandadas", () => {
    // Since the review of 2474091 the opening is proved by its first line (the R28 one too), never by the size ask, which other
    // bubbles also send.
    expect(openingWasSent(["Olá, tudo bem?\nMeu nome é Malu, vou te explicar tudo sobre a nossa cinta modeladora 🥰"], "Malu")).toBe(true);
    expect(openingWasSent([LEGACY_SIZE_ASK], "Malu")).toBe(false);
    expect(lastOfferKind(["⭐ DE R$ 216,50 POR R$ 129,90 ⭐\n🚛 FRETE GRÁTIS: …"], config)).toBe("cod");
    expect(lastOfferKind(["Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦\n…"], config)).toBe("prepay");
    expect(lastOfferKind(["⭐ DE R$ 216,50 POR R$ 129,90 ⭐\nCampinas costuma ter pagamento na entrega, mas…"], config)).toBe("both");
  });
  it.each(["não apareceu nada", "não aparece dia nenhum", "nenhuma data", "não tem entrega pra mim, sem dia"])("ela diz que não apareceu dia: %s", (m) =>
    expect(saysNoDeliveryDay(m)).toBe(true));
  it.each(["apareceu sim", "já apareceu o dia, finalizei", "ainda vou abrir", "não sei ainda", "não tem como eu ver agora", "não deu tempo de abrir", "não tem nada a ver", "ainda não tem nada pra hoje, vou abrir depois", "sem dia ainda, nem abri"])("negação — apareceu, ou ainda não viu: %s", (m) =>
    expect(saysNoDeliveryDay(m)).toBe(false));
});
