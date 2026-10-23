/**
 * 2026-10-23 (Playwright against the real Logzz checkout): the days are asked with the operations holding ONE size and that
 * size's product in `product_requirements` — without it the Logzz answers "Nenhuma opção de entrega" even in São Paulo — and
 * operation 0 is never asked (the checkout leaves it out; asking with it is a 422, which turned every Recife CEP into a failed
 * lookup instead of "no delivery"). Operation 0 is not her region's stock either.
 */
import { describe, expect, it } from "vitest";
import { lookupRegion, readLogzzStock } from "@/agent/availability.js";

const IDS = { productId: "165378", saleId: "75567" };
const DAYS = { status: "success", data: [{ deliveryTypeCode: "x", deliverySameDay: 0, dates: [{ date: "2026-10-24" }] }] };
const NONE = { status: "success", msg: "Nenhuma opção de entrega disponível para esta cidade.", data: [] };
// Recife, as the Logzz answered on 2026-10-23: operation 0 carries stock, the local operations hold none of G but one of P.
const RECIFE = {
  status: "success",
  data: {
    products: [
      { product_id: 165379, product_name: "Cinta Colete Modeladora-P", stock_per_operations: [{ operation_id: 12, quantity: 22 }, { operation_id: 0, quantity: 43 }] },
      { product_id: 165382, product_name: "Cinta Colete Modeladora-G", stock_per_operations: [{ operation_id: 6, quantity: 1 }, { operation_id: 0, quantity: 17 }, { operation_id: 9, quantity: 185 }] },
      { product_id: 165383, product_name: "Cinta Colete Modeladora-GG", stock_per_operations: [{ operation_id: 17, quantity: 1 }, { operation_id: 0, quantity: 6 }, { operation_id: 12, quantity: 28 }] },
    ],
  },
};
const world = (days: unknown) => {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.includes("viacep")) return { localidade: "Recife", uf: "PE", bairro: "Boa Viagem" };
    if (url.includes("get-available-stock")) return RECIFE;
    if (url.includes("get-delivery-days")) {
      if (new URL(url).searchParams.getAll("operation_ids[]").includes("0")) throw Object.assign(new Error("HTTP 422"), { status: 422, body: { message: "Cada ID de operação deve existir na tabela operations." } });
      return days;
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetcher, asked };
};

describe("Logzz: os dias perguntados como o checkout pergunta", () => {
  it("o tamanho dela vai em product_requirements, sem a operação 0", async () => {
    const { fetcher, asked } = world(DAYS);
    const l = await lookupRegion(fetcher, "51020-000", "G", IDS);
    expect(l).toMatchObject({ kind: "found", region: { cod: true, dates: ["2026-10-24"] } });
    const q = new URL(asked.find((u) => u.includes("get-delivery-days"))!).searchParams;
    expect(q.getAll("operation_ids[]")).toEqual(["6", "9"]);
    expect(q.get("product_requirements[0][product_id]")).toBe("165382");
    expect(q.get("product_requirements[0][quantity]")).toBe("1");
  });

  it("Recife: a Logzz diz que não há opção de entrega — é 'sem entrega', não falha", async () => {
    const l = await lookupRegion(world(NONE).fetcher, "51020000", "G", IDS);
    expect(l).toMatchObject({ kind: "found", region: { cod: false } });
  });

  it("sem tamanho, o tamanho com mais estoque local representa a região", async () => {
    const { fetcher, asked } = world(DAYS);
    await lookupRegion(fetcher, "51020000", null, IDS);
    const q = new URL(asked.find((u) => u.includes("get-delivery-days"))!).searchParams;
    expect(q.get("product_requirements[0][product_id]")).toBe("165382");
    expect(q.getAll("operation_ids[]")).not.toContain("0");
  });

  it("a operação 0 não é estoque da região dela (a linha de escassez)", () => {
    const s = readLogzzStock(RECIFE);
    expect(s).toMatchObject({ cod: true, bySize: { P: [12], G: [6, 9], GG: [17, 12] } });
    if (s && s.cod) expect([s.seen.get("P"), s.seen.get("G"), s.seen.get("GG")]).toEqual([22, 186, 29]);
  });

  it("sem o id do produto do tamanho: falha, nunca 'sem entrega'", async () => {
    const noId = { status: "success", data: { products: [{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: 6, quantity: 3 }] }] } };
    const fetcher = async (url: string) => (url.includes("viacep") ? { localidade: "Recife", uf: "PE", bairro: "x" } : url.includes("get-available-stock") ? noId : DAYS);
    expect((await lookupRegion(fetcher, "51020000", "G", IDS)).kind).toBe("failed");
  });
});
