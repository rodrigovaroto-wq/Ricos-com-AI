// The three prepaid offers x CEPs of several regions, one checkout at a time. Result in real-checkout.json.
const { chromium } = require("playwright");
const { writeFileSync } = require("fs");
const { checkout } = require("./check.cjs");
// Every size alone on the 1-piece offer (the M failed in the first pass, 2026-10-20), and the kits without the M.
const ONE = "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0";
const OFFERS = [
  ...["P", "M", "G", "GG", "XGG"].map((s) => [ONE, [s]]),
  ["https://app.coinzz.com.br/checkout/antecipado-2-0", ["G", "GG"]],
  ["https://app.coinzz.com.br/checkout/antecipado-3-0", ["G", "GG", "GG"]],
];
const CEPS = [["01310100", "1000"], ["35430535", "120"], ["69005010", "100"], ["84940000", "10"], ["90010000", "100"], ["40010000", "10"], ["98005000", "100"], ["30130000", "100"]];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const out = [];
  // A real WhatsApp number without its ninth digit, as Meta hands it over, through the Malu's own link builder (see compare.mts).
  const qs = process.argv[2] || "";
  for (const [offer, sizes] of OFFERS) for (const [cep, n] of (process.argv[3] === "one" ? CEPS.slice(0, 2) : CEPS)) {
    const r = await checkout(b, offer + qs, cep, n, sizes);
    console.error(cep, offer.split("/").pop(), sizes.join("+"), JSON.stringify(r.page), r.note, r.aborted.length);
    out.push(r);
  }
  await b.close();
  writeFileSync(__dirname + "/real-checkout.json", JSON.stringify(out, null, 1));
})();
