/**
 * The practical test with the real model on the config of 29/10 (grafo §137): the size asked as a question, the video sent and
 * then pointed to on the site, "não vi o vídeo ainda, manda?", the kit box with one piece's price, "Menos de 24 Horas" for tomorrow,
 * the dormant Logzz close (the lead by id, the phone ask, "tá certo?" over the summary), and the coupon kept for the follow-up.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { sizeAskedFor, statedSizeOf } from "@/agent/sizing.js";
import { codOfferText, FUNNEL_LABELS, mediaNamesOf, offerBubbles, offerKindOf, requestedMedia } from "@/agent/funnel.js";
import { siteBriefing, systemPrompt } from "@/agent/prompt.js";
import { conversationCoupon, namesCoupon } from "@/agent/followups.js";
import {
  checksSummary,
  closeStep,
  PHONE_ASK,
  PHONE_REFUSED,
  SUMMARY_CHECKED,
  type CloseFacts,
  type CodDate,
} from "@/agent/cod-close.js";
import { ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-29.min.json");
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ config: prod, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("D1: a pergunta do tamanho por um número de calça", () => {
  it.each([
    ["Oi! Vim pelo site, qual tamanho pra quem veste 42?", "G"],
    ["qual o tamanho pra 44?", "G"],
    ["e pra 40, qual serve?", "M"],
    ["qual é o tamanho pra quem usa 38", "M"],
    ["pra quem veste 46 qual tamanho fica?", "GG"],
  ])("%s → %s", (msg, size) => expect(sizeAskedFor(msg)).toBe(size));

  it.each([
    "não visto 42",
    "qual tamanho pra quem não veste 42?",
    "qual tamanho pra quem tem 42 anos?",
    "pra quem usa 50?",
    "o M serve em quem usa 44?",
    "qual o valor pra 40 peças?",
    "qual tamanho pra 70?",
    "qual tamanho pra quem calça 38 de sapato?",
  ])("negação: %s → nada", (msg) => expect(sizeAskedFor(msg)).toBeNull());

  it("statedSizeOf segue sem ler a pergunta (code review de 2026-09-24): o turno só usa a tabela sem tamanho guardado", () => {
    expect(statedSizeOf("Oi! Vim pelo site, qual tamanho pra quem veste 42?")).toBeNull();
    expect(turn).toContain("const askedFor = statedNow === null && !lead.size ? [...parts].reverse().map((p: string) => sizeAskedFor(spoken(p)))");
    expect(turn).toContain("const stated = statedNow ?? (askedFor ? { size: askedFor, forOther: interpretation.size.for_other_person } : null);");
  });

  it("a resposta certa passa o size_claim com o tamanho da tabela; sem ele, vetada como hoje", () => {
    const reply = "Com 42 de calça o seu é o G, que é pra cintura de 76 a 84 cm.";
    const herWords = "Oi! Vim pelo site, qual tamanho pra quem veste 42?";
    expect(blocked(reply, { knownSize: "G", herWords })).not.toContain("size_claim");
    expect(blocked(reply, { knownSize: null, herWords })).toContain("size_claim");
  });
});

describe("D3: a retomada depois da mídia pedida no site", () => {
  it("diz que a mídia acabou de ir aqui, sem mandar ao site", () => {
    const names = mediaNamesOf(["oi", FUNNEL_LABELS.video]);
    expect(names).toEqual(["o vídeo de uma cliente vestindo o colete"]);
    const text = siteBriefing(true, names).join(" ");
    expect(text).toContain("AGORA MESMO, a pedido dela, o sistema mandou aqui na conversa: o vídeo de uma cliente vestindo o colete");
    expect(text).toContain("não mande ela ao site pra ver, não ofereça mandar de novo");
    const prompt = systemPrompt(prod, gateBriefing(prod), null, null, null, { site: true, mediaJustSent: names });
    expect(prompt).toContain("AGORA MESMO");
  });

  it("negação: sem mídia nova, nem uma palavra a mais", () => {
    expect(mediaNamesOf(["oi", "Me passa seu CEP?"])).toEqual([]);
    expect(siteBriefing(true, []).join(" ")).not.toContain("AGORA MESMO");
    expect(siteBriefing(true).join(" ")).toEqual(siteBriefing(true, []).join(" "));
  });

  it("o turno lê só o que foi depois da última mensagem dela, na retomada do modo site", () => {
    expect(turn).toContain("const mediaJustSent = siteMode && isResume");
    expect(turn).toContain('recent.findLastIndex((m: { direction: string }) => m.direction === "inbound") + 1');
  });
});

describe("D4: \"não vi o vídeo ainda, manda?\" é pedido", () => {
  it.each(["não vi o vídeo ainda, manda?", "nao assisti o video, me manda aqui", "o vídeo, pode mandar?"])("%s → o vídeo", (m) =>
    expect(requestedMedia(m, prod).map((b) => b.media?.kind)).toEqual(["video"]));

  it.each([
    "não precisa mandar vídeo",
    "vi o vídeo no site, gostei",
    "não vi o vídeo ainda",
    "vi o vídeo, manda o link",
    "o vídeo não manda não",
    "tem vídeo? não precisa",
  ])("negação: %s → nada", (m) => expect(requestedMedia(m, prod)).toEqual([]));
});

describe("D8: a caixa do kit e o \"Menos de 24 Horas\"", () => {
  const NOW = new Date("2026-10-29T13:00:00Z"); // quinta, 10h em São Paulo

  it("kit de 2 sem a entrega: a caixa diz o kit e o preço dele, nunca o de uma peça, e sem a imagem do preço de uma peça", () => {
    const b = offerBubbles(prod, { cod: false, dates: [] }, NOW, null, null, 2);
    const box = b.map((x) => x.text).join("\n");
    expect(box).toContain("⭐*Kit com 2 peças POR R$ 197,82*⭐");
    expect(box).not.toContain("109,90");
    expect(b.some((x) => x.media?.kind === "image")).toBe(false);
    expect(offerKindOf(b.find((x) => x.text.includes("Kit com"))!.text, prod)).toBe("prepay");
  });

  it("kit de 3 na entrega: a caixa abre com o kit e continua lida como a oferta da entrega", () => {
    const box = codOfferText(prod, "2026-10-30", NOW, false, 3);
    expect(box.startsWith("⭐*Kit com 3 peças POR R$ 263,76*⭐")).toBe(true);
    expect(box).not.toContain("109,90");
    expect(offerKindOf(box, prod)).toBe("cod");
    // Past the last twenty messages too: the turn's history query fetches the kit box, or the offer would go again.
    expect(turn).toContain("BOTH_HEADLINE, KIT_HEADLINE_HEAD].map(");
  });

  it("uma peça: a caixa de antes, com a imagem do preço", () => {
    const b = offerBubbles(prod, { cod: false, dates: [] }, NOW, null);
    expect(b.map((x) => x.text).join("\n")).toContain("POR R$ 109,90");
    expect(b.some((x) => x.media?.kind === "image")).toBe(true);
  });

  it("\"Menos de 24 Horas\" com o primeiro dia hoje ou amanhã (operador, 29/10); depois, o dia", () => {
    expect(codOfferText(prod, "2026-10-30", NOW)).toContain("Seu Pedido Chegará em *Menos de 24 Horas!!*");
    expect(codOfferText(prod, "2026-10-31", NOW)).not.toContain("24 Horas");
    expect(codOfferText(prod, "2026-10-29", NOW)).toContain("Menos de 24 Horas");
  });
});

describe("D6, D5, D2: o fechamento da Logzz (desligado no config de 29/10, pronto se voltar)", () => {
  const NOW = new Date("2026-10-28T15:00:00Z");
  const DATES: CodDate[] = [{ date: "2026-10-29", typeCode: "det1pgz5" }, { date: "2026-10-30", typeCode: "det1pgz5" }];
  const facts = (over: Partial<CloseFacts> = {}): CloseFacts => ({
    dates: DATES,
    name: "Maria Aparecida Souza",
    cpf: "52998224725",
    cpfInvalid: false,
    cep: "04710090",
    cepStreet: "Rua Barão do Triunfo",
    cepNeighborhood: "Brooklin Paulista",
    city: "São Paulo",
    state: "SP",
    typed: {},
    stored: { number: "100" },
    phone: "11987654321",
    what: "Colete G",
    priceBrl: 109.9,
    freeShipping: true,
    ...over,
  });
  const step = (parts: string[], lastOutbound: string, over: Partial<CloseFacts> = {}) =>
    closeStep({ facts: facts(over), state: { date: "2026-10-29", number: "100" }, parts, lastOutbound, datesAsked: false, now: NOW });
  const summary = (step(["quinta"], "") as { text: string }).text;

  it("D6: a importação grava o pedido pelo id do lead que o turno tem, e o motivo não sai em dobro", () => {
    expect(turn).toContain("const recordOrder = async (order: OrderWebhook, mayCreateLead = false, known:");
    expect(turn).toContain("const match = known ?? await leadForPhone(order.phone);");
    expect(turn).toContain('}, false, { id: lead.id, phone: String(lead.phone ?? ""), opted_out_at: lead.opted_out_at ?? null }).catch(() => null))?.status === "recorded";');
    expect(turn).toContain('[...new Set([reason, extraNotify].filter(Boolean))].join(" | ")');
    expect(turn).not.toContain('recordOutcome(conversation.id, "send", [reason, extraNotify].filter(Boolean).join(" | ")');
  });

  it("D5: a nossa checagem só pede o celular; a recusa da Logzz diz que foi o sistema da entrega", () => {
    const s = step(["quinta"], "", { phone: null as unknown as string });
    expect(s).toMatchObject({ kind: "send", text: PHONE_ASK });
    expect(PHONE_ASK).not.toMatch(/não aceitou|sistema/);
    expect(PHONE_REFUSED).toContain("O sistema da entrega não aceitou");
    expect(PHONE_REFUSED.endsWith(PHONE_ASK)).toBe(true);
    expect(turn).toContain('sendFixed(PHONE_REFUSED, "pedido na entrega: a Logzz recusou o telefone", "cod")');
  });

  it("D2: \"tá certo?\" sobre o resumo recebe o resumo de novo, fixo e por último; o sim seguinte importa", () => {
    const again = step(["tá certo?"], summary);
    expect(again.kind).toBe("send");
    const text = (again as { text: string }).text;
    expect(text.startsWith(SUMMARY_CHECKED)).toBe(true);
    expect(text.endsWith(summary)).toBe(true);
    expect(step(["sim"], text).kind).toBe("confirm");
    // The fixed line passes the close's gates, and the model does not answer after it (the summary stays last).
    expect(blocked(text, { codDates: DATES.map((d) => d.date), closeOpen: true })).toEqual([]);
    expect(turn).toContain("(askedBeside || saidBeside) && !isResume && !close.text.includes(SUMMARY_HEAD));");
  });

  it.each(["tá certo?", "está tudo certo?", "certinho?", "confere?", "é isso?", "Tá certo né?"])("checksSummary: %s", (m) =>
    expect(checksSummary([m])).toBe(true));
  it.each(["tá certo o endereço?", "não tá certo?", "sim?", "confirmado?", "tá certo", "o entregador liga antes?", "tá certo? muda o dia"])(
    "negação: %s não é a conferência do resumo",
    (m) => expect(checksSummary([m])).toBe(false),
  );
  it("negação: uma pergunta de outra coisa sobre o resumo segue com o modelo", () => {
    expect(step(["o entregador liga antes?"], summary).kind).toBe("model");
    expect(step(["sim?"], summary).kind).toBe("model");
  });
});

describe("O cupom é só do follow-up (operador, 2026-10-29)", () => {
  const reserved = conversationCoupon(prod, false);
  const hers = conversationCoupon(prod, true);

  it("ela nomeia o cupom: o código, ou cupom com o percentual", () => {
    expect(namesCoupon("tenho o SUPER20, vale?", prod.coupon)).toBe(true);
    expect(namesCoupon("recebi um cupom de 20%", prod.coupon)).toBe(true);
  });
  it.each(["tem cupom?", "tem desconto?", "o kit de 3 tem 20%?", "super 2000", "cupom de 10%"])("negação: %s não nomeia o cupom", (m) =>
    expect(namesCoupon(m, prod.coupon)).toBe(false));

  it("na conversa sem o lembrete e sem ela citar: anunciar o cupom, o código ou um código de desconto é vetado", () => {
    for (const s of [
      "Separei um cupom de 20% de desconto pra você!",
      "Usa o SUPER20 no checkout que sai mais em conta.",
      "Tenho um código de desconto pra você 😊",
      "Os cupons de hoje valem no checkout.",
    ]) expect(blocked(s, { config: reserved }), s).toContain("coupon_exists");
  });

  it("o desconto do kit de 3 (20%) continua dito, e a negação segue como era (passa)", () => {
    expect(blocked("No kit de 3 peças sai com 20% de desconto: R$ 263,76.", { config: reserved, units: 3 })).not.toContain("coupon_exists");
    expect(blocked("Não temos cupom de desconto no momento.", { config: reserved })).not.toContain("coupon_exists");
  });

  it("depois do lembrete ou com ela citando: confirmar o código e onde digitar passa", () => {
    expect(blocked("Vale sim! É só digitar o cupom SUPER20 no checkout 😊", { config: hers })).toEqual([]);
  });

  it("o briefing ensina a mesma promessa; a caixa da oferta e as linhas fixas nunca levam o cupom", () => {
    expect(gateBriefing(reserved).join(" ")).toContain("não anuncia, não oferece e não puxa assunto de cupom");
    expect(gateBriefing(reserved).join(" ")).not.toContain("SUPER20");
    expect(gateBriefing(hers).join(" ")).toContain("SUPER20");
    const NOW = new Date("2026-10-29T13:00:00Z");
    for (const cod of [true, false]) for (const pieces of [1, 2, 3]) {
      const text = offerBubbles(prod, { cod, dates: ["2026-10-30"] }, NOW, "x", null, pieces).map((b) => b.text).join("\n");
      expect(text).not.toMatch(/cupom|SUPER20/i);
    }
    expect(`${PHONE_REFUSED}${SUMMARY_CHECKED}`).not.toMatch(/cupom/i);
  });

  it("o turno libera o cupom pelo lembrete enviado ou pela palavra dela", () => {
    expect(turn).toContain("const couponHers = couponTouchSent || (CONFIG.coupon.active && (namesCoupon(spoken(inbound.body ?? \"\"), CONFIG.coupon) ||");
    expect(turn).toContain("const turnConfig = conversationCoupon(CONFIG, couponHers);");
  });
});

// Opus review of cfa04fe (reprovado, 2026-10-29, grafo §137): two numbers, the coupon asked for, and a kit's piece price said alone.
describe("revisão do cfa04fe: dois números, o cupom pedido e o preço da peça do kit", () => {
  const prod29b = loadBusinessConfig("docs/operacao/business-config-2026-10-29b.min.json");
  const held = conversationCoupon(prod29b, false);

  it.each([
    ["qual tamanho pra quem veste 40/42?", "G"],
    ["qual tamanho pra quem veste 40 ou 42?", "G"],
    ["qual tamanho pra 44 ou 46?", "GG"],
    ["qual tamanho pra quem veste entre 40 e 42?", "G"],
    ["qual tamanho pra quem veste 42 a 44?", "G"],
    ["qual tamanho fica pra 40 ou 42?", "G"],
  ])("entre dois, o maior (como statedSizeOf): %s → %s", (msg, size) => expect(sizeAskedFor(msg)).toBe(size));

  it.each([
    ["qual tamanho pra quem veste 40 ou 42 anos?", null],
    ["qual tamanho pra 40 e 50 reais?", null],
    ["qual tamanho pra quem não veste 40/42?", null],
  ])("negação: o segundo número só conta como tamanho: %s → %s", (msg, size) => expect(sizeAskedFor(msg)).toBe(size));

  it.each(["tenho o SUPER20", "o SUPER20 vale?", "recebi um cupom de 20%", "tenho um cupom de 20% de vocês", "ganhei um cupom de 20%, vale?", "tenho 20% de cupom, ainda vale?"])(
    "ela nomeia o código ou diz que tem o cupom: %s",
    (m) => expect(namesCoupon(m, prod29b.coupon)).toBe(true),
  );
  it.each([
    "vi 20% de desconto no site, tem cupom?",
    "consegue um cupom de 20 por cento?",
    "tem cupom de 20%?",
    "quero 20% de desconto, tem cupom?",
    "tem algum cupom tipo 10 ou 20%?",
    "nao tenho cupom de 20%",
    "não tenho nenhum cupom de 20%",
    "20% de cupom ainda vale?",
    "tenho interesse, tem cupom de 20%?",
  ])("negação: pergunta, pedido ou negação nunca liberam o cupom: %s", (m) => expect(namesCoupon(m, prod29b.coupon)).toBe(false));

  const priceGate = (text: string, config = held) =>
    runGates(text, ctx({ config })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

  it.each(["Fica R$ 87,92 pra você.", "Consigo fazer por R$ 87,92.", "Hoje sai por R$ 87,92 no pagamento na entrega!", "O seu colete fica R$ 98,91."])(
    "a peça do kit dita como o preço de uma peça é vetada: %s",
    (s) => expect(priceGate(s)).toContain("price_promise"),
  );
  it.each([
    "No kit de 3 cada peça sai por R$ 87,92.",
    "3 peças saem por apenas R$ 87,92 cada!",
    "Levando 2 peças, sai R$ 98,91 cada.",
    "No kit de 3 fica R$ 263,76, ou R$ 87,92 por peça.",
    "Uma peça é R$ 109,90.",
  ])("negação: a peça do kit com o kit dito, e os preços de sempre, passam: %s", (s) => expect(priceGate(s)).not.toContain("price_promise"));
});
