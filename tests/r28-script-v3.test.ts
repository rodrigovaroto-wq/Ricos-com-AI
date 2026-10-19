import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx, config as base } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx(over)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

/** R28 (operator, 2026-10-19): the vest slims while worn, up to 3 pants sizes — and never weight loss. */
describe("R28: 'emagrece enquanto você usa'", () => {
  it.each([
    "Enquanto você usa, emagrece e pode reduzir até 3 números de calça",
    "Sim! Enquanto você está com ele, emagrece e pode reduzir até 3 números de calça.",
    "Emagrece na hora que você veste, até 3 números de calça a menos 😍",
  ])("passa: %s", (t) => expect(blocked(t)).not.toContain("weight_loss_claim"));

  it.each([
    "O colete emagrece.",
    "Ele emagrece de vez.",
    "Enquanto você usa, ele emagrece e perde peso.",
    "Emagrece enquanto você usa e o resultado fica pra sempre.",
    "Com ele vestido você emagrece de vez.",
    "Enquanto você usa, emagrece e queima gordura.",
    "Ele emagrece até depois que tira.",
    // Review of v3 (11): the noun "vestido" is no wearing, and time is the body changing.
    "Você emagrece e entra no vestido de festa",
    "Usando todo dia você emagrece e volta a caber naquele vestido justinho",
    "Enquanto você usa todo dia, ele emagrece de verdade com o tempo",
    "Enquanto você usa, emagrece aos poucos",
  ])("negação — continua vetado: %s", (t) => expect(blocked(t)).toContain("weight_loss_claim"));
});

describe("R28: as avaliações do config", () => {
  const withReviews = { ...base, socialProof: { satisfiedCustomers: 500, reviews: 124 } };
  it("o número configurado passa como 'N avaliações positivas'", () => {
    expect(blocked("Já são mais de 500 clientes satisfeitas e 124 avaliações positivas ❤️", { config: withReviews })).toEqual([]);
  });
  it.each([
    ["outro número", "Já são 300 avaliações positivas"],
    ["sem a chave no config", "Já são 124 avaliações positivas"],
    ["nota inventada", "124 avaliações positivas, nota 4,9"],
    ["com relógio", "Já são 124 avaliações positivas só esta semana"],
    ["recebidas hoje", "Recebemos 124 avaliações positivas hoje"],
  ])("negação — %s é veto", (_, t) => {
    const cfg = _ === "sem a chave no config" ? base : withReviews;
    expect(blocked(t, { config: cfg })).toContain("invented_testimonial");
  });
});

describe("R28: a fiação do roteiro v3 na turn (index.ts lido como fonte)", () => {
  it("toda lead nova recebe a abertura no lugar do recibo, e o modelo só responde se ela perguntou algo", () => {
    expect(turn).toContain("if (isNewLead && !isResume && !skipsOpening(spoken(inbound.body ?? \"\"))) {\n    const opening = openingBubbles(CONFIG);");
    expect(turn).toContain("const answer = firstMessageNeedsAnswer(spoken(inbound.body ?? \"\"));");
    expect(turn.indexOf("const opening = openingBubbles(CONFIG);")).toBeLessThan(turn.indexOf("const receiptText = openNow ? WELCOME_AUTO_REPLY"));
  });
  it("a oferta fixa sai na primeira vez que a região é conhecida, e o link sai só com o nome", () => {
    expect(turn).toContain("const offerBefore = lastOfferKind([...offerHistory, ...recentOutbound], CONFIG);");
    expect(turn).toContain("cpfDone: true,");
    expect(turn).toContain("emailDone: true,");
    expect(turn).toContain("pathSettled: paymentChoice !== null || knownRegion !== null,");
  });
  it("as mensagens do roteiro vão com as próprias bolhas, mídia incluída, uma linha por mensagem no histórico", () => {
    expect(turn).toContain("created_at: new Date(start + i).toISOString(),");
    expect(turn).toContain("b.media ? { text: \"\", delayMs: MEDIA_DELAY_MS, media: b.media }");
  });
});
