/**
 * 4.6, real scarcity: the units of HER size in the Logzz operations that serve her city. The Logzz stock answer carries
 * `stock_per_operations[].quantity`; the Coinzz `stock` is "1" for every size and is never read as a quantity.
 * Shapes are the Logzz answers of 2026-10-19 (`tests/logzz-region.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { AVAILABILITY_ENDPOINT, lookupRegion, readLogzzStock } from "@/agent/availability.js";

const IDS = { productId: "165378", saleId: "75567" };
const prod = (name: string, ops: Array<[number | string, number | string]>) => ({
  product_name: `Cinta Colete Modeladora-${name}`,
  stock_per_operations: ops.map(([operation_id, quantity]) => ({ operation_id, quantity })),
});
const STOCK = {
  status: "success",
  data: { products: [prod("P", [[9, 0]]), prod("M", [[9, 0]]), prod("G", [[9, 180]]), prod("GG", [[9, 12], [4, "3"], [7, 0]]), prod("XG", [[9, 73]])] },
};
const DAYS = { status: "success", data: [{ deliveryTypeCode: "det1pgz5", deliverySameDay: 0, dates: [{ date: "2026-10-22" }] }] };
const COINZZ_YES = {
  data: {
    products: [{ code: "pro7ml00", stock: "1", delivery_date: null }],
    local_operation: [{ price: 19.345 }],
    local_operation_cash_on_delivery: { delivery_days_available: [{ deliveryTypeCode: "det1pgz5", deliveryTypeName: "Padrão", deliveryPrice: 0, deliverySameDay: 0, dates: [{ date: "2026-10-22" }] }] },
  },
};

const world = (stock: unknown, coinzz: unknown = null) => async (url: string) => {
  if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Brooklin" };
  if (url.includes("get-available-stock")) { if (stock instanceof Error) throw stock; return stock; }
  if (url.includes("get-delivery-days")) return DAYS;
  if (url.startsWith(AVAILABILITY_ENDPOINT)) return coinzz;
  throw new Error(`unexpected ${url}`);
};
const qty = async (stock: unknown, size: "P" | "M" | "G" | "GG" | "XGG" | null, coinzz: unknown = null) => {
  const l = await lookupRegion(world(stock, coinzz), "04710-090", size, IDS);
  return l.kind === "found" ? l.region.stockQty ?? null : "failed";
};

describe("stockQty: as unidades do tamanho dela", () => {
  it("o G dela em São Paulo: 180", async () => {
    expect(await qty(STOCK, "G")).toBe(180);
  });

  it("soma as operações que atendem a cidade, quantidade em texto incluída", async () => {
    expect(await qty(STOCK, "GG")).toBe(15);
  });

  it("o XG do checkout é o XGG dela", async () => {
    expect(await qty(STOCK, "XGG")).toBe(73);
  });

  it("cada tamanho do kit, perguntado um a um, tem a sua quantidade", async () => {
    expect(await Promise.all((["G", "GG", "XGG"] as const).map((s) => qty(STOCK, s)))).toEqual([180, 15, 73]);
  });

  it("sem tamanho, não há quantidade a dizer", async () => {
    expect(await qty(STOCK, null)).toBeNull();
  });

  it("tamanho dela sem estoque: sem entrega, e não um número inventado", async () => {
    const l = await lookupRegion(world(STOCK), "04710090", "M", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(false);
    expect(l.kind === "found" ? l.region.stockQty ?? null : "failed").toBeNull();
  });

  it("o readLogzzStock guarda a soma por tamanho, 0 só para o tamanho de que falou", () => {
    const s = readLogzzStock(STOCK);
    expect(s && s.cod && Object.fromEntries(s.seen)).toEqual({ P: 0, M: 0, G: 180, GG: 15, XGG: 73 });
  });

  it("falha da Logzz: nunca 0; a Coinzz de segunda fonte não dá quantidade (o stock dela é sempre \"1\")", async () => {
    const down = Object.assign(new Error("HTTP 503"), { status: 503, body: null });
    expect(await qty(down, "G")).toBe("failed");
    expect(await qty(down, "G", COINZZ_YES)).toBeNull();
  });

  it("um produto ilegível pode ser mais do tamanho dela: a soma parcial não é quantidade (escassez falsa, revisão do plano 16)", async () => {
    const partial = { status: "success", data: { products: [prod("GG", [[9, 12]]), prod("GG", [[4, "x"]])] } };
    expect(await qty(partial, "GG")).toBeNull();
    // The delivery itself still holds: the readable product has stock where she lives.
    const l = await lookupRegion(world(partial), "04710-090", "GG", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(true);
  });

  it("resposta ilegível: não é quantidade", async () => {
    expect(await qty({ status: "success", data: { products: [prod("G", [[9, ""]])] } }, "G")).toBe("failed");
  });
});
