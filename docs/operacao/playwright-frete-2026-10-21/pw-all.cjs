const { chromium } = require("playwright");
const { writeFileSync, readFileSync } = require("fs");
const { checkout } = require("./pw-check.cjs");
const ONE = "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0";
const CEPS = JSON.parse(readFileSync(__dirname + "/ceps.json", "utf8"));
const SIZES = ["P", "M", "G", "GG", "XGG"];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const out = [];
  for (const [cep, n] of CEPS) for (const s of SIZES) {
    const r = await checkout(b, ONE + "?name=Teste+Malu&phone=11900000000", cep, n, [s]);
    console.error(cep, s, JSON.stringify(r.page), JSON.stringify(r.pageQuery), r.note, "aborted:" + r.aborted.length);
    out.push({ cep, size: s, ...r });
    writeFileSync(__dirname + "/pw.json", JSON.stringify(out, null, 1));
  }
  await b.close();
})();
