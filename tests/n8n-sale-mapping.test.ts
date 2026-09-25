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
