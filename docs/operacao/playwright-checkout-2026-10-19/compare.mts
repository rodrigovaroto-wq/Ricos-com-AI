import { lookupRegion } from "/home/user/Ricos-com-AI/src/agent/availability.ts";
import fs from "node:fs";
const real = JSON.parse(fs.readFileSync("real-checkout.json", "utf8"));
const fetcher = async (url: string, headers?: Record<string, string>) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return r.ok ? await r.json() : null;
};
const IDS = { productId: "165378", saleId: "75567" };
let ok = 0, bad = 0;
for (const r of real) {
  const out: string[] = [];
  for (const s of ["P", "M", "G", "GG", "XGG"] as const) {
    const truth = r.bySize?.[s === "XGG" ? "XG" : s] as string | undefined;
    const real_has = !!truth && truth.startsWith("dias");
    const l = await lookupRegion(fetcher, r.cep, s, IDS);
    const mine = l.kind === "found" && l.region.cod && l.region.dates.length > 0;
    const unknown = l.kind !== "found";
    if (mine === real_has && !unknown) ok++; else { bad++; out.push(`${s}: checkout=${truth ?? "?"} malu=${l.kind === "found" ? (l.region.cod ? "cod " + l.region.dates[0] : "no") : l.kind}`); }
  }
  if (out.length) console.log(r.cep, r.note || "", out.join(" | "));
}
console.log({ ok, bad, ceps: real.length });
