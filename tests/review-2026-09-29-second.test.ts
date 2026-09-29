import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksForTestimonial, runGates, type GateContext } from "@/agent/guardrails.js";
import type { BusinessConfig } from "@/config/business.js";
import { config as fixture, ctx } from "./fixtures.js";

/**
 * The second independent review of the gates (2026-09-29), after grafo §37, and the residue of §36
 * (testimonials only when she asks, R16.7). Every sentence runs through the whole `runGates` chain with
 * the example config without `delivery.codFreeShipping` — the production secret's shape — on the cash
 * on delivery path unless the row says otherwise. Every exemption comes with the lie it would free,
 * proved still vetoed (grafo, Lição 1).
 */
const example = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const { codFreeShipping: _absent, ...withoutKey } = example.delivery;
const config: BusinessConfig = { ...example, delivery: withoutKey };

const NO_COD: Partial<GateContext> = { codUnavailable: true, paymentPath: "prepay" };
const PREPAID_ORDER: Partial<GateContext> = { paymentPath: "prepay", stage: "logistics" };

const run = (text: string, extra: Partial<GateContext> = {}) => runGates(text, ctx({ config, ...extra }));
const blockedBy = (text: string, extra: Partial<GateContext> = {}) =>
  run(text, extra).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const vetoes = (gate: string, rows: ReadonlyArray<readonly [string, Partial<GateContext>]>) =>
  it.each(rows)(`veta por ${gate}: %s`, (text, extra) => expect(blockedBy(text, extra)).toContain(gate));
const passes = (rows: ReadonlyArray<readonly [string, Partial<GateContext>]>) =>
  it.each(rows)("passa a cadeia inteira: %s", (text, extra) => expect(blockedBy(text, extra)).toEqual([]));

describe("achado 1: a negação do predicado colada ao pagamento na porta, nunca 60 caracteres adiante", () => {
  const LIES = [
    "Você paga na entrega e não tem taxa nenhuma.",
    "Você paga na entrega, não é ótimo?",
    "Você paga quando receber e não tem risco nenhum.",
    "Você paga na entrega, então não tem risco.",
    "Você não paga nada agora e não tem risco.",
    // What the glued denial would free if it read any "é": the option is not off here.
    "Pagar na entrega não é problema nenhum.",
    "Pagar na entrega não chega a ser caro.",
    "Você paga na entrega, infelizmente, não tem como parcelar.",
  ];
  vetoes("charge_promise", [...LIES.map((s) => [s, NO_COD] as const), ...LIES.slice(0, 5).map((s) => [s, PREPAID_ORDER] as const)]);
  passes(
    [
      "Pagar na entrega não está disponível no seu CEP.",
      "O pagamento na entrega não chega aí, então é antecipado.",
      "Aí no seu CEP não tem pagamento na entrega.",
      "No seu CEP não dá pra pagar na entrega: você paga antes, pelo link.",
      "Infelizmente a entrega com pagamento no recebimento não atende sua região.",
      "Pagar na entrega, infelizmente, não dá no seu CEP.",
    ].map((s) => [s, NO_COD] as const),
  );
});

describe("achado 2: o grátis sem frete na resposta à pergunta que nomeou outro pagamento", () => {
  vetoes(
    "shipping_promise",
    [
      "E no pix? Também é grátis, igual na entrega.",
      "E no pix? Sim! É grátis também, igual ao pagamento na entrega.",
      "No pix o frete é à parte? Não! É grátis também.",
      "No pix? Boa pergunta. É grátis também!",
      // A question that names no payment does not end the one that did.
      "E no pix? Não sai grátis? Sai sim, é grátis.",
      // The canonical sentence answers it and the extension rule still reads the question.
      "E no pix? Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.",
      // `honest` does not take "não é grátis só na entrega".
      "E no pix? Não é grátis só na entrega, é grátis também.",
    ].map((s) => [s, {}] as const),
  );
  passes(
    [
      "E na entrega? É grátis!",
      "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.",
      "E no pix? No pix o frete é calculado por região no checkout.",
      "Prefere pagar no pix? A devolução é sem custo nenhum.",
      "E no pix? No pix o frete é calculado no checkout. E na entrega? É grátis!",
      "E no pix? No pix não é grátis.",
    ].map((s) => [s, {}] as const),
  );
});

