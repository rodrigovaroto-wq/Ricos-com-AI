/**
 * The two-arm test of 2026-10-27 (operator): ads → WhatsApp and ads → site → Coinzz checkout. The origin from the CTWA referral, the
 * site mode (no opening, media on request), the Coinzz cart and Pix touches, the retomada in place of the coupon touch, and one link
 * where both paths share one checkout. Grafo §134.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import {
  armsCartRecovery,
  asksPixCode,
  awaitsPix,
  checkoutSlug,
  deliveryFor,
  firstNameOf,
  leadPhoneOf,
  onOrderConfirmed,
  phoneTwins,
  pixResendTexts,
  renderFollowup,
  type ExistingFollowup,
  type FollowupKind,
  type RenderContext,
  type TemplateBinding,
} from "@/agent/followups.js";
import { BOTH_HEADLINE, bothLinksBubbles, FUNNEL_LABELS, offerKindOf, oneCheckout, requestedMedia } from "@/agent/funnel.js";
import { checkoutFactLines, openingDirective, regionDirectiveFor, systemPrompt } from "@/agent/prompt.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { templateMessage } from "@/channel/whatsapp.js";
import { checkWorkflow, type N8nWorkflow } from "@/dev/n8n-rules.js";
import { ctx as gateCtx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-27.min.json");
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const doc = readFileSync("docs/agente-ia/06-script/03-templates-meta.md", "utf8");
const now = new Date("2026-10-28T15:00:00Z"); // quarta, 12:00 em São Paulo

/** The declarations the operator adds after approval, read from the document (section "Declaração depois da aprovação"). */
const declared = (() => {
  const block = /### Declaração depois da aprovação[\s\S]*?```text\n([\s\S]*?)\n```/.exec(doc)?.[1];
  if (!block) throw new Error("declaração dos templates novos não está no documento");
  return JSON.parse(`{${block}}`) as Record<string, TemplateBinding>;
})();
const withNew = { ...prod, channel: { ...prod.channel, templates: { ...prod.channel?.templates, ...declared } } };
const bodyOf = (kind: string): string => {
  const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith(`\`${kind}\``));
  const body = section && /\*\*Corpo:\*\*\s*```text\n([\s\S]*?)\n```/.exec(section)?.[1];
  if (!body) throw new Error(`template de ${kind} sem corpo`);
  return body;
};
const rctx = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-1", config: withNew, now, ...over });
const blocked = (text: string, over: Parameters<typeof gateCtx>[0] = {}) =>
  runGates(text, gateCtx({ config: prod, ...over })).traces.filter((t) => t.verdict === "block").map((t) => `${t.gate}: ${t.detail}`);

describe("o telefone do checkout vira o do lead, e o lead é achado com ou sem o nono dígito", () => {
  it("leadPhoneOf", () => {
    expect(leadPhoneOf("(11) 98765-4321")).toBe("5511987654321");
    expect(leadPhoneOf("+55 62 95454-4554")).toBe("5562954544554");
    expect(leadPhoneOf("1133334444")).toBe("551133334444");
    // Negation: not a Brazilian number, no lead.
    expect(leadPhoneOf("1234-567")).toBeNull();
    expect(leadPhoneOf("+1 415 555 0100")).toBeNull();
    expect(leadPhoneOf("")).toBeNull();
    expect(leadPhoneOf("01198765432")).toBeNull();
  });
  it("phoneTwins", () => {
    expect(phoneTwins("553196492777")).toEqual(["553196492777", "5531996492777"]);
    expect(phoneTwins("5531996492777")).toEqual(["553196492777", "5531996492777"]);
    expect(phoneTwins("x")).toEqual(["x"]);
  });
  it("o turno procura o lead pelos dois e prefere o exato; a origem do anúncio só preenche um source vazio", () => {
    expect(turn).toContain("const twins = phoneTwins(inbound.from);");
    expect(turn).toContain("leads?phone=in.(${twins.map(encodeURIComponent).join(\",\")})&select=*");
    expect(turn).toContain("leads?id=eq.${lead.id}&source=is.null");
  });
});

