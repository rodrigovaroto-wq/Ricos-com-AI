/**
 * The Opus review of 481f2d3 (2026-10-27, rejected): the size-out-of-stock path still offered the prepaid, asked the name, chased
 * her with the ruler, missed an out-of-stock piece by its place in the kit, fell back to an offer after five vetoes, recorded the
 * line as said when it was not, and let a prepaid discount pass where the config has none. Grafo §134.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { cachedRegion, kitRegion, type CachedRegion, type Region, type RegionLookup } from "@/agent/availability.js";
import { sizeOutFallback, sizeOutLineSent, sizeOutOfStockLine } from "@/agent/funnel.js";
import { regionDirectiveFor, systemPrompt } from "@/agent/prompt.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { config as fixture, ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-27.min.json");
/** The offer before 27/10: 10% off on the prepaid. */
const discounted = { ...fixture, prices: { ...fixture.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 } };
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const vetoes = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ config: prod, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const base: Region = { zip: "04710-090", place: { city: "São Paulo", state: "SP", district: "Centro" }, cod: true, dates: ["2026-10-28"], sameDay: false, labelBrl: null, size: "GG" };
const found = (over: Partial<Region>): RegionLookup => ({ kind: "found", region: { ...base, ...over } });

describe("1. tamanho sem estoque: nenhuma diretiva de caminho", () => {
  it("regionDirectiveFor devolve nada com o tamanho sem estoque, em qualquer região", () => {
    expect(regionDirectiveFor({ cod: false, sameDay: false }, null, false, false, false, prod.prices, "M")).toBeNull();
    expect(regionDirectiveFor({ cod: true, sameDay: false }, "prepay", false, false, false, prod.prices, "M")).toBeNull();
    // Negation: no size out, the directive is there.
    expect(regionDirectiveFor({ cod: false, sameDay: false }, null, false, false, false, prod.prices, null)).toContain("siga no antecipado");
  });
  it("o turno passa o sizeOut à diretiva da região e cala a pergunta de nome/CPF", () => {
    expect(turn).toContain("CONFIG.prices, sizeOut, oneCheckout(CONFIG.checkout?.codUrl, CONFIG.checkout?.prepayUrl)),");
    expect(turn).toContain(": sizeOut !== null || linkNow || linkAlreadySent");
  });
});

