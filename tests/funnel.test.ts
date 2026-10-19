import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIO_TRANSCRIPTS,
  bothLinksBubbles,
  codOfferText,
  firstDayLine,
  firstMessageNeedsAnswer,
  funnelLinkMessage,
  isLikelyCodCity,
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
  it("mostra o produto antes de perguntar: 2 áudios, vídeo, avaliações, tabela, e só então a calça", () => {
    const b = openingBubbles(config);
    expect(b.map((x) => x.media?.kind ?? "text")).toEqual(["text", "audio", "audio", "text", "video", "text", "image", "image", "text"]);
    expect(b.at(-1)?.text).toBe(SIZE_ASK);
    expect(b[0]!.text).toContain("Meu nome é Malu");
    // "Olá, tudo bem?" is the greeting; between it and the size ask, nothing asks her anything.
    expect(b.slice(1, -1).filter((x) => !x.media && x.text.includes("?")).length).toBe(0);
  });

  it("a história guarda o que o áudio diz, palavra por palavra", () => {
    const b = openingBubbles(config);
    expect(b[1]!.text).toContain(AUDIO_TRANSCRIPTS.audio1);
    expect(AUDIO_TRANSCRIPTS.audio1).toContain("reduz até três tamanhos de cintura imediatamente");
  });

  it("os números de prova social vêm do config, e a chave ausente some", () => {
    expect(openingBubbles(config).map((b) => b.text).join(" ")).toContain("mais de 500 clientes satisfeitas e 124 avaliações positivas");
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
    const t = codOfferText(config, "2026-10-20", now);
    expect(t).toContain("DE R$ 216,50 POR R$ 129,90");
    expect(t).toContain("FRETE GRÁTIS");
    expect(t).toContain("amanhã, terça (20/10)");
    expect(t).toContain("no dinheiro, Pix ou cartão");
    expect(t).toContain("7 dias pra trocar ou devolver");
  });

  it("sem data na consulta, a faixa do config; nunca 'hoje'", () => {
    const t = codOfferText(config, undefined, now);
    expect(t).toContain("chega em 1 a 3 dias");
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
    expect(t).toContain("10% de desconto");
    expect(t).toContain("em até 12x no cartão");
    expect(t).toContain("o frete aparece no checkout");
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
    const b = bothLinksBubbles(config, "Campinas", "https://entrega/x", "https://coinzz/y", "GG");
    const all = b.map((x) => x.text).join("\n");
    expect(all).toContain("🟢 1) PAGAR SÓ NA ENTREGA · R$ 129,90");
    expect(all).toContain("🔵 2) PAGAR AGORA NO PIX OU CARTÃO · R$ 116,91");
    expect(all).toContain("consulta de CEP está instável");
    expect(all).toContain("no conforto da sua casa do mesmo jeito, com a mesma segurança");
    expect(b.some((x) => x.media?.kind === "audio")).toBe(false);
    expect(offerWasSent([b.find((x) => !x.media)!.text], config)).toBe(true);
  });
});

describe("a mensagem do link", () => {
  it("na entrega: o preço, o endereço no checkout e os kits como opção", () => {
    const t = funnelLinkMessage(config, "https://entrega/x", "cod", "Cláudia Ferreira Lima", "GG", 1);
    expect(t).toContain("Prontinho, Cláudia!");
    expect(t).toContain("Seu GG por R$ 129,90");
    expect(t).toContain("2 peças saem por R$ 233,82, e 3 peças saem por R$ 311,76");
    expect(t).not.toMatch(/cpf|e-?mail/i);
  });
  it("no antecipado: o preço do antecipado e os kits do antecipado, nunca os da entrega", () => {
    const t = funnelLinkMessage(config, "https://coinzz/y", "prepay", null, "M", 1);
    expect(t).toContain("R$ 116,91");
    expect(t).toContain("R$ 207,84");
    expect(t).not.toContain("R$ 233,82");
    expect(t).not.toMatch(/gr[aá]tis/i);
  });
  it("no kit, o preço do kit e nenhuma oferta de kit de novo", () => {
    const t = funnelLinkMessage(config, "https://entrega/k", "cod", "Ana", null, 2);
    expect(t).toContain("Suas 2 peças por R$ 233,82");
    expect(t).not.toContain("E se quiser levar mais");
  });
});

describe("a turn: dois links quando a consulta diz não ou falha numa cidade da lista (index.ts lido como fonte)", () => {
  const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("o lugar sem confirmação é o da região sem entrega, ou o da consulta que falhou", () => {
    expect(turn).toContain("const unconfirmedPlace = region !== null ? (region.cod ? null : region.place) : failedPlace;");
    expect(turn).toContain("failedPlace = lookup.kind === \"failed\" ? lookup.place ?? null : null;");
    expect(turn).toContain("if (unconfirmedPlace !== null && isLikelyCodCity(unconfirmedPlace, CONFIG.cod.likelyCities) && !offerWasSent(");
  });
});

