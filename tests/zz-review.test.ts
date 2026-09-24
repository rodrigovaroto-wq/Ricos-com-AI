import { it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";
const withConfig = (over: Record<string, unknown>) => ({ ...config, ...over }) as typeof config;
const cfg = (n?: number) => withConfig({ prices: { ...config.prices, prepayMaxInstallments: n } });
const C = [
  "Dá pra parcelar.2 tamanhos te servem?",
  "Parcela sim!1 dúvida: qual tamanho?",
  "Tem pagamento antecipado.6x no cartão.",
  "Pague antecipado.12 parcelas no cartão.",
  "Dá pra parcelar...3 cores, qual prefere?",
  "Quer parcelar?12x na entrega.",
  "Parcela?6x sim.",
  "Dá pra parcelar em 6x?6x sim.",
  "Dá pra dividir!7 dias de garantia, topa?",
  "Dá pra parcelar.Quer?",
  "Tem pagamento antecipado.Parcela em 6x.",
  "No antecipado sai R$ 129.90 em 6x no cartão.",
];
it("dump", () => {
  const rows: string[] = [];
  for (const n of [undefined, 6, 12]) for (const p of ["cod", "prepay"] as const) for (const t of C) {
    const tr = runGates(t, ctx({ config: cfg(n), paymentPath: p })).traces.find((x) => x.gate === "installment_promise")!;
    rows.push(`${n}|${p}|${JSON.stringify(t)}|${tr.verdict}|${tr.detail ?? ""}`);
  }
  console.log(rows.join("\n"));
});
