/**
 * The new offer (operator, 2026-10-27): R$ 109,90 on both paths, free shipping on both, kits 10%/20% the same on both, ONE Coinzz
 * checkout per quantity with both payment options inside, coupon and experiments off. Read from the artifact the operator pastes
 * into `BUSINESS_CONFIG` (`docs/operacao/business-config-2026-10-27.min.json`), through the real loader. Coverage comes from the
 * Coinzz query, the one the real checkout asks (Playwright, 2026-10-27): São Paulo G is prepaid only, GG has the door, the M is
 * 404 in every city and blocks the purchase on both paths.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { buildPrefilledCheckoutLink } from "@/agent/coinzz.js";
import { checkCoverage, healthOf, logzzIdsOf, lookupRegion, SIZE_CODES } from "@/agent/availability.js";
import {
  bothPrepayBubbles,
  codOfferText,
  funnelLinkMessage,
  offerKindOf,
  PREPAY_HEADLINE,
  prepayOfferText,
  sizeOutOfStockLine,
} from "@/agent/funnel.js";
import { noCodMessage, paymentFallbackMessage, priceBeforeCepMessage, offerFallbackMessage, systemPrompt } from "@/agent/prompt.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { renderFollowup } from "@/agent/followups.js";
import { ctx } from "./fixtures.js";

const FILE = "docs/operacao/business-config-2026-10-27.min.json";
const prod = loadBusinessConfig(FILE);
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, paymentPath: "cod" | "prepay", units = 1) =>
  runGates(text, ctx({ config: prod, paymentPath, units })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("o config de 27/10 carrega e diz a oferta nova", () => {
  it("um preço nos dois caminhos, sem desconto do antecipado, frete grátis, cupom e experimentos desligados", () => {
    expect(prod.prices).toMatchObject({ codBrl: 109.9, prepayBrl: 109.9, prepayDiscountPercent: 0, anchorBrl: 216.5 });
    expect(prod.delivery.freeShipping).toBe(true);
    expect(prod.coupon.active).toBe(false);
    expect(prod.experiments).toEqual({ fastOpening: false, linkAfterChoice: false });
  });

  it("um checkout da Coinzz por quantidade, o mesmo nos dois caminhos, e nada da Logzz", () => {
    expect(prod.checkout).toEqual({ codUrl: "https://app.coinzz.com.br/checkout/encorpa-0", prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-0" });
    expect(JSON.stringify(prod.kits)).not.toContain("logzz");
    for (const path of ["cod", "prepay"] as const) {
      expect(prod.kits?.filter((k) => k.path === path).map((k) => [k.units, k.priceBrl, k.discountPercent, k.checkoutUrl])).toEqual([
        [2, 197.82, 10, "https://app.coinzz.com.br/checkout/encorpa-site-0"],
        [3, 263.76, 20, "https://app.coinzz.com.br/checkout/oferta-site2-0"],
      ]);
    }
    // The kit prices are the percentages of the one price, to the cent.
    expect(+(109.9 * 2 * 0.9).toFixed(2)).toBe(197.82);
    expect(+(109.9 * 3 * 0.8).toFixed(2)).toBe(263.76);
  });

  it("a diferença para o config de 23/10 é só a oferta", () => {
    const before = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-23.min.json", "utf8"));
    const after = JSON.parse(readFileSync(FILE, "utf8"));
    for (const k of ["prices", "delivery", "coupon", "checkout", "kits", "experiments"]) {
      delete before[k];
      delete after[k];
    }
    expect(after).toEqual(before);
  });
});

describe("a caixa do antecipado e a da entrega, com o preço único e o frete grátis", () => {
  it("o antecipado sem a manchete de desconto, sem 0% e sem o valor do frete, mesmo com o frete lido", () => {
    const box = prepayOfferText(prod, 31.29);
    expect(box).not.toMatch(/desconto/i);
    expect(box).not.toContain("0%");
    expect(box).not.toContain("Frete pra sua região");
    expect(box).not.toContain("31,29");
    expect(box).toContain("⭐*~R$ 216,50~ POR R$ 109,90*⭐");
    expect(box).toContain("FRETE GRÁTIS");
  });

  it("a caixa do antecipado continua lida como antecipado, nunca como a da entrega", () => {
    expect(offerKindOf(prepayOfferText(prod), prod)).toBe("prepay");
    expect(offerKindOf(codOfferText(prod, undefined, new Date("2026-10-27T15:00:00Z")), prod)).toBe("cod");
  });

  it("negação: com o desconto no config, a manchete de desconto volta", () => {
    const old = { ...prod, prices: { ...prod.prices, prepayBrl: 98.91, prepayDiscountPercent: 10 } };
    expect(PREPAY_HEADLINE(old)).toBe("Você Ganhou um Desconto Adicional de *10%!!!*");
    expect(prepayOfferText(old)).toContain("Desconto Adicional de *10%!!!*");
  });

  it("negação: sem frete grátis, o frete lido volta à caixa", () => {
    const paid = { ...prod, delivery: { ...prod.delivery, freeShipping: false } };
    expect(prepayOfferText(paid, 31.29)).toContain("Frete pra sua região: *R$ 31,29*");
    expect(prepayOfferText(paid, 31.29)).not.toContain("FRETE GRÁTIS");
  });

  it("a da entrega: R$ 109,90 com frete grátis", () => {
    const box = codOfferText(prod, undefined, new Date("2026-10-27T15:00:00Z"));
    expect(box).toContain("POR R$ 109,90");
    expect(box).toContain("FRETE GRÁTIS");
  });

  it("o segundo link dos dois checkouts não promete desconto a 0%", () => {
    const [, box] = bothPrepayBubbles(prod, "Ana", "https://app.coinzz.com.br/checkout/encorpa-0");
    expect(box!.text).not.toMatch(/desconto/i);
    expect(box!.text).toContain("R$ 109,90");
    const old = { ...prod, prices: { ...prod.prices, prepayBrl: 98.91, prepayDiscountPercent: 10 } };
    expect(bothPrepayBubbles(old, "Ana", "x")[1]!.text).toContain("*Você Ganhou Mais 10% de Desconto!!*");
  });

  it("a mensagem do link: o kit de 2 e o de 3 nos dois caminhos, preço por peça", () => {
    for (const path of ["cod", "prepay"] as const) {
      const m = funnelLinkMessage(prod, "https://app.coinzz.com.br/checkout/encorpa-0", path, "Ana Souza", "G", 1);
      expect(m).toContain("R$ 109,90");
      expect(m).toContain("2 peças saem por apenas *R$ 98,91* cada!");
      expect(m).toContain("3 peças saem por apenas *R$ 87,92* cada!");
    }
  });
});

describe("o preço dito pela Malu lê o config, e passa a cadeia de gates", () => {
  it("antes do CEP: o preço único com o frete grátis, nos dois caminhos", () => {
    const text = priceBeforeCepMessage(prod);
    expect(text).toBe("O colete sai de R$ 216,50 por R$ 109,90, com frete grátis 😊");
    expect(blocked(text, "cod")).toEqual([]);
    expect(blocked(text, "prepay")).toEqual([]);
  });

  it("negação: com o frete pago, a frase antiga fica", () => {
    const paid = { ...prod, delivery: { ...prod.delivery, freeShipping: false } };
    expect(priceBeforeCepMessage(paid)).toBe("O colete sai de R$ 216,50 por R$ 109,90 pagando na entrega.");
  });

  it("nenhuma resposta pronta fala de desconto do antecipado", () => {
    for (const text of [noCodMessage(prod), offerFallbackMessage(prod), ...(["cod", "no_cod", "prepay", "both", null] as const).map((w) => paymentFallbackMessage(prod, w))]) {
      expect(text).not.toMatch(/\d+% de desconto/);
      expect(text).not.toContain("frete é calculado");
    }
  });

  it("o prompt não ensina a manchete de desconto nem o desconto do antecipado", () => {
    const prompt = systemPrompt(prod, gateBriefing(prod), null);
    expect(prompt).not.toContain("Você Ganhou um Desconto Adicional");
    expect(prompt).not.toMatch(/antecipado tem \d+% de desconto/);
    expect(prompt).toContain("O FRETE É GRÁTIS nos dois caminhos");
  });

  it("o kit, com o desconto do kit, passa nos dois caminhos", () => {
    for (const path of ["cod", "prepay"] as const) {
      expect(blocked(`Levando 2 peças o desconto sobe para 10%: R$ 197,82 ${path === "cod" ? "na entrega" : "no antecipado"}.`, path, 2)).toEqual([]);
      expect(blocked(`Levando 3 peças o desconto sobe para 20%: R$ 263,76 ${path === "cod" ? "na entrega" : "no antecipado"}.`, path, 3)).toEqual([]);
    }
  });

  it("a régua não cita desconto do antecipado", () => {
    for (const kind of ["silence_1", "checkout_reminder"] as const) {
      for (const paymentPath of ["cod", "prepay"] as const) {
        const text = renderFollowup(kind, { config: prod, leadId: "x", stopPoint: "after_price", paymentPath } as never);
        expect(text ?? "").not.toMatch(/\d+% de desconto/);
      }
    }
  });
});

describe("o link: o checkout da Coinzz recebe `document` e o telefone sem o 55, nos dois caminhos", () => {
  const her = { name: "Ana Souza", phone: "5511988887777", document: "52998224725" };
  it.each(["cod", "prepay"] as const)("%s", (path) => {
    const url = new URL(buildPrefilledCheckoutLink(her, path, prod.checkout));
    expect(url.origin + url.pathname).toBe("https://app.coinzz.com.br/checkout/encorpa-0");
    expect(url.searchParams.get("document")).toBe("52998224725");
    expect(url.searchParams.get("cpf")).toBeNull();
    expect(url.searchParams.get("phone")).toBe("11988887777");
  });
  it("negação: o checkout da Logzz segue com `cpf` e o 55", () => {
    const url = new URL(buildPrefilledCheckoutLink(her, "cod", { codUrl: "https://entrega.logzz.com.br/pay/ccm-1-unidade" }));
    expect(url.searchParams.get("cpf")).toBe("52998224725");
    expect(url.searchParams.get("document")).toBeNull();
    expect(url.searchParams.get("phone")).toBe("5511988887777");
  });
});

/** The Coinzz answers of 2026-10-27 (curl, the real query): SP G prepaid only, SP GG/XGG the door, M 404 everywhere. */
const window = { data: { local_operation: [{ price: 19.345 }], local_operation_cash_on_delivery: { delivery_days_available: [{ deliveryTypeCode: "x", deliveryTypeName: "Padrão", deliveryPrice: 0, deliverySameDay: 0, dates: [{ date: "2026-10-28" }] }] }, has_pending_cash_on_delivery: false } };
const noDoor = { data: { local_operation: [{ price: 31.291 }], local_operation_cash_on_delivery: { delivery_days_available: [] }, has_pending_cash_on_delivery: false } };
const sp = (opts: { m?: unknown } = {}) => {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Santo Amaro" };
    if (url.includes("logzz")) throw new Error("a Logzz não é mais perguntada");
    if (url.includes(SIZE_CODES.M)) return "m" in opts ? opts.m : null;
    return url.includes(SIZE_CODES.GG) || url.includes(SIZE_CODES.XGG) ? window : noDoor;
  };
  return { fetcher, asked };
};