describe("achado 3: sem entrega na praça, o remédio do frete não ensina a frase da entrega", () => {
  it("o texto que o veto ensina passa a cadeia no mesmo contexto", () => {
    const detail = run("No pix o frete é grátis.", NO_COD).traces.find((t) => t.gate === "shipping_promise" && t.verdict === "block")?.detail ?? "";
    expect(detail).not.toMatch(/Pagando na entrega/);
    const taught = [...detail.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(taught.length).toBeGreaterThan(0);
    for (const s of taught) expect(blockedBy(s, NO_COD)).toEqual([]);
  });
  it("onde a entrega chega, o remédio segue ensinando a frase canônica", () => {
    const detail = run("No pix o frete é grátis.").traces.find((t) => t.gate === "shipping_promise")?.detail ?? "";
    expect(detail).toMatch(/Pagando na entrega o frete é grátis/);
  });
});

describe("achado 4: o pagamento na chegada por qualquer sujeito, e o 'não é antes'", () => {
  vetoes(
    "charge_promise",
    [
      "Você paga quando o entregador chegar.",
      "Você paga quando o carteiro chegar aí.",
      "Você paga só quando o motoboy trouxer.",
      "O pagamento não é antes, é só na entrega.",
      "Você não paga nada na hora, só quando receber.",
    ].map((s) => [s, NO_COD] as const),
  );
});

describe("achado 5: 'não paga nada na hora da entrega' é o pedido antecipado já pago", () => {
  passes([
    ["Você não paga nada na hora da entrega, já está pago.", PREPAID_ORDER],
    ["Você não paga nada na hora da entrega, já está pago.", NO_COD],
  ]);
  vetoes("charge_promise", [
    ["Você não paga nada agora.", PREPAID_ORDER],
    ["Você não paga nada na hora.", NO_COD],
  ]);
});

describe("achados 6 e 7: escassez fora do 'vou pensar'", () => {
  passes([
    ["Só tenho 2 perguntas rapidinhas pra você.", {}],
    ["Só tem 1 jeito de pagar aí: antecipado.", { paymentPath: "prepay" }],
    ["Nos últimos dias muita gente pediu o M.", {}],
    ["Você tem 7 dias pra devolver, e nos últimos dias também vale.", {}],
    ["Resta uma dúvida?", {}],
    ["Restam 12 unidades.", { postponing: true }],
  ]);
  vetoes(
    "scarcity_claim",
    [
      "Últimas 12 unidades!",
      "Tá acabando o estoque.",
      "Tenho só mais 12.",
      "Esse desconto é só hoje.",
      "Restam apenas doze unidades.",
      // What the stock-noun and look-back rules would free, still vetoed.
      "Só temos 3 pra pronta entrega.",
      "Só tenho 2 no M.",
      "Últimos dias!",
      "Nos últimos dias da promoção sai mais barato.",
      "São as últimas horas do desconto.",
    ].map((s) => [s, {}] as const),
  );
});

describe("achado 8: a garantia pela raiz 'garant'", () => {
  vetoes(
    "warranty_promise",
    [
      "Posso garantir o seu colete por 30 dias.",
      "A gente garante 30 dias.",
      "Vale garantir o seu colete, são 30 dias de garantia.",
      "Garantir o seu: 30 dias pra devolver.",
    ].map((s) => [s, {}] as const),
  );
  passes([["Vale garantir o seu logo: no antecipado chega em média em 5 dias úteis.", { paymentPath: "prepay" }]]);
});

describe("achado 9: a dor que some, o alívio como substantivo, e o incômodo da roupa", () => {
  vetoes(
    "health_claim",
    [
      "Ajuda na postura e a dor nas costas some.",
      "Com a postura certa, a dor nas costas diminui.",
      "Ajuda na postura e dá um alívio na dor.",
      // The narrowed "incômodo" still vetoes the body and the bare word.
      "Alivia o incômodo.",
      "Tira o incômodo nas costas.",
    ].map((s) => [s, {}] as const),
  );
  passes(
    [
      "Ele tira o incômodo da barriga marcando na roupa.",
      "A dor não some com o colete, ele ajuda na postura.",
      "Não prometo que a dor diminui: ele ajuda na postura enquanto está vestido.",
    ].map((s) => [s, {}] as const),
  );
});

describe("achado 10: o que é grátis dito logo depois da palavra", () => {
  passes(
    ["Prefere pagar no pix? É sem custo nenhum a devolução.", "No pix? É sem custo nenhum pra você gerar o código."].map((s) => [s, {}] as const),
  );
  vetoes(
    "shipping_promise",
    ["É grátis no pix e a devolução também.", "No pix? É sem custo nenhum pra você gerar o código, e o frete também.", "No pix? É sem custo nenhum a troca."].map(
      (s) => [s, {}] as const,
    ),
  );
});

describe("resíduo R16.7: depoimento só quando ela pedir", () => {
  it.each([
    "Tem depoimento?",
    "Quero ver avaliações",
    "Qual a opinião de quem já usou?",
    "Tem no Reclame Aqui?",
    "Quem já comprou gostou?",
    "Outras clientes aprovaram?",
    "Funciona mesmo?",
    "É confiável?",
    "Isso não é golpe, né?",
    "Tem alguma referência?",
    "Tem feedback?",
    "Qual o resultado?",
    "Tem foto de antes e depois?",
    "Me passa o zap de uma cliente",
    // Broad on purpose: a negation still reads as asking, and a false positive only restores the old behaviour.
    "Não quero depoimento, só quero comprar",
  ])("pede: %s", (message) => expect(asksForTestimonial(message)).toBe(true));
  it.each(["Quero o M", "Quanto custa?", "Dá pra pagar na entrega?", "Não quero agora, obrigada", "Qual o prazo pro meu CEP?", "Veste bem em quem tem barriga?"])(
    "não pede: %s",
    (message) => expect(asksForTestimonial(message)).toBe(false),
  );

  const UNASKED = [
    "Se quiser ver alguns depoimentos, é só acessar nosso site e rolar até a seção de depoimentos.",
    "Quer ver as avaliações das clientes?",
    "Vale ver o que as clientes dizem no site.",
  ];
  const known = fixture.testimonials![0]!;
  it.each(UNASKED)("sem ela pedir, veta: %s", (text) => {
    expect(blockedBy(text, { askedTestimonial: false })).toContain("invented_testimonial");
  });
  it("sem ela pedir, veta também o depoimento real citado", () => {
    expect(blockedBy(`Uma cliente disse: "${known}"`, { knownTestimonials: [known], askedTestimonial: false })).toContain("invented_testimonial");
  });
  it.each(UNASKED)("quando ela pede, passa: %s", (text) => {
    expect(blockedBy(text, { askedTestimonial: asksForTestimonial("Tem depoimento de cliente?") })).toEqual([]);
  });
  it("quando ela pede, o depoimento real citado passa", () => {
    expect(blockedBy(`Uma cliente disse: "${known}"`, { knownTestimonials: [known], askedTestimonial: true })).toEqual([]);
  });
  it.each(UNASKED)("sem o sinal (varredura, respostas fixas), o gate fica como antes: %s", (text) => {
    expect(blockedBy(text)).toEqual([]);
  });
  it("uma resposta sem depoimento passa quando ela não pediu", () => {
    expect(blockedBy("Além de modelar, ele ajuda na postura.", { askedTestimonial: false })).toEqual([]);
  });
  it("o turno de produção passa o sinal no runGates da conversa, lido da mensagem dela", () => {
    // `index.ts` is Deno and outside the tsconfig: its wiring is read as source, as in function-drift.
    const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
    const call = /gates = runGates\(attempt\.text, \{[^]*?\n {4}\}\);/.exec(source)?.[0] ?? "";
    expect(call).toContain("knownTestimonials: CONFIG.testimonials");
    expect(call).toContain('askedTestimonial: asksForTestimonial(inbound.body ?? "")');
  });
});
