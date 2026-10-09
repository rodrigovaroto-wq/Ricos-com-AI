import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Runs the ACTUAL code of the n8n node "Normaliza a venda" (from the versioned active
 * workflow, pulled by `pnpm dev:n8n`) against Coinzz payloads in the shape its own test
 * webhook sent on 2026-09-25. The mapping lived only in n8n, where nothing tested it.
 */
const wf = JSON.parse(readFileSync("n8n/workflows/venda-confirmada.json", "utf8")) as {
  nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
};
const code = wf.nodes.find((n) => n.name === "Normaliza a venda")!.parameters.jsCode!;
const normalize = (payload: unknown) =>
  (new Function("$input", code)({ first: () => ({ json: payload }) }) as Array<{ json: { ok: boolean; missing: string; order: Record<string, unknown> } }>)[0]!.json;

const coinzz = (order: Record<string, unknown>, comp: string) => ({
  query: { fonte: "coinzz" },
  body: {
    client: { client_name: "Felipe", client_phone: "62954544554", client_address_comp: comp },
    order: { order_number: "ORD1", order_status: "Aprovado", shipping_status: "", order_quantity: 1, order_final_price: 129.9, method_payment: "afterpay", date_order: "2026-09-25 10:00:00", ...order },
  },
});

describe("n8n: a venda da Coinzz, no formato real", () => {
  it("uma peça na entrega (afterpay)", () => {
    const r = normalize(coinzz({}, "casa 2 - tamanho G"));
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({ externalId: "ORD1", phone: "62954544554", paymentMethod: "cod", size: "G", amountBrl: 129.9, units: 1 });
  });

  it("kit de 2 com um tamanho por peça", () => {
    const r = normalize(coinzz({ order_quantity: 2, order_final_price: 233.82 }, "Apto 12, M e G"));
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({ size: "M,G", units: 2, amountBrl: 233.82 });
  });

  it("kit sem os tamanhos todos é gravado sem tamanho e vai para o operador (2026-10-09)", () => {
    const r = normalize(coinzz({ order_quantity: 2 }, "Apto 12, M")) as unknown as { ok: boolean; sizeMissing: string; order: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.order.size).toBeUndefined();
    expect(r.sizeMissing).toContain("pedido de 2 pecas");
  });

  it("número do apartamento não apaga o tamanho, e letra de apartamento não vira tamanho", () => {
    expect(normalize(coinzz({}, "Apto 12, G")).order.size).toBe("G");
    expect(normalize(coinzz({}, "Bloco B, apto G")).order.size).toBeUndefined();
  });

  it("pix é antecipado; pagamento e envio viram um status só", () => {
    const r = normalize(coinzz({ method_payment: "pix", shipping_status: "Enviado" }, "G"));
    expect(r.order).toMatchObject({ paymentMethod: "prepay", status: "Aprovado / Enviado" });
  });
});

describe("n8n → banco: o tamanho que o normalizador manda cabe na coluna", () => {
  // Revisão de código, 2026-09-25: o kit mandava "M,G" e `orders.size` só aceitava uma
  // letra — toda venda de kit falharia no insert. Nenhum teste passava do normalizador.
  const sql = readFileSync("supabase/migrations/0010_order_kit_sizes.sql", "utf8");
  const pattern = new RegExp(/check \(size ~ '([^']+)'\)/.exec(sql)![1]!);
  it.each([
    [coinzz({}, "casa 2 - tamanho G")],
    [coinzz({ order_quantity: 2, order_final_price: 233.82 }, "Apto 12, M e G")],
    [coinzz({ order_quantity: 3, order_final_price: 311.76 }, "GG, GG e XGG")],
  ])("%#", (payload) => {
    const r = normalize(payload);
    expect(r.ok).toBe(true);
    expect(String(r.order.size)).toMatch(pattern);
  });
});

/** The Logzz shape, from its own test webhook that reached n8n on 2026-09-25 (execution 5490). */
const logzz = (fields: Record<string, unknown>) => ({
  query: { fonte: "logzz" },
  body: {
    client_name: "John Doe",
    client_phone: "555-1234-567",
    client_address_comp: "Apt 101",
    order_number: "1000S0123P1000",
    order_status: "Agendado",
    order_quantity: "1",
    order_final_price: "129,90",
    external_id: "venq000x10",
    date_order: "2026-09-25 02:38:23",
    date_delivery: "2026-09-30 02:38:23",
    ...fields,
  },
});

