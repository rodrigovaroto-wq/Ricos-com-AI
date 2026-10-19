// The real checkout, driven like a customer, with every non-GET request aborted (no order, no lead, no payment).
const { chromium } = require("playwright");
const BASE = "https://entrega.logzz.com.br/pay/ccm-1-unidade?name=Teste%20Malu%20Playwright&phone=5511988887777&cpf=52998224725";
async function checkout(b, cep, number, sizes) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  await p.route("**/*", (route) => {
    const r = route.request();
    if (r.method() !== "GET" && r.method() !== "HEAD" && !/cdn-cgi|google|facebook|clarity|hotjar|validate-cpf/.test(r.url())) return route.abort();
    return route.continue();
  });
  const result = { cep, options: [], bySize: {}, note: "" };
  try {
    await p.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: /^Continuar/ }).first().click({ timeout: 8000 });
    await p.waitForTimeout(1000);
    await p.click("#order_zipcode");
    await p.keyboard.type(cep, { delay: 70 });
    await p.waitForTimeout(3000);
    await p.fill('input[placeholder="Digite o número"]', number);
    await p.waitForTimeout(600);
    await p.getByRole("button", { name: /Confirmar endereço/ }).first().click({ timeout: 8000 });
    await p.waitForTimeout(3500);
    const body0 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    if (!/Tamanho/.test(body0)) { result.note = (body0.match(/(Erro|bloquead|não faz parte|sem estoque|indispon)[^.]{0,160}/i) || [body0.slice(0, 200)])[0]; return result; }
    for (const size of sizes) {
      // open the size select and read its options
      const sel = p.locator('input[role="combobox"]').first();
      await sel.focus();
      await p.keyboard.press("ArrowDown");
      await p.waitForTimeout(500);
      const opts = await p.$$eval("[class*='-option'], [role='option']", (els) => els.map((e) => ({ t: e.innerText.trim(), d: e.getAttribute("aria-disabled") === "true" || /disabled/.test(e.className) })));
      if (!result.options.length) result.options = opts;
      const o = p.locator("[class*='-option'], [role='option']").filter({ hasText: new RegExp(`^${size}$`) }).first();
      if (!(await o.count())) { result.bySize[size] = "sem opção"; await p.keyboard.press("Escape"); continue; }
      const disabled = (opts.find((x) => x.t === size) || {}).d;
      if (disabled) { result.bySize[size] = "opção desabilitada"; await p.keyboard.press("Escape"); continue; }
      await o.click({ timeout: 4000 });
      await p.waitForTimeout(500);
      await p.getByRole("button", { name: /Adicionar variação/ }).click({ timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(3500);
      const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
      const dates = (t.match(/\b(?:Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)[^\d]{0,20}\d{1,2}[^A-Za-z]{0,6}[A-Za-zçÇ]{3}/gi) || []).slice(0, 3);
      const days = (t.match(/\b\d{1,2}\s*(?:\n|\s)(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\b/gi) || []).slice(0, 3);
      result.bySize[size] = dates.length || days.length ? `dias: ${(dates.length ? dates : days).join(", ")}` : (t.match(/(Erro|bloquead|não faz parte|sem estoque|indispon)[^.]{0,120}/i) || ["(sem dias visíveis)"])[0];
      // remove the variation to try the next size
      await p.getByText(/Remover|Excluir|×/).first().click({ timeout: 1500 }).catch(() => {});
    }
  } catch (e) { result.note = "ERRO " + String(e).slice(0, 120); }
  finally { await ctx.close(); }
  return result;
}
module.exports = { checkout };
if (require.main === module) {
  (async () => {
    const [cep, number, ...sizes] = process.argv.slice(2);
    const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
    console.log(JSON.stringify(await checkout(b, cep, number, sizes.length ? sizes : ["G"]), null, 1));
    await b.close();
  })();
}
