import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
import { renderFollowup, type StopPoint } from "../src/agent/followups.js";
import { acceptsMarketingOptIn, mayAskOptIn, optInQuestion, type OptInAnchor } from "../src/agent/opt-in.js";
import { config, ctx as gateCtx } from "./fixtures.js";

const brand = config.brand;
const now = new Date("2026-09-10T15:00:00Z");
const askedAt = new Date("2026-09-10T13:00:00Z");
/** The question the sweep sent two hours ago, and nothing sent after it. */
const anchor = (over: Partial<OptInAnchor> = {}): OptInAnchor => ({
  lastOutboundId: "msg-question",
  questionId: "msg-question",
  askedAt,
  now,
  ...over,
});
const stopPoints: StopPoint[] = ["before_size", "after_price", "link_sent"];
const leads = ["lead-0", "lead-1", "lead-2", "lead-3"];
const silence1 = (stopPoint: StopPoint, leadId: string) =>
  renderFollowup("silence_1", { leadId, config, stopPoint, now: new Date("2026-09-10T10:00:00") })!;

describe("opt-in de marketing: a pergunta", () => {
  it("cita a marca e não promete cupom", () => {
    expect(optInQuestion(brand)).toContain("Encorpa");
    expect(optInQuestion(brand)).not.toMatch(/cupom|desconto|%/i);
  });

  it("passa a cadeia de gates, sozinha", () => {
    const result = runGates(optInQuestion(brand), gateCtx({ now: new Date("2026-09-10T10:00:00"), stage: "presale" }));
    expect(result.traces.filter((t) => t.verdict === "block")).toEqual([]);
  });

  // The gate check above is not blind: the same question promising a coupon that does not
  // exist (the fixture's coupon is inactive) is vetoed.
  it("contraprova: a mesma pergunta prometendo cupom é vetada", () => {
    const withCoupon = optInQuestion(brand).replace("lembretes e ofertas", "lembretes e um cupom de 20%");
    const result = runGates(withCoupon, gateCtx({ now: new Date("2026-09-10T10:00:00"), stage: "presale" }));
    expect(result.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain("coupon_exists");
  });

  // Third review, 2026-09-28: in two bubbles, "sim" still answers the touch's own question.
  it("só sai depois de um toque que não pergunta nada: hoje, o silence_1 after_price", () => {
    for (const leadId of leads)
      for (const stopPoint of stopPoints)
        expect(mayAskOptIn(stopPoint, silence1(stopPoint, leadId), brand), `${stopPoint}/${leadId}`).toBe(stopPoint === "after_price");
  });

  it("se o after_price um dia ganhar uma pergunta, a pergunta de opt-in deixa de sair", () => {
    expect(mayAskOptIn("after_price", "Qualquer coisa é só chamar! Ficou alguma dúvida?", brand)).toBe(false);
  });

  it("marca vazia não pergunta: a Meta exige o nome da empresa", () => {
    expect(mayAskOptIn("after_price", silence1("after_price", "lead-0"), " ")).toBe(false);
  });
});

describe("opt-in de marketing: a resposta", () => {
  it.each([
    "sim", "Sim!", "SIM 💛", "siiim", "pode", "Pode sim", "pode mandar", "quero", "claro", "aceito", "Sim, pode.",
    "sim 👍", "sim ❤️", "*SIM*", "**SIM**", "sim 👍🏻", "👍🏾 sim", "sim 🙏🏻", "sim…", "sim ❤︎",
  ])("sim explícito: %s", (reply) => {
    expect(acceptsMarketingOptIn(reply, anchor())).toBe(true);
  });

  it.each([
    "não", "nao", "não obrigada", "agora não", "pode não", "melhor não", "não precisa",
    "sim, mas não quero oferta", "sim, só o pedido", "talvez", "depois eu vejo", "pode ser", "ok",
    "quero o M", "sim, quero o G", "SIMMM não", "",
    // Second review: a symbol may be the answer itself.
    "sim 👎", "sim❌", "sim ✖", "sim 🚫", "sim 🙄", "claro 🙄", "🙄 claro", "claro 😒", "sim 🤡",
    // A question back, in any script.
    "sim?", "pode mandar o quê?", "sim ¿", "pode¿", "sim ？",
    // One letter is the commonest typo.
    "s", "S!", "sss", "š",
    // Third review: struck-through text is an ironic no.
    "s̶i̶m̶", "s̵i̵m̵", "s̸i̸m̸", "c̶l̶a̶r̶o̶",
  ])("não é sim: %j", (reply) => {
    expect(acceptsMarketingOptIn(reply, anchor())).toBe(false);
  });

  it("sem pergunta gravada, sim não grava nada", () => {
    expect(acceptsMarketingOptIn("sim", anchor({ questionId: null, lastOutboundId: null, askedAt: null }))).toBe(false);
  });

  // Third review: pergunta às 13h, "fica o M, certo?" às 14h, "sim" às 14h01 — the last
  // outbound is no longer the question.
  it("sim a outra mensagem enviada depois da pergunta não é consentimento", () => {
    expect(acceptsMarketingOptIn("sim", anchor({ lastOutboundId: "msg-fica-o-m" }))).toBe(false);
  });

  it("depois de 24h da pergunta, sim não vale; antes, vale", () => {
    const at = (hours: number) => new Date(askedAt.getTime() + hours * 3_600_000);
    expect(acceptsMarketingOptIn("sim", anchor({ now: at(23.9) }))).toBe(true);
    expect(acceptsMarketingOptIn("sim", anchor({ now: at(24) }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", anchor({ now: at(240) }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", anchor({ now: at(-1) }))).toBe(false);
  });

  // Third review: NaN compared false both ways and let the reply through.
  it("data inválida conta como não", () => {
    expect(acceptsMarketingOptIn("sim", anchor({ askedAt: new Date(Number.NaN) }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", anchor({ askedAt: new Date("x") }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", anchor({ now: new Date("x") }))).toBe(false);
  });
});
