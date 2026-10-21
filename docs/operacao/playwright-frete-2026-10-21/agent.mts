// The agent's side: the same code path the turn runs (lookupRegion → region.place → prepayFreight), live, no personal data.
import { readFileSync, writeFileSync } from "node:fs";
import { lookupRegion, prepayFreight, logzzIdsOf, type Fetcher } from "/home/user/Ricos-com-AI/src/agent/availability.ts";
const config = JSON.parse(readFileSync("/home/user/Ricos-com-AI/docs/operacao/business-config-2026-10-20.min.json", "utf8"));
// Same as the turn's regionFetcher (index.ts): 404 → null, other errors throw.
const fetcher: Fetcher = async (url, headers) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  // Byte-for-byte the turn's regionFetcher (index.ts): the error carries the parsed body (the Logzz's 400 "no delivery").
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(`region lookup HTTP ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return r.ok ? await r.json() : null;
};
const CEPS: string[] = JSON.parse(readFileSync(new URL("./ceps.json", import.meta.url), "utf8")).map((c: [string, string]) => c[0]);
const SIZES = ["P", "M", "G", "GG", "XGG"] as const;
const out: any[] = [];
for (const cep of CEPS) {
  await new Promise((r) => setTimeout(r, 4000));
  const look = await lookupRegion(fetcher, cep, null, logzzIdsOf(config.checkout));
  const place = look.kind === "found" ? look.region.place : null;
  for (const size of SIZES) {
    const freight = place ? await prepayFreight(fetcher, cep, place, size) : null;
    out.push({ cep, size, lookup: look.kind, place, freight });
    console.error(cep, size, look.kind, place ? `${place.city}/${place.state}/${place.district}` : "-", freight);
  }
}
writeFileSync(new URL("./agent.json", import.meta.url), JSON.stringify(out, null, 1));
