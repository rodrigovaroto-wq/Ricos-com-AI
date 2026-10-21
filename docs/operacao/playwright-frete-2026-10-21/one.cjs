const { chromium } = require("playwright");
const { checkout } = require("./pw-check.cjs");
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  for (let i = 0; i < 3; i++) {
    const r = await checkout(b, "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?name=Teste+Malu&phone=11900000000", process.argv[2], process.argv[4] || "100", [process.argv[3]]);
    console.log(i, JSON.stringify(r.page), JSON.stringify(r.sizes), JSON.stringify(r.pageQuery), r.note, "aborted:" + r.aborted.length);
  }
  await b.close();
})();
