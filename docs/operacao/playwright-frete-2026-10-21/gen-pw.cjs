const { chromium } = require("playwright");
const { checkout } = require("./pw-check2.cjs");
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  for (const cep of ["84940000", "35620000"]) for (const s of ["P", "G", "XGG"]) {
    const r = await checkout(b, "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?name=Teste+Malu&phone=11900000000", cep, "10", [s]);
    console.log(cep, s, r.page.freight, JSON.stringify(r.pageQuery.map((q) => [q.status, q.neighbourhood, q.local])), "aborted:" + r.aborted.length);
  }
  await b.close();
})();