describe("a cobertura vem da Coinzz, a consulta do checkout real", () => {
  it("sem `checkout.logzz` e com o codUrl na Coinzz, nenhum id da Logzz", () => {
    expect(logzzIdsOf(prod.checkout)).toBeNull();
  });

  it("São Paulo: o G só no antecipado, o GG com a porta, e a Logzz nunca é perguntada", async () => {
    const g = sp();
    expect(await lookupRegion(g.fetcher, "04710090", "G", logzzIdsOf(prod.checkout))).toMatchObject({ kind: "found", region: { cod: false, size: "G" } });
    expect(await lookupRegion(g.fetcher, "04710090", "GG", logzzIdsOf(prod.checkout))).toMatchObject({ kind: "found", region: { cod: true, size: "GG" } });
    expect(g.asked.some((u) => u.includes("logzz"))).toBe(false);
  });

  it("o alarme de cobertura pergunta sem tamanho: SP sadio enquanto algum tamanho tem a porta", async () => {
    expect(healthOf(await checkCoverage(sp().fetcher, ["01310100", "04710090", "04662002"], logzzIdsOf(prod.checkout)))).toBe("healthy");
    const none = async (url: string) => (url.includes("viacep") ? { localidade: "São Paulo", uf: "SP", bairro: "Centro" } : noDoor);
    expect(healthOf(await checkCoverage(none, ["01310100"], logzzIdsOf(prod.checkout)))).toBe("unhealthy");
  });

  it("a pendência de pagamento na entrega (por endereço) não apaga a porta da região", async () => {
    const pending = { data: { ...window.data, has_pending_cash_on_delivery: true } };
    const fetcher = async (url: string) => (url.includes("viacep") ? { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" } : pending);
    expect(await lookupRegion(fetcher, "01310100", "GG", null)).toMatchObject({ kind: "found", region: { cod: true } });
  });
});

describe("o M sem estoque: a Coinzz responde 404 pelo M e o checkout não vende o M em nenhum caminho", () => {
  it("o M dela sem resposta, com os outros tamanhos respondendo: sem estoque, sem porta", async () => {
    const r = await lookupRegion(sp().fetcher, "04710090", "M", null);
    expect(r).toMatchObject({ kind: "found", region: { cod: false, size: "M", sizeOutOfStock: true } });
  });

  it("negação: o M respondendo com a porta é estoque", async () => {
    const r = await lookupRegion(sp({ m: window }).fetcher, "04710090", "M", null);
    expect(r).toMatchObject({ kind: "found", region: { cod: true, size: "M" } });
    expect(r.kind === "found" && r.region.sizeOutOfStock).toBeFalsy();
  });

  it("negação: sem tamanho conhecido, a região é de qualquer tamanho, e nada fica sem estoque", async () => {
    const r = await lookupRegion(sp().fetcher, "04710090", null, null);
    expect(r.kind === "found" && r.region.sizeOutOfStock).toBeFalsy();
    expect(r).toMatchObject({ kind: "found", region: { cod: true } });
  });

  it("negação: o M que estoura o tempo é consulta falha, nunca sem estoque", async () => {
    const g = sp();
    const fetcher = async (url: string) => {
      if (url.includes(SIZE_CODES.M)) throw new Error("TimeoutError");
      return g.fetcher(url);
    };
    expect(await lookupRegion(fetcher, "04710090", "M", null)).toMatchObject({ kind: "failed" });
  });

  it("negação: nenhum tamanho respondendo é consulta falha, nunca sem estoque", async () => {
    const fetcher = async (url: string) => (url.includes("viacep") ? { localidade: "São Paulo", uf: "SP", bairro: "Centro" } : null);
    expect(await lookupRegion(fetcher, "04710090", "M", null)).toMatchObject({ kind: "failed" });
  });

  it("a linha honesta: sem estoque agora, aviso quando voltar, sem data, sem outro tamanho, e passa os gates", () => {
    const line = sizeOutOfStockLine("M");
    expect(line).toContain("M");
    expect(line).toMatch(/sem estoque/);
    expect(line).toMatch(/te aviso/);
    expect(line).not.toMatch(/\b(?:G|GG|P|XGG)\b/);
    expect(line).not.toMatch(/\d/);
    expect(line).not.toContain("http");
    expect(blocked(line, "cod")).toEqual([]);
    expect(blocked(line, "prepay")).toEqual([]);
    // As the turn gates her reply: her size known and the one the lookup answered for, the region without the door.
    for (const text of [line, "Assim que o M voltar eu te aviso aqui 💛"]) {
      for (const paymentPath of ["cod", "prepay"] as const) {
        const traces = runGates(text, ctx({ config: prod, paymentPath, knownSize: "M", sizeChecked: "M", codUnavailable: true, regionKnown: true })).traces;
        expect({ text, paymentPath, blocked: traces.filter((t) => t.verdict === "block").map((t) => t.gate) }).toEqual({ text, paymentPath, blocked: [] });
      }
    }
  });

  it("a turn: com o tamanho dela sem estoque, a linha honesta vai, uma vez com e-mail ao operador, e nenhum link sai", () => {
    expect(turn).toContain("const sizeOut = region?.sizeOutOfStock === true ? region.size ?? regionSize : null;");
    expect(turn).toContain("sizeOutOfStockLine(sizeOut)");
    expect(turn).toContain("const linkReady = sendLinkNow({ ...linkData, yesBesideQuestion }) && sizeOut === null;");
  });
});
