/**
 * The /code-review of 7aaf3a0 (turn v47, 2026-10-29), grafo §136: the M the Logzz delivers read as out of stock by the ruler, an
 * import whose local row failed restarting the close, the Pix touch lost to a later webhook or an older row, the cart's checkout
 * URL kept with her data and without a slug, one cart rule at arming and sending, and ViaCEP asked twice in a turn.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import {
  armsCartRecovery,
  cartCheckoutUrl,
  cartOrderSince,
  checkoutSlug,
  logzzSells,
  onOrderConfirmed,
  sizeSells,
  type ExistingFollowup,
} from "@/agent/followups.js";
import { importBlocksClose } from "@/agent/cod-close.js";
import { reuseViaCep, VIACEP_ENDPOINT } from "@/agent/availability.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-28.min.json");
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("1. o M que a Logzz entrega não é 'sem estoque' para a régua", () => {
  const mOut = { zip: "30130010", stockAware: true, sizeOutOfStock: true, askedSize: "M", size: "M" };
  it("logzzSells: só as datas da Logzz no mesmo CEP da região guardada", () => {
    expect(logzzSells("30130010", "30130-010", "dates")).toBe(true);
    expect(logzzSells("30130010", "30130010", "none")).toBe(false);
    expect(logzzSells("30130010", "01310100", "dates")).toBe(false);
    expect(logzzSells("30130010", undefined, undefined)).toBe(false);
    expect(logzzSells(undefined, undefined, "dates")).toBe(false);
  });
  it("sizeSells: o M sem estoque na Coinzz vende quando a Logzz entrega; sem ela, não", () => {
    expect(sizeSells(mOut, "M")).toBe(false);
    expect(sizeSells(mOut, "M", false)).toBe(false);
    expect(sizeSells(mOut, "M", true)).toBe(true);
    // Another size's answer is never hers, Logzz or not.
    expect(sizeSells(mOut, "G", true)).toBe(false);
  });
  it("a régua (scheduleSilenceTouches), a varredura e a retomada leem a mesma regra", () => {
    expect(turn).toContain("if (sizeOut || (at?.leads?.stock_out === \"true\" && !logzzSells(at.leads.stock_zip, at.leads.dates_cep, at.leads.dates_kind))) {");
    expect(turn).toContain("lead.address?.region?.sizeOutOfStock === true && !logzzSells(lead.address.region.zip, lead.address.codDates?.cep, lead.address.codDates?.result?.kind)");
    expect(turn).toContain("sizeSells: sizeSells(lead.address?.region ?? null, lead.size ?? null, logzzSells(lead.address?.region?.zip, lead.address?.codDates?.cep, lead.address?.codDates?.result?.kind)),");
  });
});

describe("2. o pedido importado com a linha local que falhou não reabre o fechamento", () => {
  const at = "2026-10-29T15:00:00.000Z";
  it("importBlocksClose: bloqueia até um webhook gravar um pedido dela depois da importação", () => {
    expect(importBlocksClose(undefined, [])).toBe(false);
    expect(importBlocksClose({}, [])).toBe(false);
    expect(importBlocksClose({ importedAt: at, orderCode: "LZ1" }, [])).toBe(true);
    // A returning buyer: her old delivered order does not end the block.
    expect(importBlocksClose({ importedAt: at, orderCode: "LZ1" }, [{ updated_at: "2026-10-20T10:00:00+00:00" }])).toBe(true);
    // The webhook filed an order of hers after the import (Postgres' "+00:00" against the "Z" kept here).
    expect(importBlocksClose({ importedAt: at, orderCode: "LZ1" }, [{ updated_at: "2026-10-29T15:00:05.1+00:00" }])).toBe(false);
  });
  it("o turno confere o recordOrder, tenta mais uma vez, marca a importação e avisa o operador", () => {
    expect(turn).toContain("const filedOk = (await fileImport()) || (await fileImport());");
    expect(turn).toContain("await saveAddress({ codClose: filedOk ? {} : { orderCode: result.orderCode, importedAt: new Date().toISOString() } });");
    expect(turn).toContain("if (!filedOk) extraNotify = [extraNotify, `pedido ${result.orderCode} criado na Logzz e não gravado em orders");
    expect(turn).toContain("!importBlocksClose(storedAddress.codClose, herStatuses) &&");
    expect(turn).not.toContain("customerName: close.order.name,\n          }).catch(() => null);");
  });
});

describe("3. o toque do Pix", () => {
  const at = new Date("2026-10-29T15:00:00Z");
  it("um Pix de um pedido novo rearma a linha que o pedido anterior deixou cancelada ou enviada", () => {
    for (const status of ["canceled", "sent"] as const) {
      const rows: ExistingFollowup[] = [{ kind: "pix_pending", status, orderId: "o1" }];
      const e = onOrderConfirmed(rows, at, at, "Aguardando pagamento", "o2", null, true);
      expect(e.arm).toEqual([]);
      expect(e.move.map((f) => f.kind)).toEqual(["pix_pending"]);
      expect(e.move[0]!.runAt.getTime() - at.getTime()).toBe(30 * 60_000);
    }
  });
  it("o mesmo pedido, um toque ainda agendado ou um pedido sem Pix não rearmam", () => {
    expect(onOrderConfirmed([{ kind: "pix_pending", status: "sent", orderId: "o1" }], at, at, "Aguardando pagamento", "o1", null, true).move).toEqual([]);
    expect(onOrderConfirmed([{ kind: "pix_pending", status: "scheduled", orderId: "o1" }], at, at, "Aguardando pagamento", "o2", null, true).move).toEqual([]);
    expect(onOrderConfirmed([{ kind: "pix_pending", status: "canceled", orderId: "o1" }], at, at, "Aguardando pagamento", "o2", null, false).move).toEqual([]);
  });
  it("o webhook de status sem o Pix lê o Pix guardado do pedido (recordOrder), e a linha enviada também é rearmada", () => {
    expect(turn).toContain("const pix = Boolean(merged.pixCode || merged.pixUrl);");
    expect(turn).toContain("kind=eq.${f.kind}${f.kind === \"pix_pending\" ? \"\" : \"&status=neq.sent\"}");
  });
});

describe("4. o lead do checkout com o mesmo telefone em corrida", () => {
  it("checkoutLead faz upsert pelo telefone (leads_phone_key)", () => {
    expect(turn).toContain("db(\"leads?on_conflict=phone\", { method: \"POST\", headers: { Prefer: \"resolution=merge-duplicates,return=representation\" }, body: JSON.stringify({ phone }) })");
  });
});

describe("5. o checkout do carrinho guardado", () => {
  const checkout = prod.checkout;
  const kits = prod.kits ?? [];
  it("sem a query (CPF, e-mail e telefone dos nossos links)", () => {
    expect(cartCheckoutUrl("https://app.coinzz.com.br/checkout/encorpa-0?document=52998224725&email=a%40b.com&phone=11987654321", 1, checkout, kits))
      .toBe("https://app.coinzz.com.br/checkout/encorpa-0");
    expect(cartCheckoutUrl("https://app.coinzz.com.br/checkout/oferta-site2-0#x", 3, checkout, kits)).toBe("https://app.coinzz.com.br/checkout/oferta-site2-0");
  });
  it("URL que o checkoutSlug não lê: o checkout do config pela quantidade", () => {
    const test = "https://checkout.coinzz.com.br/cart/abc123";
    expect(checkoutSlug(test)).toBeNull();
    expect(checkoutSlug(cartCheckoutUrl(test, 1, checkout, kits))).toBe("encorpa-0");
    expect(checkoutSlug(cartCheckoutUrl(test, 2, checkout, kits))).toBe("encorpa-site-0");
    expect(checkoutSlug(cartCheckoutUrl(null, 3, checkout, kits))).toBe("oferta-site2-0");
  });
  it("sem quantidade, ou uma quantidade sem kit, nada se inventa", () => {
    expect(cartCheckoutUrl("https://checkout.coinzz.com.br/cart/abc123", null, checkout, kits)).toBeNull();
    expect(cartCheckoutUrl("https://checkout.coinzz.com.br/cart/abc123", 5, checkout, kits)).toBeNull();
    expect(cartCheckoutUrl("https://checkout.coinzz.com.br/cart/abc123", 1, undefined, [])).toBeNull();
  });
  it("recordCart guarda pelo cartCheckoutUrl", () => {
    expect(turn).toContain("checkoutUrl: cartCheckoutUrl(cart.checkoutUrl, cartQuantity, CONFIG.checkout, CONFIG.kits ?? []),");
  });
});

describe("6. uma regra só para o carrinho: o pedido das 24 h antes dele, ou depois", () => {
  it("cartOrderSince", () => {
    const cartAt = new Date("2026-10-29T15:00:00Z");
    expect(cartOrderSince(cartAt).toISOString()).toBe("2026-10-28T15:00:00.000Z");
  });
  it("armar (recordCart) e mandar (a varredura) usam o mesmo corte; a cliente que já comprou antes recebe", () => {
    expect(turn).toContain("created_at=gte.${encodeURIComponent(cartOrderSince(now).toISOString())}");
    expect(turn).toContain("(lead.orders ?? []).some((o: { created_at: string }) => Date.parse(o.created_at) >= cartOrderSince(new Date(cart.at)).getTime())");
    expect(turn).not.toContain("statuses.some((st: string) => !isOrderDead(st))) {\n        await leave(\"canceled\");\n        skipped.push({ followupId: row.id, reason: !cart");
    expect(armsCartRecovery({ optedOut: false, hasOrder: false, cartTouchSent: false, checkoutReminderPending: false, lastInboundAt: null, now: new Date() })).toBe(true);
  });
});

describe("7. o ViaCEP uma vez por turno, e as datas da Logzz junto com o kit", () => {
  const url = `${VIACEP_ENDPOINT}/30130010/json/`;
  it("reuseViaCep: a mesma resposta do ViaCEP não é pedida de novo", async () => {
    let calls = 0;
    const f = reuseViaCep(new Map(), async () => (calls++, { logradouro: "Rua A", bairro: "Centro" }));
    expect(await f(url)).toEqual({ logradouro: "Rua A", bairro: "Centro" });
    expect(await f(url)).toEqual({ logradouro: "Rua A", bairro: "Centro" });
    expect(calls).toBe(1);
  });
  it("uma falha (null, erro) nunca fica guardada: a próxima pergunta vai de novo", async () => {
    let calls = 0;
    const f = reuseViaCep(new Map(), async () => {
      calls++;
      if (calls === 1) throw new Error("timeout");
      return calls === 2 ? null : { logradouro: "Rua A" };
    });
    await expect(f(url)).rejects.toThrow("timeout");
    expect(await f(url)).toBeNull();
    expect(await f(url)).toEqual({ logradouro: "Rua A" });
    expect(calls).toBe(3);
  });
  it("o que não é ViaCEP, ou vai com cabeçalhos, passa direto", async () => {
    let calls = 0;
    const f = reuseViaCep(new Map(), async () => (calls++, { ok: 1 }));
    await f("https://app.coinzz.com.br/x");
    await f("https://app.coinzz.com.br/x");
    await f(url, { "X-Requested-With": "XMLHttpRequest" });
    await f(url, { "X-Requested-With": "XMLHttpRequest" });
    expect(calls).toBe(4);
  });
  it("o turno usa o mesmo cache na região, no kit e no cepBody; as datas começam antes do kit", () => {
    expect(turn).toContain("const cepBody = closeOn\n    ? ((await cepFetcher(REGION_TIMEOUT_MS)(");
    expect(turn.indexOf("const datesLook =")).toBeGreaterThan(0);
    expect(turn.indexOf("const datesLook =")).toBeLessThan(turn.indexOf("region = kitRegion(region, regionSize, answers);"));
  });
});
