// Does the freight depend on the neighbourhood the agent sends? And what does a city-wide CEP (no street) give?
import { prepayFreight, lookupRegion, logzzIdsOf, type Fetcher } from "/home/user/Ricos-com-AI/src/agent/availability.ts";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("/home/user/Ricos-com-AI/docs/operacao/business-config-2026-10-20.min.json", "utf8"));
const fetcher: Fetcher = async (url, headers) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(`region lookup HTTP ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return r.ok ? await r.json() : null;
};
const wait = () => new Promise((r) => setTimeout(r, 2500));
for (const [zip, city, state, ds] of [["01310100", "São Paulo", "SP", ["Bela Vista", "", "Centro", "Qualquer"]], ["69005010", "Manaus", "AM", ["Centro", "", "Adrianópolis"]]] as const) {
  for (const d of ds) { console.log(zip, JSON.stringify(d), await prepayFreight(fetcher, zip, { city, state, district: d }, "GG")); await wait(); }
}
for (const zip of ["35620000", "84940000", "38180000"]) {
  const look = await lookupRegion(fetcher, zip, null, logzzIdsOf(config.checkout));
  const place = look.kind === "found" ? look.region.place : null;
  console.log(zip, look.kind, JSON.stringify(place), place ? await prepayFreight(fetcher, zip, place, "GG") : "-");
  await wait();
}
