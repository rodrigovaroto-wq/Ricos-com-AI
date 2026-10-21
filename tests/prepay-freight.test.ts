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
      const got = await prepayFreight(async () => answer(price), "01310100", { city: "São Paulo", state: "SP", district: "Bela Vista" }, "GG");
      expect(got).toBeNull();
    }
  });
});