describe("n8n: a venda da Logzz (entrega, de volta em 25/09)", () => {
  it("kit de 3 com quantidade e total em texto", () => {
    const r = normalize(logzz({ order_quantity: "3", order_final_price: "311,76", client_address_comp: "Apt 101, M, G e GG" }));
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({ externalId: "venq000x10", paymentMethod: "cod", size: "M,G,GG", amountBrl: 311.76, units: 3, scheduledFor: "2026-09-30" });
  });

  it("o teste da própria Logzz, sem tamanho, é gravado sem tamanho e vai para o operador (2026-10-09)", () => {
    const r = normalize(logzz({ order_quantity: "3", order_final_price: "150,00" })) as unknown as { ok: boolean; sizeMissing: string; order: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.order.size).toBeUndefined();
    expect(r.sizeMissing).toContain("pedido de 3 pecas");
  });
});

/**
 * The platforms' own test webhooks of 2026-10-09 (operator, "Testar URL"): neither carries the size in
 * the complement. Coinzz names the size's product code; Logzz the variations she picked. A sale whose size
 * nothing names is recorded without it (migration 0025) and the operator is told — never dropped.
 */
describe("n8n: os webhooks de teste das plataformas (2026-10-09)", () => {
  const coinzzReal = JSON.parse(readFileSync("tests/fixtures/coinzz-teste-2026-10-09.json", "utf8"));
  const logzzReal = JSON.parse(readFileSync("tests/fixtures/logzz-teste-2026-10-09.json", "utf8"));

  it("o exemplo da Coinzz (garrafa, 5 peças, sem tamanho) é gravado sem tamanho e avisado", () => {
    const r = normalize(coinzzReal) as unknown as { ok: boolean; sizeMissing: string; order: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({ externalId: "ORD123456", paymentMethod: "prepay", units: 5, status: "Aprovado / Enviado" });
    expect(r.order.size).toBeUndefined();
    expect(r.sizeMissing).toContain("size");
  });
  it("a Coinzz com o código do tamanho do colete grava o tamanho", () => {
    const body = structuredClone(coinzzReal);
    Object.assign(body.body.order, { order_quantity: 1, product_code: "pro7ml00", product_name: "Colete Cinta Modeladora" });
    const r = normalize(body) as unknown as { ok: boolean; sizeMissing: string; order: Record<string, unknown> };
    expect(r.order.size).toBe("G");
    expect(r.sizeMissing).toBe("");
  });
  it("o exemplo da Logzz (variações V e W) é gravado sem tamanho; com variações de tamanho, grava cada peça", () => {
    const r = normalize(logzzReal) as unknown as { ok: boolean; sizeMissing: string; order: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({ externalId: "venq000x10", paymentMethod: "cod", units: 3, status: "Agendado", scheduledFor: "2026-10-14" });
    expect(r.order.size).toBeUndefined();
    const body = structuredClone(logzzReal);
    body.body.products.main.variations = [
      { product_name: "Colete Cinta Modeladora - M", product_code: "x1", quantity: "1" },
      { product_name: "Colete Cinta Modeladora - GG", product_code: "x2", quantity: "2" },
    ];
    expect((normalize(body) as unknown as { order: Record<string, unknown> }).order.size).toBe("M,GG,GG");
  });
  it("negação: uma letra no meio do nome do produto não é tamanho", () => {
    const body = structuredClone(logzzReal);
    body.body.order_quantity = "1";
    body.body.products.main.variations = [{ product_name: "Garrafa G térmica", quantity: "1" }];
    body.body.products.main.product_name = "Produto P de teste";
    expect((normalize(body) as unknown as { order: Record<string, unknown> }).order.size).toBeUndefined();
  });
  it("a coluna aceita o pedido sem tamanho", () => {
    expect(readFileSync("supabase/migrations/0025_order_size_optional.sql", "utf8")).toContain("alter column size drop not null");
  });
});
