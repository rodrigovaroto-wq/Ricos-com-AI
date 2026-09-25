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

  it("kit sem os tamanhos todos vai para o operador", () => {
    const r = normalize(coinzz({ order_quantity: 2 }, "Apto 12, M"));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("pedido de 2 pecas");
  });

  it("número do apartamento não apaga o tamanho, e letra de apartamento não vira tamanho", () => {
    expect(normalize(coinzz({}, "Apto 12, G")).order.size).toBe("G");
    expect(normalize(coinzz({}, "Bloco B, apto G")).ok).toBe(false);
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

  it("o teste da própria Logzz, sem tamanho no complemento, vai para o operador", () => {
    const r = normalize(logzz({ order_quantity: "3", order_final_price: "150,00" }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("pedido de 3 pecas");
  });
});
