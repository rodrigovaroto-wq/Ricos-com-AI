import { prepayFreight, lookupRegion, logzzIdsOf, type Fetcher } from "/home/user/Ricos-com-AI/src/agent/availability.ts";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("/home/user/Ricos-com-AI/docs/operacao/business-config-2026-10-20.min.json", "utf8"));
const fetcher: Fetcher = async (url, headers) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(`region lookup HTTP ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return r.ok ? await r.json() : null;
};
for (const zip of ["84940000", "35620000"]) {
  const look = await lookupRegion(fetcher, zip, null, logzzIdsOf(config.checkout));
  for (const s of ["P", "G", "XGG"] as const) { console.log(zip, s, look.kind === "found" ? await prepayFreight(fetcher, zip, look.region.place, s) : null); await new Promise((r) => setTimeout(r, 2000)); }
}