describe("5. o desconto do antecipado vem do config (27/10: nenhum)", () => {
  it("sem desconto no config, a diretiva não fala de desconto do antecipado; com desconto, fala", () => {
    for (const d of [
      regionDirectiveFor({ cod: false, sameDay: false }, null, false, false, false, prod.prices),
      regionDirectiveFor({ cod: true, sameDay: false }, "prepay", false, false, false, prod.prices),
      regionDirectiveFor({ cod: true, sameDay: false }, null, false, false, false, prod.prices),
    ]) expect(d).not.toMatch(/com o desconto|o desconto do antecipado/);
    expect(regionDirectiveFor({ cod: true, sameDay: false }, null, false, false, false, prod.prices)).toContain("o preço é o mesmo, R$ 109,90");
    expect(regionDirectiveFor({ cod: true, sameDay: false }, null, false, false, false, discounted.prices)).toContain("diga o desconto do antecipado");
  });
  it("o prompt de 27/10 não ensina o desconto do antecipado; o de antes, sim", () => {
    expect(systemPrompt(prod, gateBriefing(prod), null)).not.toContain("o desconto do antecipado e dos kits");
    expect(systemPrompt(prod, gateBriefing(prod), null)).toContain("o desconto dos kits");
    expect(systemPrompt(discounted, gateBriefing(discounted), null)).toContain("o desconto do antecipado e dos kits");
  });
  it("o gate veta desconto do antecipado quando o config não tem (a frase do prompt antigo)", () => {
    expect(vetoes("Pagando no Pix antecipado tem desconto 😊", { paymentPath: "prepay" })).toContain("price_promise");
    expect(vetoes("No pix sai mais barato pra você!", { paymentPath: "prepay" })).toContain("price_promise");
    expect(vetoes("Se pagar antes, tem um desconto especial.", { paymentPath: "prepay" })).toContain("price_promise");
  });
  it("negação: o que é verdade passa", () => {
    expect(vetoes("No Pix o preço é o mesmo, não tem desconto a mais.", { paymentPath: "prepay" })).not.toContain("price_promise");
    expect(vetoes("Pagando no Pix fica sem desconto, o mesmo R$ 109,90.", { paymentPath: "prepay" })).not.toContain("price_promise");
    expect(vetoes("O kit de 2 no Pix sai com 10% de desconto.", { paymentPath: "prepay", units: 2 })).not.toContain("price_promise");
    expect(vetoes("Na entrega ou no Pix, o desconto de 40% do site já está no preço.", { paymentPath: "cod" })).not.toContain("price_promise");
  });
  it("com desconto no config, a frase do desconto do antecipado continua passando", () => {
    const blocked = runGates("Pagando no Pix antecipado tem 10% de desconto 😊", ctx({ config: discounted, paymentPath: "prepay" })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
    expect(blocked).not.toContain("price_promise");
  });
});

describe("2. a régua não persegue quem ouviu que o tamanho dela acabou", () => {
  it("scheduleSilenceTouches sai cancelando tudo com o sizeOut do turno ou a região guardada sem estoque", () => {
    const fn = turn.slice(turn.indexOf("const scheduleSilenceTouches = async"), turn.indexOf("/** How close to a reply the checkout touch may go (L2). */"));
    const exit = fn.indexOf('if (sizeOut || (at?.leads?.stock_out === "true" && !logzzSells(at.leads.stock_zip, at.leads.dates_cep, at.leads.dates_kind))) {');
    expect(exit).toBeGreaterThan(-1);
    expect(fn.indexOf("rulerFor(")).toBeGreaterThan(exit);
    expect(fn).toContain("stock_out:address->region->>sizeOutOfStock");
    expect(turn).toContain("    endsWithQuestion(replyText),\n    sizeOut !== null,\n  );");
    // At send time too: a touch armed before (or by a deferred reply) to a size out of stock never goes.
    expect(turn).toContain("if (inSilenceRuler(kind) && lead.address?.region?.sizeOutOfStock === true && !logzzSells(lead.address.region.zip, lead.address.codDates?.cep, lead.address.codDates?.result?.kind)) {");
  });
});

describe("3. kit com uma peça sem estoque, em qualquer posição e em qualquer caminho", () => {
  const out = found({ cod: false, dates: [], size: "M", sizeOutOfStock: true });
  const noCod = found({ cod: false, dates: [], size: "P" });
  const cod = found({ cod: true, size: "XGG" });
  it("o M depois de uma peça sem entrega ainda é lido como sem estoque (antes, só a primeira peça sem entrega contava)", () => {
    const r = kitRegion(base, "GG", [{ s: "P", r: noCod }, { s: "M", r: out }]);
    expect(r).toMatchObject({ sizeOutOfStock: true, size: "M", cod: false });
  });
  it("o tamanho dela sem a entrega e o M no kit: sem estoque, nunca o link do antecipado com o M", () => {
    const r = kitRegion({ ...base, cod: false, dates: [] }, "GG", [{ s: "M", r: out }]);
    expect(r).toMatchObject({ sizeOutOfStock: true, size: "M" });
  });
  it("negação: todas as peças com estoque e entrega, o kit segue na entrega; uma sem entrega, antecipado com o motivo", () => {
    expect(kitRegion(base, "GG", [{ s: "XGG", r: cod }])).toBe(base);
    expect(kitRegion(base, "GG", [{ s: "XGG", r: cod }, { s: "P", r: noCod }])).toMatchObject({ cod: false, size: "P", otherSizesInStock: ["GG"] });
    expect(kitRegion(base, "GG", [{ s: "P", r: { kind: "failed" } }])).toMatchObject({ cod: false, size: "P" });
    expect(kitRegion({ ...base, cod: false }, "GG", [{ s: "P", r: noCod }]).sizeOutOfStock).toBeUndefined();
  });
  it("o turno pergunta as peças do kit também onde o tamanho dela não tem a entrega", () => {
    expect(turn).toContain("if (region && !region.sizeOutOfStock && units > 1 && addressDraft.cep) {");
    expect(turn).toContain("region = kitRegion(region, regionSize, answers);");
  });
});

describe("4. depois de cinco vetos, a linha do estoque; e o motivo só se ela saiu", () => {
  it("o fallback é a linha do estoque (ou a curta, se já dita), nunca uma oferta de caminho", () => {
    expect(sizeOutFallback("M", false)).toBe(sizeOutOfStockLine("M"));
    expect(sizeOutFallback("M", true)).toBe("Assim que o M voltar eu te aviso aqui 💛");
    for (const t of [sizeOutFallback("M", false), sizeOutFallback("M", true)]) {
      expect(t).not.toMatch(/antecipado|correios|entrega|link|pix/i);
      expect(vetoes(t, { paymentPath: "prepay", knownSize: "M" })).toEqual([]);
    }
    expect(turn).toContain(": sizeOut !== null ? sizeOutFallback(sizeOut, sizeOutSaid)");
  });
  it("sizeOutLineSent: a resposta disse que acabou", () => {
    expect(sizeOutLineSent(sizeOutOfStockLine("M"), "M")).toBe(true);
    expect(sizeOutLineSent("Poxa, o M esgotou e está esgotado agora 😔", "M")).toBe(true);
    expect(sizeOutLineSent("O M está em falta no momento.", "M")).toBe(true);
  });
  it("negação: não disse, ou disse que NÃO acabou, não marca", () => {
    expect(sizeOutLineSent("O colete modela a cintura na hora 😊", "M")).toBe(false);
    expect(sizeOutLineSent("O G não está sem estoque, pode ficar tranquila.", "M")).toBe(false);
    expect(sizeOutLineSent("Ainda não esgotou, viu?", "M")).toBe(false);
    expect(sizeOutLineSent(sizeOutOfStockLine("M"), null)).toBe(false);
  });
  it("o turno grava SIZE_OUT_REASON só quando a linha saiu", () => {
    expect(turn).toContain("...guideReasons.filter((r) => r !== SIZE_OUT_REASON || sizeOutLineSent(replyText, sizeOut))");
  });
});

describe("6. cache da região de antes da leitura do estoque", () => {
  it("sem stockAware não é servido; a turn grava com stockAware", () => {
    const old: CachedRegion = { ...base, size: "M", askedSize: "M", checkedAt: new Date(Date.parse("2026-10-27T15:00:00Z")).toISOString() };
    expect(cachedRegion(old, "04710-090", Date.parse("2026-10-27T15:10:00Z"), "M")).toBeNull();
    expect(cachedRegion({ ...old, stockAware: true }, "04710-090", Date.parse("2026-10-27T15:10:00Z"), "M")).not.toBeNull();
    expect(turn).toContain("checkedAt: new Date().toISOString(), stockAware: true };");
  });
});
