import { describe, expect, it } from "vitest";
import { leadFacts, phoneTail, renderRound, renderTester, type TesterRows } from "../src/dev/archive-test-core.js";

const rows: TesterRows = {
  label: "Rodrigo",
  phone: "5511987654321",
  lead: { id: "l1", created_at: "2026-10-20T13:00:00Z", phone: "5511987654321", name: "Rodrigo Teste", identity: { document: "123.456.789-09" }, address: { street: "Rua X", cep: "01310-100", codAvailable: true, city: "São Paulo" }, size: "G", payment_choice: "cod", arm: { A: 1, B: 0 }, handoff_at: null, opted_out_at: null },
  conversations: [{ id: "c1aaaaaaaa", stage: "link_enviado", created_at: "2026-10-20T13:00:00Z" }],
  messages: [
    { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "meu cpf é 123.456.789-09 e cep 01310-100", created_at: "2026-10-20T13:00:01Z" },
    { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Recebi, obrigada!", created_at: "2026-10-20T13:00:05Z" },
  ],
  outcomes: [{ conversation_id: "c1aaaaaaaa", outcome: "send", reason: null, rewrites: 1, cost_brl: 0.0123, duration_ms: 4200, agent_version: 19, created_at: "2026-10-20T13:00:04Z" }],
  vetoes: [{ conversation_id: "c1aaaaaaaa", gate: "delivery_promise", verdict: "block", detail: "x", created_at: "2026-10-20T13:00:03Z" }],
  followups: [],
  orders: [{ status: "created", payment_method: "afterpay", size: "G", units: 1, amount_brl: 129.9, created_at: "2026-10-20T13:10:00Z" }],
};

describe("arquivo de teste real (operador, 2026-10-13)", () => {
  it("o repositório recebe só o fim do telefone, e nada da identidade nem do endereço", () => {
    expect(phoneTail("5511987654321")).toBe("…4321");
    const f = leadFacts(rows.lead);
    expect(JSON.stringify(f)).not.toMatch(/Rodrigo Teste|123\.456|Rua X|01310|5511987654321/);
    expect(f).toMatchObject({ size: "G", region: { codAvailable: true, city: "São Paulo" } });
  });
  it("a transcrição mascara CPF e CEP nas mensagens e mostra desfecho e veto do turno", () => {
    const md = renderTester(rows);
    expect(md).not.toMatch(/123\.456\.789|01310-100|5511987654321/);
    expect(md).toContain("[cpf]");
    expect(md).toContain("veto `delivery_promise`");
    expect(md).toContain("desfecho `send`");
    expect(md).toContain("Pedido: created");
  });
  it("a rodada traz as seções da análise para preencher", () => {
    const md = renderRound("2026-10-20-r1", [rows], null);
    expect(md).toContain("## Análise");
    expect(md).toContain("## Achados → conserto → guarda");
  });
});
