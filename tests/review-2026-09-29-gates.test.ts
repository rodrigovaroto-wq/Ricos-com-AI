import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates, type GateConfig } from "@/agent/guardrails.js";
import { freightBriefing } from "@/agent/prompt.js";
import type { BusinessConfig } from "@/config/business.js";
import { config as fixture, ctx } from "./fixtures.js";

/**
 * The risk review of PR #39 (docs/agente-ia/08-mudancas/revisao-pr39.md, achados 2–5) and the two
 * operator decisions of 2026-09-29 (on the prepaid path she never pays at the door; the courier does
 * not wait for her to try the vest on). Every heuristic here is read both ways
 * (`.claude/memory/negation-blindness.md`): the negated lie still vetoes, and the honest line with an
 * unrelated negative still passes. Each runs through the whole `runGates` chain with the example
 * config — the production shape — with `delivery.codFreeShipping` absent (the secret), `true` and
 * `false`, and with the test fixture.
 */

type Path = "cod" | "prepay";
const BOTH: readonly Path[] = ["cod", "prepay"];

const example = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const { codFreeShipping: _absent, ...withoutKey } = example.delivery;
const absent: BusinessConfig = { ...example, delivery: withoutKey };
const off: BusinessConfig = { ...example, delivery: { ...example.delivery, codFreeShipping: false } };
/** Where the canonical free sentence passes: the key absent (the secret) or `true`. */
const FREE_ON_DELIVERY = { "codFreeShipping ausente": absent, "codFreeShipping true": example } as const;
const EXAMPLE = { ...FREE_ON_DELIVERY, "codFreeShipping false": off } as const;
/** The fixture has no prepaid discount nor kits: no price names the prepaid offer there. */
const ALL = { ...EXAMPLE, "fixture de teste": fixture } as const;

const blockedBy = (text: string, config: GateConfig, paymentPath: Path) =>
  runGates(text, ctx({ config, paymentPath })).traces
    .filter((t) => t.verdict === "block")
    .map((t) => t.gate);

const C = "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.";

it("a frase canônica passa onde a entrega é grátis, e é o ponto de partida das sondas", () => {
  for (const config of Object.values(FREE_ON_DELIVERY)) for (const p of BOTH) expect(blockedBy(C, config, p)).toEqual([]);
});

/** Achado 2: `honest` took any "não/nunca/nem" in the sentence as a denial of the free shipping. */
const NEGATION_THAT_DENIES_NOTHING = [
  `${C} No pix também, não se preocupe.`,
  `${C} No cartão também, fica tranquila que não tem pegadinha.`,
  `${C} No pix nem precisa esperar, vale igual.`,
  `${C} No antecipado também, nunca cobramos nada a mais por isso.`,
];
/** The denial that governs the free shipping, or the freight said to be charged there: honest. */
const DENIAL_THAT_DENIES = [
  `${C} No pix não tem frete grátis, ele é calculado no checkout.`,
  `${C} No antecipado o frete não é grátis: o valor aparece no checkout, antes de pagar.`,
  `${C} No pix o frete não é igual ao da entrega: ele é calculado no checkout.`,
  `${C} No pix não é grátis.`,
];

/** Achado 3: `FREIGHT_CHARGED` read a bare "checkout" as charged; `names` missed the prepaid price. */
const CHARGED_WITHOUT_CHARGING = [
  `${C} No pix também, o frete já sai zerado no checkout.`,
  `${C} No pix também, o frete já vem resolvido no checkout.`,
  `${C} No pix o frete não é cobrado no checkout.`,
  `${C} No pix nem o frete é calculado.`,
];
const PREPAID_PRICE_AS_NAME = [
  `${C} Na oferta de R$ 116,91 também.`,
  `${C} Na de R$ 116,91 é igual.`,
  `${C} Levando 2, na oferta de R$ 207,84, vale também.`,
  `${C} E na de R$ 272,79? Também!`,
];
const CHARGED_HONEST = [
  `${C} No pix o frete é calculado por região no checkout.`,
  `${C} No antecipado o frete é cobrado à parte, e o valor aparece no checkout.`,
  `${C} No pix sai R$ 116,91, com 10% de desconto, e o frete é calculado no checkout.`,
];

