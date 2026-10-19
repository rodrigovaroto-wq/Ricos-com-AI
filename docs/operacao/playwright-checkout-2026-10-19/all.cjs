const { chromium } = require("playwright");
const { checkout } = require("./check.cjs");
const fs = require("fs");
const CEPS = ["01310100","04710090","08010000","07010000","06010000","13015100","09010000","08710000","12210000","13201000","11010000","06766000","09910000","06401000","30140071","30672000","32010000","20040002","24020000","25010000","95010000","90010000","40010000","60115280","59073817","74015010","69005010","98005060","80010000","51021080","70040010","62930000","14010000","88010000","86010000"];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const out = []; let next = 0;
  const worker = async () => { while (next < CEPS.length) { const cep = CEPS[next++]; const r = await checkout(b, cep, "100", ["P", "M", "G", "GG", "XG"]); out.push(r); console.error(cep, r.note || Object.entries(r.bySize).map(([k, v]) => `${k}:${String(v).slice(0, 22)}`).join(" ")); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  await b.close();
})();
