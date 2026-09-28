import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
import { renderFollowup, type StopPoint } from "../src/agent/followups.js";
import { acceptsMarketingOptIn, optInQuestion, type OptInAnchor } from "../src/agent/opt-in.js";
import { config, ctx as gateCtx } from "./fixtures.js";

const brand = config.brand;
const now = new Date("2026-09-10T15:00:00Z");
const askedAt = new Date("2026-09-10T13:00:00Z");
/** The question sent alone by the sweep two hours ago, and nothing after it. */
const anchor = (over: Partial<OptInAnchor> = {}): OptInAnchor => ({ lastOutbound: optInQuestion(brand), askedAt, now, ...over });
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
});

describe("opt-in de marketing: a resposta", () => {
  it.each(["sim", "Sim!", "SIM 💛", "siiim", "pode", "Pode sim", "pode mandar", "quero", "claro", "aceito", "Sim, pode.", "sim 👍", "sim ❤️"])(
    "sim explícito: %s",
    (reply) => {
      expect(acceptsMarketingOptIn(reply, brand, anchor())).toBe(true);
    },
  );

  it.each([
    "não", "nao", "não obrigada", "agora não", "pode não", "melhor não", "não precisa",
    "sim, mas não quero oferta", "sim, só o pedido", "talvez", "depois eu vejo", "pode ser", "ok",
    "quero o M", "sim, quero o G", "SIMMM não", "",
    // Second review, 2026-09-28: a symbol may be the answer itself.
    "sim 👎", "sim❌", "sim ✖", "sim 🚫", "sim 🙄", "claro 🙄", "🙄 claro", "claro 😒", "sim 🤡",
    // A question back, in any script.
    "sim?", "pode mandar o quê?", "sim ¿", "pode¿", "sim ？",
    // One letter is the commonest typo.
    "s", "S!", "sss", "š",
  ])("não é sim: %j", (reply) => {
    expect(acceptsMarketingOptIn(reply, brand, anchor())).toBe(false);
  });

  it("sim sem a pergunta antes não grava nada", () => {
    expect(acceptsMarketingOptIn("sim", brand, anchor({ lastOutbound: null, askedAt: null }))).toBe(false);
  });

  // Second review, 2026-09-28: inside the first touch, "sim" answers the touch's own
  // question ("Conseguiu finalizar seu pedido?"), not the opt-in one.
  it.each(stopPoints)("a pergunta dentro do silence_1 (%s) não é âncora", (stopPoint) => {
    for (const leadId of leads) {
      const inside = `${silence1(stopPoint, leadId)}\n\n${optInQuestion(brand)}`;
      for (const reply of ["sim", "pode", "quero", "claro"])
        expect(acceptsMarketingOptIn(reply, brand, anchor({ lastOutbound: inside })), `${stopPoint}/${leadId}/${reply}`).toBe(false);
    }
  });

  it("o modelo citando a pergunta não é âncora", () => {
    const quoted = `Como te falei: "${optInQuestion(brand)}" — então, quer o M?`;
    expect(acceptsMarketingOptIn("sim", brand, anchor({ lastOutbound: quoted }))).toBe(false);
  });

  it("sim a outra pergunta da agente, depois da de opt-in, não é consentimento", () => {
    expect(acceptsMarketingOptIn("sim", brand, anchor({ lastOutbound: "Perfeito! Então fica o M, certo?" }))).toBe(false);
  });

  it("a pergunta de outra marca não vale", () => {
    expect(acceptsMarketingOptIn("sim", brand, anchor({ lastOutbound: optInQuestion("Outra") }))).toBe(false);
  });

  it("depois de 24h da pergunta, sim não vale; antes, vale", () => {
    const at = (hours: number) => new Date(askedAt.getTime() + hours * 3_600_000);
    expect(acceptsMarketingOptIn("sim", brand, anchor({ now: at(23.9) }))).toBe(true);
    expect(acceptsMarketingOptIn("sim", brand, anchor({ now: at(24) }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", brand, anchor({ now: at(240) }))).toBe(false);
    expect(acceptsMarketingOptIn("sim", brand, anchor({ now: at(-1) }))).toBe(false);
  });
});