describe.each(Object.entries(ALL))("achados 2 e 3: a extensão da frase canônica (%s)", (_name, config) => {
  it.each([...NEGATION_THAT_DENIES_NOTHING, ...CHARGED_WITHOUT_CHARGING])("veta pelo frete: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toMatchObject({ p, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
});
describe.each(Object.entries(EXAMPLE))("achado 3: o preço do antecipado nomeia o caminho (%s)", (_name, config) => {
  it.each(PREPAID_PRICE_AS_NAME)("veta pelo frete: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toMatchObject({ p, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
});
describe.each(Object.entries(FREE_ON_DELIVERY))("achados 2 e 3: a negação e a cobrança de verdade passam (%s)", (_name, config) => {
  it.each([...DENIAL_THAT_DENIES, ...CHARGED_HONEST])("passa: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toEqual({ p, blocked: [] });
  });
});

/** Achado 4: the free word with no "frete" beside it, in a sentence that names another payment. */
const FREE_BY_PAYMENT = [
  "No pix também é grátis.",
  "O frete no pix sai sem custo nenhum.",
  "No pix sai de graça.",
  "No cartão também é gratuito.",
  "Pelo site o envio é grátis.",
  "No pix o frete sai zerado.",
  "No antecipado a entrega sai sem custo.",
  // The negation that denies something else.
  "Não se preocupe: no pix também é grátis.",
  "No pix não precisa se preocupar, é grátis.",
  "Nem precisa perguntar, no pix é grátis.",
  "No pix não tem taxa e é grátis.",
];
/** The honest neighbours: the denial of the free, and the exchange and return, free on both paths. */
const FREE_BY_PAYMENT_HONEST = [
  "No pix não tem frete grátis, ele é calculado no checkout.",
  "No pix o frete não é grátis.",
  "No pix não é grátis.",
  "No pix a troca é grátis.",
  "No pix, se não servir, a devolução não tem custo nenhum pra você.",
  "No antecipado a devolução é sem custo pra você.",
  "Pagando no pix ou na entrega, a troca de tamanho é grátis.",
];
describe.each(Object.entries(ALL))("achado 4: grátis sem a palavra frete, no outro pagamento (%s)", (_name, config) => {
  it.each(FREE_BY_PAYMENT)("veta pelo frete: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toMatchObject({ p, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
  it.each(FREE_BY_PAYMENT_HONEST)("passa: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toEqual({ p, blocked: [] });
  });
  it("a troca grátis não abre o frete: 'No pix a troca é grátis e o frete também.' veta", () => {
    for (const p of BOTH) expect(blockedBy("No pix a troca é grátis e o frete também.", config, p)).toContain("shipping_promise");
  });
});

/** Achado 5: bare "link", "checkout" and "cartão" are true on the delivery path too. */
const DELIVERY_NEIGHBOURS = [
  `${C} Te mando o link?`,
  `${C} Na porta você pode pagar em dinheiro ou cartão.`,
  `${C} Aceita dinheiro ou cartão na hora da entrega.`,
  `${C} Entrega em 1 a 3 dias, agendada — quem escolhe o dia é você, no checkout.`,
];
const STILL_EXTENDS = [
  `${C} No pix também.`,
  `${C} Pelo site também sai assim.`,
  `${C} No cartão online também.`,
  `${C} Cartão também.`,
  `${C} No link também.`,
  `${C} E no checkout? Também!`,
  `${C} Nos cartões também.`,
];
describe.each(Object.entries(FREE_ON_DELIVERY))("achado 5: link, checkout e cartão da entrega (%s)", (_name, config) => {
  it.each(DELIVERY_NEIGHBOURS)("passa no caminho da entrega: %s", (text) => {
    expect(blockedBy(text, config, "cod")).toEqual([]);
  });
  it.each(STILL_EXTENDS)("veta pelo frete: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toMatchObject({ p, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
});
describe("achado 5: prompt e briefing do gate dizem a mesma regra, sem o link da entrega", () => {
  const promptText = freightBriefing(example).join(" ");
  const gateText = gateBriefing(example).join(" ");
  it.each([promptText, gateText])("cita o antecipado, o pix, o cartão online e o site, e não o link", (text) => {
    expect(text).toContain("do antecipado, do pix, do cartão online, do site");
    expect(text).not.toMatch(/do site ou do link/);
  });
});

/** Operator, 2026-09-29: on the prepaid path she pays before, in the checkout — never at the door. */
const DOOR_PAYMENT = [
  "Você não paga nada agora.",
  "O pagamento é só quando o colete chegar na sua mão.",
  "Você paga na entrega.",
  "Você paga pro entregador.",
  "Você paga quando receber.",
  "Você paga R$ 116,91 quando o colete chegar.",
  "Pode pagar na porta, direto ao entregador.",
  // The negation that denies something else.
  "Não se preocupe, você paga na entrega.",
  "Fica tranquila, não tem pegadinha: você paga só quando receber.",
  "No pix não tem taxa, e você paga pro entregador.",
];
const PREPAID_HONEST = [
  "Aqui o pagamento na entrega não chega, então é pelo antecipado.",
  "No antecipado você paga antes, no checkout, com 10% de desconto: R$ 116,91.",
  "A entrega com pagamento na porta não atende seu CEP.",
  "No antecipado você não paga na entrega: paga antes, no checkout.",
  "No antecipado não dá pra pagar na entrega.",
  "No seu CEP não tem pagamento na entrega, só o antecipado.",
  // The delivery path named as the condition: true about that path (grafo §33).
  C,
  "No pagamento na entrega ela não paga nada agora e tem 7 dias após o recebimento pra devolver.",
];
describe.each(Object.entries(ALL))("decisão de 2026-09-29: no antecipado não se paga na porta (%s)", (_name, config) => {
  it.each(DOOR_PAYMENT)("veta no antecipado, passa na entrega: %s", (text) => {
    expect(blockedBy(text, config, "prepay")).toContain("charge_promise");
    expect(blockedBy(text, config, "cod")).not.toContain("charge_promise");
  });
  it.each(PREPAID_HONEST)("não veta pelo pagamento: %s", (text) => {
    for (const p of BOTH) expect(blockedBy(text, config, p)).not.toContain("charge_promise");
  });
  it("o briefing diz que só vale no pagamento na entrega", () => {
    // `charge_promise` is the first rewrite gate of the chain, so its line comes first.
    expect(gateBriefing(config)[0]).toMatch(/só no pagamento na entrega/);
  });
});

/** Operator, 2026-09-29: the courier does not wait for her to try it on. On every path. */
const TRY_BEFORE_PAYING = [
  "Você recebe, veste e só então paga.",
  "Você vê, veste, e só paga se estiver tudo certo.",
  "Você pode experimentar antes de pagar o entregador.",
  "Você só paga se, ao se olhar no espelho, achar que valeu.",
  "Prova antes de pagar.",
  "Por isso você só paga depois de vestir.",
  "O entregador espera você provar.",
  "Você só paga se servir.",
  // The negation that denies something else.
  "Não precisa ter medo: você pode experimentar antes de pagar.",
  "Não se preocupe, você veste e só depois paga.",
  "Você não precisa decidir agora e pode provar antes de pagar.",
];
const TRY_HONEST_COD = [
  "Você vê o colete antes de pagar, e se não for o que esperava não fica com ele.",
  "Você paga na entrega e, se não servir, tem 7 dias pra devolver.",
];
const TRY_HONEST = [
  "Veste por baixo e a roupa assenta diferente.",
  "Depois de receber, vista com a sua roupa: se não gostar, tem 7 dias pra devolver.",
  "Isso é prova social: quem usa indica pras amigas.",
  "O entregador não espera você provar: você recebe, paga e tem 7 dias pra devolver.",
  "Você não pode experimentar antes de pagar, mas tem 7 dias pra devolver.",
  "Não dá pra provar antes de pagar, mas se não servir você devolve em 7 dias.",
  "Você recebe, veste com a sua roupa, se olha no espelho — e só então decide.",
  "O colete veste bem e você paga R$ 129,90.",
];
describe.each(Object.entries(ALL))("decisão de 2026-09-29: ela não veste antes de pagar (%s)", (_name, config) => {
  it.each(TRY_BEFORE_PAYING)("veta nos dois caminhos: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toMatchObject({ p, blocked: expect.arrayContaining(["charge_promise"]) });
  });
  it.each(TRY_HONEST_COD)("passa na entrega: %s", (text) => {
    expect(blockedBy(text, config, "cod")).toEqual([]);
  });
  it.each(TRY_HONEST)("passa nos dois caminhos: %s", (text) => {
    for (const p of BOTH) expect({ p, blocked: blockedBy(text, config, p) }).toEqual({ p, blocked: [] });
  });
  it("o briefing diz que o entregador não espera ela vestir", () => {
    expect(gateBriefing(config)[0]).toMatch(/entregador não espera/);
  });
});
