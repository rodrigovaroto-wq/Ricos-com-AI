/**
 * The Opus re-review of 2474091 (2026-10-28, rejected): the anchor-discount exemption skipped the whole sentence, and the opening was
 * "proved" by the size ask, which other bubbles also send. Plus the Pix resend asked in her own words. Grafo §134 D.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { asksPixCode } from "@/agent/followups.js";
import { LEGACY_OPENING_FIRST, OPENING_FIRST, offerAsk, openingBubbles, openingWasSent, requestedMedia, SIZE_ASK, sizeFirstBubbles } from "@/agent/funnel.js";
import { ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-27.min.json");
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const priceVeto = (text: string) =>
  runGates(text, ctx({ config: prod, paymentPath: "prepay" })).traces.some((t) => t.verdict === "block" && t.gate === "price_promise");

describe("A. o desconto do preço cheio isenta só aquela palavra, nunca a frase (Lição 1)", () => {
  it.each([
    "No Pix sai mais barato, já com desconto.",
    "De R$ 216,50 por R$ 109,90, e no Pix ainda tem mais desconto.",
    "Pagando antecipado sai mais em conta que na hora, de R$ 216,50 por R$ 109,90.",
    "Pagando no Pix você ganha desconto extra, já com desconto do site: R$ 109,90.",
    "No Pix tem um desconto adicional, de R$ 216,50 por R$ 109,90.",
  ])("a mentira continua vetada: %s", (text) => expect(priceVeto(text)).toBe(true));
  it.each([
    "No Pix sai por R$ 109,90, já com desconto.",
    "No Pix sai de R$ 216,50 por R$ 109,90, com desconto.",
    "No Pix é o mesmo preço, não tem desconto a mais.",
  ])("a verdade passa: %s", (text) => expect(priceVeto(text)).toBe(false));
});

describe("B. a abertura é provada pela primeira linha dela, não pela pergunta do tamanho", () => {
  it("a primeira linha da abertura é OPENING_FIRST, e só a abertura manda", () => {
    expect(openingBubbles(prod)[0]!.text).toBe(OPENING_FIRST(prod.agentName));
    expect(openingWasSent(openingBubbles(prod).map((b) => b.text), prod.agentName)).toBe(true);
    expect(openingWasSent([LEGACY_OPENING_FIRST(prod.agentName)], prod.agentName)).toBe(true);
  });
  it("negação: o pedido do tamanho depois do CEP e o da oferta não provam abertura", () => {
    expect(openingWasSent(sizeFirstBubbles().map((b) => b.text), prod.agentName)).toBe(false);
    expect(openingWasSent([offerAsk(true, false)], prod.agentName)).toBe(false);
    expect(openingWasSent([SIZE_ASK], prod.agentName)).toBe(false);
  });
  it("o turno pergunta pela primeira linha (a de hoje e a do R28)", () => {
    expect(turn).toContain("body=in.(${[OPENING_FIRST(CONFIG.agentName), LEGACY_OPENING_FIRST(CONFIG.agentName)].map(");
    expect(turn).not.toContain("body=in.(${[SIZE_ASK, LEGACY_SIZE_ASK]");
  });
});

describe("o Pix pedido nas palavras dela", () => {
  it.each(["não consegui pagar, manda o qr code", "o pix expirou, manda outro", "não fiz o pix ainda, me manda o código", "o código do pix venceu, gera um novo"])(
    "pede: %s",
    (m) => expect(asksPixCode(m)).toBe(true),
  );
  it.each(["manda o pix não", "reenvia o pix não, já resolvi", "já fiz o pix", "o pix expirou?", "fiz o pix, manda o recibo", "qual o código de rastreio do pix?"])(
    "não pede: %s",
    (m) => expect(asksPixCode(m)).toBe(false),
  );
});

describe("mídia com a recusa depois", () => {
  it("'tem video? nao precisa' não manda nada; 'tem vídeo?' manda", () => {
    expect(requestedMedia("tem video? nao precisa", prod)).toEqual([]);
    expect(requestedMedia("tem vídeo? deixa pra lá", prod)).toEqual([]);
    expect(requestedMedia("tem vídeo?", prod)).toHaveLength(1);
  });
});
