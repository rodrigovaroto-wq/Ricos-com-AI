// The real Coinzz prepaid checkout, driven like a customer. Every non-GET request is aborted, except five reads whose bodies
// carry no personal data (each pattern below): the CEP lookup, the shipping options and the cart calculators. No lead, no order.
const { chromium } = require("playwright");
const READS = [
  [/\/checkout\/zipcode$/, /^zipcode=\d{8}$/],
  [/\/checkout\/entrega\/getAll$/, /^urlOffer=[\w-]+&state=[A-Z]{2}$/],
  [/\/checkout\/shopping-car[dt]\/(?:get-full-shopping-cart|installments|get-compound-interest)$/, /^checkout_id=\w+&(?:(?:cupom|coupon|freight_value|installments|offer_id|bump_by_offers)=[\w.]*&?)+$/],
];
const allowed = (r) => /cloudflare|cdn-cgi/.test(r.url()) || READS.some(([u, b]) => u.test(r.url()) && b.test(r.postData() || ""));
const LABEL = { P: "P", M: "M", G: "G", GG: "Gg", XGG: "Xgg" };

async function checkout(b, url, cep, number, sizes) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1200 } });
  const p = await ctx.newPage();
  const result = { pageQuery: [], url, cep, stock: null, prefill: {}, address: null, sizes: {}, cart: null, freight: null, interest: null, page: {}, aborted: [], note: "" };
  await p.route("**/*", (route) => {
    const r = route.request();
    if (r.method() === "GET" || r.method() === "HEAD" || allowed(r)) return route.continue();
    result.aborted.push(`${r.method()} ${r.url().slice(0, 100)}`);
    return route.abort();
  });
  p.on("response", async (res) => {
    const u = res.url();
    if (process.env.DEBUG && !/\.(js|css|png|svg|woff2?|jpg|webp|gif|ico)(\?|$)|cdn-cgi|cloudflare|google|facebook|clarity|tiktok/.test(u)) console.error("RESP", res.request().method(), res.status(), (/stock-and-delivery/.test(u) ? u : u.slice(0, 110)), (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 260));
    const body = () => res.json().catch(() => null);
    if (/\/checkout\/zipcode$/.test(u)) result.address = (await body())?.data ?? null;
    if (/get-full-shopping-cart$/.test(u)) { const j = await body(); if (j) result.cart = { items: (j.items || []).map((i) => ({ price_offer: i.price_offer, total: i.total_with_interest })), raw: Object.fromEntries(Object.entries(j).filter(([k]) => k !== "items").map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v).slice(0, 200) : v])) }; }
    if (/get-compound-interest$/.test(u)) { const j = await body(); if (j?.interest) result.interest = Object.fromEntries(Object.entries(j.interest).map(([n, v]) => [n, v.total_with_interest])); }
    if (/entrega\/getAll$/.test(u)) result.freight = (await body())?.data ?? null;
    // The checkout's own stock question, the one `lookupRegion` asks Coinzz too: an error here blocks the purchase.
    if (/stock-and-delivery-day/.test(u)) { const j = await body(); const q = new URL(u).searchParams; result.pageQuery.push({ status: res.status(), code: q.get("products[0][code]"), city: q.get("city"), state: q.get("state"), neighbourhood: q.get("neighbourhood"), zip: q.get("zip_code"), local: j?.data?.local_operation?.[0]?.price ?? null }); result.stock = { status: res.status(), message: j?.message ?? null, products: (j?.data?.products || []).map((x) => `${x.code}:${x.stock}`) }; }
  });
  const T = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  try {
    await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(1500);
    result.prefill = { name: await p.locator('input[name="customer_name"]:visible').first().inputValue(), phone: await p.locator('input[name="customer_phone"]:visible').first().inputValue() };
    await p.locator('input[name="customer_email"]:visible').first().fill("teste.malu.playwright@example.com");
    await p.locator('input[name="customer_cpf"]:visible').first().fill("52998224725");
    await p.getByRole("button", { name: /Continuar/ }).first().click({ timeout: 8000 });
    await p.waitForTimeout(2500);
    await p.locator('input[name="customer_zip_code"]:visible').first().click();
    await p.keyboard.type(cep, { delay: 60 });
    await p.keyboard.press("Tab");
    await p.waitForResponse((r) => /checkout\/zipcode/.test(r.url()), { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
    // City-wide CEP (no street): the page asks the street and the district typed; fill them like a customer would.
    for (const [name, value] of [["customer_street", "Rua Principal"], ["customer_address", "Rua Principal"], ["customer_neighborhood", "Centro"], ["customer_neighbourhood", "Centro"], ["customer_district", "Centro"]]) {
      const f = p.locator(`input[name="${name}"]:visible`).first();
      if (await f.count() && !(await f.inputValue())) { await f.fill(value); result.note += `preenchido ${name}; `; }
    }
    if (process.env.DEBUG) console.error("INPUTS", await p.evaluate(() => [...document.querySelectorAll("input")].filter((i) => i.offsetParent).map((i) => i.name + "=" + i.value).join(" | ")));
    if (!result.address) { result.note = (await T()).match(/(CEP[^|.]{0,120}(inválido|não encontrado)[^.]{0,80})/i)?.[0] ?? "endereço não achado"; return result; }
    const num = p.locator('input[name="customer_number"]:visible').first();
    await num.click(); await num.pressSequentially(number, { delay: 80 }); await num.press("Tab");
    await p.waitForTimeout(1500);
    await p.locator("#next-two").click({ timeout: 8000 });
    await p.waitForTimeout(3000);
    for (const size of sizes) {
      const sel = p.locator("select:visible").first();
      const opts = await sel.evaluate((e) => [...e.options].map((o) => ({ t: o.text.trim(), d: o.disabled }))).catch(() => []);
      const o = opts.find((x) => x.t === LABEL[size]);
      result.sizes[size] = !o ? "sem opção" : o.d ? "desabilitado" : "ok";
      if (result.sizes[size] !== "ok") continue;
      await sel.selectOption({ label: LABEL[size] });
      await p.waitForTimeout(600);
      await p.locator("button:visible", { hasText: /^\s*Adicionar\s*$/ }).first().click({ timeout: 5000 });
      await p.waitForTimeout(1500);
    }
    await p.locator("button:visible", { hasText: /Continuar/ }).first().click({ timeout: 8000 });
    await p.waitForTimeout(5000);
    await p.locator("text=Pix").first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const t = await T();
    const money = (re) => t.match(re)?.[1] ?? null;
    result.page = {
      principal: money(/Pedido principal: R\$ ([\d.,]+)/), freight: money(/Frete: R\$ ([\d.,]+)/), total: money(/Total final: R\$ ([\d.,]+)/),
      pix: money(/Valor do pix: R\$ ([\d.,]+)/), deadline: t.match(/(\d+\s*(?:a\s*\d+\s*)?dias?\s*úteis[^|.]{0,40})/i)?.[1] ?? null,
    };
  } catch (e) { result.note = "ERRO " + String(e).slice(0, 160); }
  finally { await ctx.close(); }
  return result;
}
module.exports = { checkout };
