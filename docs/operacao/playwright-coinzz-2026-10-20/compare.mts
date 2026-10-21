// What the Malu says on the prepaid path against what the real Coinzz checkout showed (real-checkout.json).
// Prices, kits and installments from the config in production; the link from `buildPrefilledCheckoutLink`.
import { readFileSync } from "node:fs";
import { buildPrefilledCheckoutLink } from "../../../src/agent/coinzz.ts";
const config = JSON.parse(readFileSync(new URL("../business-config-2026-10-20.min.json", import.meta.url), "utf8"));
const runs = JSON.parse(readFileSync(new URL("./real-checkout.json", import.meta.url), "utf8"));
const brl = (s: string | null) => (s === null ? null : Number(s.replace(/\./g, "").replace(",", ".")));
const priceOf = (url: string) => {
  const base = url.split("?")[0];
  const kit = (config.kits ?? []).find((k: { checkoutUrl: string }) => k.checkoutUrl === base);
  return kit ? kit.priceBrl : config.prices.prepayBrl;
};
const link = buildPrefilledCheckoutLink({ name: "Rosa Silva", phone: "553184644486" }, "prepay", config.checkout);
console.log(`link da Malu (WhatsApp 55 31 8464-4486, sem o nono dígito): ${link}`);
const rows = runs.map((r: any) => {
  const said = priceOf(r.url);
  const principal = brl(r.page?.principal ?? null);
  const freight = brl(r.page?.freight ?? null);
  const total = brl(r.page?.total ?? null);
  const maxInst = r.interest ? Math.max(...Object.keys(r.interest).map(Number)) : null;
  return {
    offer: r.url.split("/").pop().split("?")[0], cep: r.cep, sizes: Object.keys(r.sizes).join("+"),
    prefill: `${r.prefill?.name} / ${r.prefill?.phone}`,
    malu: said, principal, diff: principal === null ? null : +(principal - said).toFixed(2),
    freight, total, totalOk: principal !== null && freight !== null && total !== null ? Math.abs(principal + freight - total) < 0.02 : null,
    installments: maxInst, inst12: r.interest?.["12"] ?? null,
    stock: r.stock ? `${r.stock.status}${r.stock.message ? ` ${r.stock.message}` : ""}` : null,
    blocked: freight === null, aborted: r.aborted.length, note: r.note,
  };
});
console.table(rows);
