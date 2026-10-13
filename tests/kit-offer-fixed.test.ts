import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { kitHoldsLink, kitWasOffered } from "@/agent/interpret.js";
import { kitOfferMessage } from "@/agent/retry.js";
import type { BusinessConfig } from "@/config/business.js";
import { config, ctx } from "./fixtures.js";

const turn = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
const kits = (JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig).kits ?? [];
const withKits: BusinessConfig = { ...config, kits };

// /code-review of experiment B: the link waited for an offer the model wrote, and an offer without
// "kit"/"N peças"/the exact price was never read as made — the link held turn after turn.
describe("braço B: a oferta do kit que segura o link é fixa", () => {
  it.each(["cod", "prepay"] as const)("o texto fixo passa a cadeia de gates e é lido como oferta (%s)", (path) => {
    const onPath = kits.filter((k) => k.path === path).sort((a, b) => a.units - b.units);
    expect(onPath.length).toBeGreaterThan(0);
    const text = kitOfferMessage(onPath);
    const blocked = runGates(text, ctx({ config: withKits, paymentPath: path })).traces.filter((t) => t.verdict === "block");
    expect(blocked).toEqual([]);
    for (const k of onPath) expect(text).toContain(`${k.discountPercent}% de desconto`);
    const prices = onPath.map((k) => k.priceBrl);
    expect(kitWasOffered([text], prices)).toBe(true);
    // Each half alone would be read too: the "N peças" and the exact prices.
    expect(kitWasOffered([text.replace(/\d+ peças/g, "")], prices)).toBe(true);
    expect(kitWasOffered([text], [])).toBe(true);
  });

  it("depois de um turno com kitFirst, o seguinte tem kitOffered — o link nunca é segurado duas vezes seguidas", () => {
    const onPath = kits.filter((k) => k.path === "cod");
    const b = { identityAtCheckout: true, units: 1, kitsOnPath: onPath.length, pathChosen: true, linkSentBefore: false };
    const held = kitHoldsLink({ ...b, kitOffered: kitWasOffered(["Qual das duas fica melhor pra você?"], onPath.map((k) => k.priceBrl)) });
    expect(held).toBe(true);
    // The turn that held sends kitOfferMessage; it is the newest outbound on the next turn.
    const next = kitWasOffered(["Qual das duas fica melhor pra você?", kitOfferMessage(onPath)], onPath.map((k) => k.priceBrl));
    expect(kitHoldsLink({ ...b, kitOffered: next })).toBe(false);
  });

  it("o turno manda a oferta fixa exatamente quando o kit segura o link, e só sem pergunta ao lado", () => {
    expect(turn).toContain("  if (linkUnheld && kitFirst && !farewell) {");
    expect(turn).toContain("opening(kitOfferMessage(kitsOnPath))");
    // Her question beside it: the link does not wait (the model's offer is what looped).
    expect(turn).toMatch(/linkSentBefore: lastLinkBase\(linkHistory, CHECKOUT_BASES\) !== null,\n {2}\}\) && !clauses\.some\(\(q: string\) => asksSomething\(q\) && !buyerAsk\(q\)\);/);
    expect(turn.indexOf("const clauses =")).toBeLessThan(turn.indexOf("const kitFirst = kitHoldsLink("));
    // After the link's own fixed send, before the model: arm 0 never reaches it (kitHoldsLink is false there).
    expect(turn.indexOf("opening(kitOfferMessage(kitsOnPath))")).toBeGreaterThan(turn.indexOf("opening(linkMessage("));
    expect(turn.indexOf("opening(kitOfferMessage(kitsOnPath))")).toBeLessThan(turn.indexOf("const kitOfferNow ="));
  });

  it("braço 0 e sem flag: kitFirst nunca é verdadeiro, então nem a oferta fixa nem a espera", () => {
    const b = { units: 1, kitsOnPath: 2, kitOffered: false, pathChosen: true, linkSentBefore: false };
    expect(kitHoldsLink({ ...b, identityAtCheckout: false })).toBe(false);
    expect(kitHoldsLink(b)).toBe(false);
  });
});

describe("revisão dos candidatos da v19", async () => {
  const { kitOfferMessage } = await import("@/agent/retry.js");
  const { readInterpretation, offersPrepayOnly } = await import("@/agent/interpret.js");
  const { readFileSync } = await import("node:fs");
  const kits = [
    { units: 2, priceBrl: 233.82, discountPercent: 10 },
    { units: 3, priceBrl: 311.76, discountPercent: 20 },
  ];
  it("A: a oferta termina numa contagem que ela responde, e 'mais de uma' guarda a quantidade do modelo", () => {
    expect(kitOfferMessage(kits)).toMatch(/Quer de 2, de 3 ou só uma peça\?$/);
    expect(typeof readInterpretation).toBe("function");
  });
  it("2: braço B em região sem pagamento na entrega — o 'manda o link' depois da oferta do antecipado é a escolha dela", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain("(knownRegion?.cod === false && interpretation.wants_to_buy && recentOutbound.some((m: string) => offersPrepayOnly(m))),");
    expect(offersPrepayOnly("Aí na sua região o pagamento na entrega não chega, mas dá pra fazer no antecipado. Pode ser no antecipado?")).toBe(true);
  });
});
