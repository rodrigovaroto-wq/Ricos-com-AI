/**
 * 4.7, the prepaid freight: the 1-piece prepaid checkout charges the `stock-and-delivery-day` `local_operation[0].price` of
 * her CEP and size, rounded to the cent (Playwright of 2026-10-20, grafo §116: São Paulo GG 19.345 → "Frete: R$ 19,35").
 * Any failure is `null`: the reply keeps "aparece no checkout".
 */
import { describe, expect, it } from "vitest";
import { AVAILABILITY_ENDPOINT, AVAILABILITY_HEADERS, prepayFreight, SIZE_CODES } from "@/agent/availability.js";

const SP = { city: "São Paulo", state: "SP", district: "Bela Vista" };
/** The real answer's shape for São Paulo (`tests/availability.test.ts`). */
const answer = (price: unknown) => ({
  data: {
    products: [{ code: SIZE_CODES.GG, stock: "1", delivery_date: null }],
    has_local_operation_cash_on_delivery: false,
    has_pending_cash_on_delivery: false,
    local_operation: price === undefined ? [] : [{ price }],
    local_operation_cash_on_delivery: { delivery_days_available: [] },
  },
});

describe("prepayFreight: o frete do antecipado pelo CEP dela", () => {
  it("lê o frete e arredonda como a página (19.345 → 19,35; 17.775 → 17,78)", async () => {
    expect(await prepayFreight(async () => answer(19.345), "01310100", SP, "GG")).toBe(19.35);
    expect(await prepayFreight(async () => answer(17.775), "01310100", SP, "XGG")).toBe(17.78);
  });

  it("CEP com hífen vai só com dígitos, com o header de XHR e sem dado dela", async () => {
    const asked: Array<{ url: string; headers: Readonly<Record<string, string>> | undefined }> = [];
    await prepayFreight(async (url, headers) => (asked.push({ url, headers }), answer(28.67)), "01310-100", SP, "P");
    expect(asked).toHaveLength(1);
    const u = new URL(asked[0]!.url);
    expect(u.origin + u.pathname).toBe(AVAILABILITY_ENDPOINT);
    expect(u.searchParams.get("zip_code")).toBe("01310100");
    expect(u.searchParams.get("products[0][code]")).toBe(SIZE_CODES.P);
    expect(u.searchParams.get("customer_phone")).toBe("11900000000");
    expect(u.searchParams.get("customer_document")).toBe("27944872804");
    expect(u.searchParams.has("customer_name")).toBe(false);
    expect(asked[0]!.headers).toEqual(AVAILABILITY_HEADERS);
  });

  it("falha, timeout, 404 do M ou preço ilegível: null, nunca lança", async () => {
    const cases: Array<() => Promise<unknown>> = [
      async () => { throw new Error("timeout"); },
      () => { throw new Error("sync"); },
      async () => null,
      async () => ({}),
      async () => "<html>",
      async () => answer(undefined),
      async () => answer("19.34"),
      async () => answer(0),
      async () => answer(NaN),
      async () => ({ data: { local_operation: "x" } }),
    ];
    for (const f of cases) expect(await prepayFreight(f as never, "01310100", SP, "M")).toBeNull();
  });
});

describe("preço em notação exponencial (/code-review do PR 77)", () => {
  it("5e-7 e 1e21 dão null, nunca NaN", async () => {
    for (const price of [5e-7, 1e21]) {
      const got = await prepayFreight(async () => answer(price), "01310100", SP, "GG");
      expect(got).toBeNull();
    }
  });
});

describe("o frete do kit: cada tamanho na mesma consulta, como o checkout do kit (Playwright de 2026-10-22)", () => {
  const ask = async (sizes: Parameters<typeof prepayFreight>[3]) => {
    const asked: string[] = [];
    const got = await prepayFreight(async (url) => (asked.push(url), answer(33.172)), "01310100", SP, sizes);
    return { got, q: new URL(asked[0] ?? "http://x/").searchParams, calls: asked.length };
  };

  it("G+GG: dois produtos de 1 peça, uma consulta, o frete da consulta", async () => {
    const { got, q, calls } = await ask(["G", "GG"]);
    expect(calls).toBe(1);
    expect(got).toBe(33.17);
    expect([q.get("products[0][code]"), q.get("products[0][quantity]")]).toEqual([SIZE_CODES.G, "1"]);
    expect([q.get("products[1][code]"), q.get("products[1][quantity]")]).toEqual([SIZE_CODES.GG, "1"]);
    expect(q.get("products[1][product_id]")).toBe(q.get("products[0][product_id]"));
    expect(q.has("products[2][code]")).toBe(false);
  });

  it("GG+GG: um produto com quantidade 2", async () => {
    const { q } = await ask(["GG", "GG"]);
    expect([q.get("products[0][code]"), q.get("products[0][quantity]")]).toEqual([SIZE_CODES.GG, "2"]);
    expect(q.has("products[1][code]")).toBe(false);
  });

  it("G+GG+XGG: três produtos; e uma peça segue igual a antes", async () => {
    expect((await ask(["G", "GG", "XGG"])).q.get("products[2][code]")).toBe(SIZE_CODES.XGG);
    const one = await ask("GG");
    expect([one.q.get("products[0][code]"), one.q.get("products[0][quantity]"), one.q.has("products[1][code]")]).toEqual([SIZE_CODES.GG, "1", false]);
  });

  it("nenhuma peça: null, sem consulta", async () => {
    const { got, calls } = await ask([]);
    expect([got, calls]).toEqual([null, 0]);
  });
});