describe("carrinho abandonado", () => {
  const base = { optedOut: false, hasOrder: false, cartTouchSent: false, checkoutReminderPending: false, lastInboundAt: null, now };
  it("arma uma vez, sem depender do opt-in de marketing", () => {
    expect(armsCartRecovery(base)).toBe(true);
  });
  it("negação: opt-out, pedido, toque já enviado, lembrete do link esperando, ou conversa viva", () => {
    expect(armsCartRecovery({ ...base, optedOut: true })).toBe(false);
    expect(armsCartRecovery({ ...base, hasOrder: true })).toBe(false);
    expect(armsCartRecovery({ ...base, cartTouchSent: true })).toBe(false);
    expect(armsCartRecovery({ ...base, checkoutReminderPending: true })).toBe(false);
    expect(armsCartRecovery({ ...base, lastInboundAt: new Date(now.getTime() - 10 * 60_000) })).toBe(false);
    expect(armsCartRecovery({ ...base, lastInboundAt: new Date(now.getTime() - 3 * 60 * 60_000) })).toBe(true);
  });
  it("checkoutSlug e firstNameOf", () => {
    expect(checkoutSlug("https://app.coinzz.com.br/checkout/encorpa-0?utm_source=fb")).toBe("encorpa-0");
    expect(checkoutSlug("https://app.coinzz.com.br/checkout/oferta-site2-0")).toBe("oferta-site2-0");
    expect(checkoutSlug("https://evil.example/checkout/encorpa-0")).toBeNull();
    expect(checkoutSlug("https://app.coinzz.com.br.evil.com/checkout/x")).toBeNull();
    expect(checkoutSlug(null)).toBeNull();
    expect(firstNameOf("MARIA da silva")).toBe("Maria");
    expect(firstNameOf("ana")).toBe("Ana");
    expect(firstNameOf("123")).toBeNull();
    expect(firstNameOf("")).toBeNull();
  });
  it("o texto é o template, dentro da janela vai como texto, fora só com o template declarado — com o slug no botão", () => {
    const lastInbound = new Date(now.getTime() - 60 * 60_000);
    expect(deliveryFor("cart_recovery", rctx({ firstName: "Ana", checkoutSlug: "encorpa-0" }), lastInbound)).toMatchObject({ via: "text" });
    // Not declared (today's secret): blocked, as every touch outside the window without a template.
    expect(deliveryFor("cart_recovery", { ...rctx({ firstName: "Ana", checkoutSlug: "encorpa-0" }), config: prod }, null)).toEqual({ via: "blocked", reason: "no_template" });
    const d = deliveryFor("cart_recovery", rctx({ firstName: "Ana", checkoutSlug: "encorpa-0", marketingOptIn: false }), null);
    expect(d).toMatchObject({ via: "template", name: "encorpa_carrinho_site", language: "pt_BR", variables: ["Ana"], urlButton: "encorpa-0" });
    if (d?.via !== "template") throw new Error("não saiu por template");
    expect(bodyOf("cart_recovery").replace("{{1}}", d.variables[0]!)).toBe(d.body);
    // Without the slug or the name, the template cannot be filled: blocked, never sent half.
    expect(deliveryFor("cart_recovery", rctx({ firstName: "Ana", checkoutSlug: null }), null)).toEqual({ via: "blocked", reason: "empty_variable" });
    expect(deliveryFor("cart_recovery", rctx({ firstName: null, checkoutSlug: "encorpa-0" }), null)).toEqual({ via: "blocked", reason: "empty_variable" });
    expect(renderFollowup("cart_recovery", rctx({ firstName: null }))).toMatch(/^Oi! Aqui é a Malu/);
  });
  it("o texto passa a cadeia de gates com o config de 27/10", () => {
    expect(blocked(renderFollowup("cart_recovery", rctx({ firstName: "Ana" }))!, { stage: "presale" })).toEqual([]);
  });
  it("o turno cancela o toque quando ela escreve; a rota do carrinho confere o token em tempo constante", () => {
    expect(turn).toContain("followups?conversation_id=eq.${conversation.id}&kind=eq.cart_recovery&status=eq.scheduled");
    expect(turn).toContain('if (payload.job === "cart") {');
    expect(turn).toMatch(/if \(payload\.job === "cart"\) \{\n[^\n]*\n\s+const saleToken = Deno\.env\.get\("SALE_WEBHOOK_TOKEN"\) \?\? "";\n\s+if \(saleToken === "" \|\| !sameSecret\(/);
  });
});

describe("Pix pendente", () => {
  it("awaitsPix: só 'Aguardando pagamento' com o código do Pix", () => {
    expect(awaitsPix("Aguardando pagamento", true)).toBe(true);
    expect(awaitsPix("Aguardando pagamento / Aguardando envio", true)).toBe(true);
    // Negation.
    expect(awaitsPix("Aguardando pagamento", false)).toBe(false);
    expect(awaitsPix("Pedido criado", true)).toBe(false);
    expect(awaitsPix("Expirado", true)).toBe(false);
    expect(awaitsPix("Aprovado", true)).toBe(false);
    expect(awaitsPix("Cancelado", true)).toBe(false);
  });
  const at = new Date("2026-10-28T15:00:00Z");
  it("o pedido 'Aguardando pagamento' com Pix arma um toque 30 min depois; sem Pix (cartão, entrega), não", () => {
    const e = onOrderConfirmed([], at, at, "Aguardando pagamento", "o1", null, true);
    expect(e.arm).toEqual([{ kind: "pix_pending", runAt: new Date(at.getTime() + 30 * 60_000) }]);
    expect(onOrderConfirmed([], at, at, "Aguardando pagamento", "o1", null, false).arm).toEqual([]);
    // Never twice.
    expect(onOrderConfirmed([{ kind: "pix_pending", status: "sent", orderId: "o1" }], at, at, "Aguardando pagamento", "o1", null, true).arm).toEqual([]);
  });
  const waiting: ExistingFollowup[] = [{ kind: "pix_pending", status: "scheduled", orderId: "o1" }];
  it("aprovado, expirado ou cancelado cancela o toque do Pix", () => {
    expect(onOrderConfirmed(waiting, at, at, "Aprovado", "o1", null, false).cancel).toContain("pix_pending");
    expect(onOrderConfirmed(waiting, at, at, "Expirado", "o1", null, true).cancel).toContain("pix_pending");
    expect(onOrderConfirmed(waiting, at, at, "Cancelado", "o1", null, false).cancel).toContain("pix_pending");
    // Negation: the same Pix still waiting keeps it; another order of hers still unpaid does not take it.
    expect(onOrderConfirmed(waiting, at, at, "Aguardando pagamento", "o1", null, true).cancel).not.toContain("pix_pending");
    expect(onOrderConfirmed(waiting, at, at, "Aguardando pagamento", "o2", null, true).cancel).not.toContain("pix_pending");
    expect(onOrderConfirmed(waiting, at, at, "Pedido criado", "o2", null, false).cancel).not.toContain("pix_pending");
  });
  it("qualquer pedido cancela o toque do carrinho", () => {
    const cart: ExistingFollowup[] = [{ kind: "cart_recovery", status: "scheduled" }];
    for (const status of ["Aguardando pagamento", "Aprovado", "Cancelado", "Agendado"])
      expect(onOrderConfirmed(cart, at, at, status, "o1", null, false).cancel, status).toContain("cart_recovery");
  });
  it("texto = template, com número e total do pedido; passa os gates", () => {
    const c = rctx({ firstName: "Ana", orderNumber: "12345", amountBrl: 109.9, prepaid: true, paymentPath: "prepay" });
    const d = deliveryFor("pix_pending", c, null);
    expect(d).toMatchObject({ via: "template", name: "encorpa_pix_pendente", variables: ["Ana", "#12345", "R$ 109,90"] });
    if (d?.via !== "template") throw new Error("não saiu por template");
    expect(bodyOf("pix_pending").replace(/\{\{(\d)\}\}/g, (_, n: string) => d.variables[Number(n) - 1]!)).toBe(d.body);
    expect(blocked(d.body, { paymentPath: "prepay", stage: "logistics", orderAmountBrl: 109.9 })).toEqual([]);
    expect(renderFollowup("pix_pending", rctx({ firstName: "Ana", amountBrl: 109.9 }))).toBeNull();
  });
  it("reenviar o Pix: o pedido dela, o código como veio", () => {
    for (const m of ["Reenviar o Pix", "manda o pix de novo", "cadê o código do pix?", "perdi o copia e cola", "me passa o qr code"])
      expect(asksPixCode(m), m).toBe(true);
    for (const m of ["não precisa reenviar o pix", "já paguei o pix", "paguei pelo pix agora", "posso pagar no pix?", "o pix é na hora?"])
      expect(asksPixCode(m), m).toBe(false);
    expect(pixResendTexts({ orderNumber: "12345", pixCode: "000201abc" })).toEqual([
      "Aqui está o Pix do seu pedido #12345 💛 É só copiar o código abaixo e colar no app do seu banco, no Pix Copia e Cola:",
      "000201abc",
    ]);
    expect(pixResendTexts({ pixUrl: "https://pix.example/x" })[1]).toBe("https://pix.example/x");
    expect(pixResendTexts({})).toEqual([]);
    expect(turn).toContain("if (!isResume && parts.some((p: string) => asksPixCode(spoken(p)))) {");
  });
});

describe("silence_3 com o cupom desligado: a retomada", () => {
  const c = (over: Partial<RenderContext> = {}) => rctx({ size: "G", sizeSells: true, marketingOptIn: true, paymentPath: "cod", ...over });
  it("texto = template encorpa_retomada, pela chave própria — nunca o template do cupom", () => {
    const d = deliveryFor("silence_3", c(), null);
    expect(d).toMatchObject({ via: "template", name: "encorpa_retomada", language: "pt_BR", variables: ["G", "R$ 109,90"] });
    if (d?.via !== "template") throw new Error("não saiu por template");
    expect(bodyOf("silence_3_retomada").replace(/\{\{(\d)\}\}/g, (_, n: string) => d.variables[Number(n) - 1]!)).toBe(d.body);
    // The secret of today declares only the coupon's `silence_3`: the retomada is blocked, never sent with the coupon template.
    expect(deliveryFor("silence_3", { ...c(), config: prod }, null)).toEqual({ via: "blocked", reason: "no_template" });
    expect(blocked(d.body, { paymentPath: "cod", stage: "presale" })).toEqual([]);
    expect(blocked(d.body, { paymentPath: "prepay", stage: "presale" })).toEqual([]);
  });
  it("precisa do opt-in de marketing, e sai também no antecipado e com a região desconhecida (nada de caminho no texto)", () => {
    expect(deliveryFor("silence_3", c({ marketingOptIn: false }), null)).toEqual({ via: "blocked", reason: "no_opt_in" });
    expect(deliveryFor("silence_3", c({ paymentPath: "prepay" }), null)).toMatchObject({ via: "template" });
    expect(deliveryFor("silence_3", c({ regionKnown: false }), null)).toMatchObject({ via: "template" });
  });
  it("negação: sem tamanho, kit, sem frete grátis nos dois caminhos, ou o antecipado com outro preço: nada", () => {
    expect(renderFollowup("silence_3", c({ size: "" }))).toBeNull();
    expect(renderFollowup("silence_3", c({ size: "M,G" }))).toBeNull();
    expect(renderFollowup("silence_3", c({ config: { ...withNew, delivery: { ...withNew.delivery, freeShipping: false } } }))).toBeNull();
    expect(renderFollowup("silence_3", c({ paymentPath: "prepay", config: { ...withNew, prices: { ...withNew.prices, prepayBrl: 98.91 } } }))).toBeNull();
  });
  it("com o cupom ligado, o toque continua sendo o do cupom", () => {
    const on = { ...withNew, coupon: { ...withNew.coupon, active: true } };
    expect(renderFollowup("silence_3", c({ config: on }))).toContain("cupom");
  });
});

describe("modo site: sem abertura, mídia só a pedido", () => {
  it("o turno: abertura só para quem veio do anúncio; sem recibo na janela; a origem nunca do texto", () => {
    expect(turn).toContain("const fromAd = Boolean(lead.source || payload.source);");
    expect(turn).toContain("if (isNewLead && fromAd && !isResume && !skipsOpening(");
    expect(turn).toContain("!(siteMode && openNow)) {");
    expect(turn).toContain("const mediaAsked = siteMode && guides.length === 0 && !isResume && openNow && !farewell");
  });
  const kinds = (m: string) => requestedMedia(m, prod).map((b) => b.media?.kind + ":" + b.text.slice(0, 20));
  it("pede o que a mídia mostra: vídeo, foto, avaliação, áudio", () => {
    expect(requestedMedia("tem vídeo?", prod)).toEqual([{ text: FUNNEL_LABELS.video, media: { kind: "video", url: (prod as unknown as { funnel: { media: { video: string } } }).funnel.media.video } }]);
    expect(kinds("manda uma foto dele")).toHaveLength(1);
    expect(kinds("como fica no corpo?")).toHaveLength(1);
    expect(requestedMedia("é bom mesmo? tem avaliação?", prod)[0]!.text).toBe(FUNNEL_LABELS.reviews);
    expect(requestedMedia("funciona mesmo?", prod)[0]!.text).toBe(FUNNEL_LABELS.reviews);
    expect(requestedMedia("pode me mandar um áudio explicando?", prod).map((b) => b.media?.kind)).toEqual(["audio", "audio"]);
  });
  it("negação: recusou, já viu, não consegue tocar, ou a foto é dela (comprovante)", () => {
    for (const m of [
      "não precisa de vídeo",
      "sem vídeo, só me fala o preço",
      "já vi o vídeo no site",
      "o vídeo não abre aqui",
      "não consigo ouvir áudio",
      "não manda áudio",
      "posso mandar foto do comprovante?",
      "vou te mandar uma foto",
      "não é bom mesmo, devolvi",
      "qual tamanho pra 42?",
      "oi",
    ])
      expect(requestedMedia(m, prod), m).toEqual([]);
  });
  it("arquivo ausente no config: nada", () => {
    expect(requestedMedia("tem vídeo?", { ...prod, funnel: { media: {} } })).toEqual([]);
  });
  it("o prompt do site troca a abertura pelo site; o do anúncio fica igual", () => {
    const site = systemPrompt(prod, gateBriefing(prod), null, null, null, { site: true });
    const ad = systemPrompt(prod, gateBriefing(prod), null, null, null, {});
    expect(site).toContain("ELA VEIO DO SITE");
    expect(site).not.toContain("A ABERTURA JÁ FOI");
    expect(ad).toContain("A ABERTURA JÁ FOI");
    expect(ad).not.toContain("ELA VEIO DO SITE");
  });
  it("a primeira resposta a quem veio do site e só cumprimentou pergunta a dúvida", () => {
    const d = openingDirective(prod, "Boa tarde", null, true, true);
    expect(d).toContain("Ela veio do site");
    expect(d).toContain("Me conta, qual a sua dúvida sobre o colete?");
    expect(openingDirective(prod, "Boa tarde", null, true)).toContain("Não sabemos de onde ela veio");
    expect(blocked("Boa tarde! Aqui é a Malu, da Encorpa 💛 Me conta, qual a sua dúvida sobre o colete?")).toEqual([]);
  });
});

describe("o que o checkout contou dela, como fato interno", () => {
  it("checkoutFactLines: o carrinho e o pedido, sem dado pessoal", () => {
    const lines = checkoutFactLines(
      { at: "2026-10-27T17:05:00Z", offerName: "Kit 2", quantity: 2, offerPriceBrl: 197.82 },
      { created_at: "2026-10-27T18:00:00Z", status: "Aguardando pagamento", payment_method: "prepay", amount_brl: "197.82", units: 2 },
    );
    expect(lines).toEqual([
      "carrinho aberto no checkout em 27/10 às 14h: 2 peças (Kit 2), R$ 197,82, sem finalizar",
      'pedido feito em 27/10 às 15h: 2 peças, R$ 197,82, pagamento antecipado, status da plataforma "Aguardando pagamento"',
    ]);
    expect(checkoutFactLines(null, null)).toEqual([]);
  });
  it("o prompt traz as linhas como referência, nunca como mensagem; sem linhas, nada", () => {
    const p = systemPrompt(prod, gateBriefing(prod), null, null, null, { checkoutFacts: ["carrinho aberto no checkout em 27/10 às 14h: 1 peça, sem finalizar"] });
    expect(p).toContain("O QUE O CHECKOUT DA COINZZ CONTOU DELA — referência sua, NUNCA formato de mensagem.");
    expect(p).toContain("[carrinho aberto no checkout em 27/10 às 14h: 1 peça, sem finalizar]");
    expect(systemPrompt(prod, gateBriefing(prod), null)).not.toContain("O QUE O CHECKOUT DA COINZZ CONTOU DELA");
    expect(turn).toContain("checkoutFacts: checkoutFactLines(lead.cart ?? null, newestOrder)");
  });
});

describe("um checkout com os dois pagamentos: um link só (resíduo do §133)", () => {
  const url = "https://app.coinzz.com.br/checkout/encorpa-0?name=Ana";
  it("um link, os dois jeitos de pagar ditos, e a oferta continua lida como 'both'", () => {
    const bubbles = bothLinksBubbles(prod, "São Paulo", url, url, "G");
    const all = bubbles.map((b) => b.text).join("\n");
    expect(all.split(url).length - 1).toBe(1);
    expect(all).toContain("🟢 *Pagar SÓ Quando Receber*");
    expect(all).toContain("🔵 Ou pagar agora, no Pix ou no cartão");
    expect(all).not.toContain("oferta especial");
    expect(offerKindOf(bubbles.find((b) => !b.media)!.text, prod)).toBe("both");
    expect(bubbles.find((b) => !b.media)!.text.startsWith(BOTH_HEADLINE)).toBe(true);
  });
  it("negação: dois checkouts diferentes, o fluxo de antes (link da entrega primeiro)", () => {
    const all = bothLinksBubbles(prod, "São Paulo", "https://entrega.logzz.com.br/pay/x", url, "G").map((b) => b.text).join("\n");
    expect(all).toContain("Se não aparecer me fala aqui que a gente utiliza outro método");
    expect(oneCheckout("https://entrega.logzz.com.br/pay/x", url)).toBe(false);
    expect(oneCheckout(url, "https://app.coinzz.com.br/checkout/encorpa-0?document=1")).toBe(true);
    expect(oneCheckout(null, url)).toBe(false);
  });
  it("o turno não manda o 'oferta especial' com o mesmo link, e a diretiva diz que o link já tem o Pix", () => {
    expect(turn).toContain("!oneCheckout(CONFIG.checkout?.codUrl, CONFIG.checkout?.prepayUrl) &&");
    expect(regionDirectiveFor({ cod: false, sameDay: false }, null, false, true, false, prod.prices, null, true)).toContain("no mesmo link ela paga no Pix ou no cartão");
    expect(regionDirectiveFor({ cod: false, sameDay: false }, null, false, true, false, prod.prices, null, false)).toContain("manda o 🔵");
  });
});

describe("o envio do template com o botão de URL", () => {
  it("templateMessage leva o slug como componente do botão; sem botão, igual a antes", () => {
    expect(templateMessage("5511", "encorpa_carrinho_site", "pt_BR", ["Ana"], "encorpa-0").template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Ana" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "encorpa-0" }] },
    ]);
    expect(templateMessage("5511", "x", "pt_BR", []).template).toEqual({ name: "x", language: { code: "pt_BR" } });
  });
  it("a varredura passa o urlButton ao n8n", () => {
    expect(turn).toContain("...(delivery.urlButton ? { urlButton: delivery.urlButton } : {})");
  });
});

describe("n8n: o carrinho abandonado da Coinzz", () => {
  const wf = JSON.parse(readFileSync("n8n/workflows/carrinho-abandonado.json", "utf8")) as { nodes: Array<{ name: string; parameters: { jsCode?: string; jsonBody?: string } }> };
  const code = wf.nodes.find((n) => n.name === "Normaliza o carrinho")!.parameters.jsCode!;
  const normalize = (payload: unknown) =>
    (new Function("$input", code)({ first: () => ({ json: payload }) }) as Array<{ json: { ok: boolean; missing: string; cart: Record<string, unknown>; raw: string } }>)[0]!.json;
  const client = { client_name: "Ana Souza", client_phone: "(11) 98765-4321", client_document: "12345678900", client_email: "ana@x.com", client_street: "Rua A", client_address_number: "10", client_address_comp: "ap 2", client_zip_code: "01310100", client_address_city: "São Paulo", client_address_state: "SP" };
  it("items como objeto ou como lista", () => {
    const one = normalize({ body: { client, items: { offer_name: "1 Colete", quantity: 1, product_name: "Colete", offer_price: 109.9 }, postback_name: "Carrinho Abandonado", checkout_url: "https://app.coinzz.com.br/checkout/encorpa-0" } });
    expect(one.ok).toBe(true);
    expect(one.cart).toEqual({ phone: "11987654321", name: "Ana Souza", offerName: "1 Colete", quantity: 1, offerPrice: 109.9, checkoutUrl: "https://app.coinzz.com.br/checkout/encorpa-0" });
    const list = normalize({ body: { client, items: [{ offer_name: "Kit 2", quantity: "2", offer_price: "197,82" }], checkout_url: null } });
    expect(list.cart).toMatchObject({ offerName: "Kit 2", quantity: 2, offerPrice: "197,82", checkoutUrl: null });
  });
  it("sem telefone vai ao operador, e o payload cru sai sem CPF, e-mail e endereço", () => {
    const r = normalize({ body: { client: { ...client, client_phone: null }, items: [] } });
    expect(r.ok).toBe(false);
    expect(r.missing).toBe("phone");
    expect(r.raw).not.toContain("12345678900");
    expect(r.raw).not.toContain("ana@x.com");
    expect(r.raw).not.toContain("Rua A");
  });
  it("as regras do n8n passam, e pegam a chamada do carrinho sem o token", () => {
    const full = JSON.parse(readFileSync("n8n/workflows/carrinho-abandonado.json", "utf8")) as N8nWorkflow;
    expect(checkWorkflow(full)).toEqual([]);
    const semToken = { ...full, nodes: full.nodes.map((n) => (n.name === "Grava o carrinho" ? { ...n, parameters: { ...n.parameters, jsonBody: '={{ JSON.stringify({ job: "cart", cart: $json.cart }) }}' } } : n)) };
    expect(checkWorkflow(semToken).join()).toContain("does not forward the webhook token");
  });
  it("a chamada leva job cart e o token da URL", () => {
    const body = wf.nodes.find((n) => n.name === "Grava o carrinho")!.parameters.jsonBody!;
    expect(body).toContain('job: "cart"');
    expect(body).toContain("query.token");
  });
});

describe("n8n: a venda passa o número, o nome, a oferta e o Pix", () => {
  const wf = JSON.parse(readFileSync("n8n/workflows/venda-confirmada.json", "utf8")) as { nodes: Array<{ name: string; parameters: { jsCode?: string } }> };
  const code = wf.nodes.find((n) => n.name === "Normaliza a venda")!.parameters.jsCode!;
  const normalize = (payload: unknown) => (new Function("$input", code)({ first: () => ({ json: payload }) }) as Array<{ json: { order: Record<string, unknown> } }>)[0]!.json;
  it("Coinzz aguardando o Pix", () => {
    const r = normalize({
      query: { fonte: "coinzz" },
      body: {
        client: { client_name: "Ana Souza", client_phone: "11987654321" },
        order: { order_number: "12345", order_status: "Aguardando pagamento", order_quantity: 1, order_final_price: 109.9, method_payment: "pix", url_pix: "https://pix.example/1", qrcode_pix: "000201abc", offer_name: "1 Colete" },
      },
    });
    expect(r.order).toMatchObject({ externalId: "12345", orderNumber: "12345", customerName: "Ana Souza", offerName: "1 Colete", pixUrl: "https://pix.example/1", pixCode: "000201abc", status: "Aguardando pagamento", paymentMethod: "prepay" });
  });
  it("a data de entrega aninhada da Coinzz não é adivinhada (sem fixture que prove o campo)", () => {
    const r = normalize({ query: { fonte: "coinzz" }, body: { client: { client_phone: "11987654321" }, order: { order_number: "1", order_final_price: 1, delivery_time: "2026-10-30", deadline_delivery: "2026-10-30" } } });
    expect(r.order.scheduledFor).toBeNull();
  });
});

// Type-level: the two new kinds are FollowupKinds the sweep can carry.
const _kinds: FollowupKind[] = ["cart_recovery", "pix_pending"];
void _kinds;
