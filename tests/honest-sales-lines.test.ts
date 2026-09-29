import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates, type GateConfig } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * The guard against over-restriction (operator, 2026-09-28): "Não deixe as travas e guardrails
 * tão fortes, pois podem limitar a atuação do agente e prejudicar a venda por limitar coisas que
 * são verdades e agregam valor." Every sentence below is TRUE for this operation and helps the
 * sale, and each one runs through the FULL `runGates` chain with the example config — the mirror
 * of the production `BUSINESS_CONFIG` — on the payment paths where it is true. A gate that starts
 * vetoing one of them fails here, before it costs a rewrite in a real conversation.
 *
 * Next to them, the mirror lie of each: the same value said where it is not true. Loosening a
 * gate to free an honest line has opened a lie before (grafo §Lições 1), so both sides live in
 * the same file.
 */

type Path = "cod" | "prepay";
const BOTH: readonly Path[] = ["cod", "prepay"];
const COD: readonly Path[] = ["cod"];

const example = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as GateConfig;
// Production's secret was written before `codFreeShipping` existed: the key is ABSENT there.
const { codFreeShipping: _absent, ...deliveryWithoutKey } = example.delivery;
const configs = {
  "config de exemplo": example,
  "secret sem a chave codFreeShipping": { ...example, delivery: deliveryWithoutKey },
} as const;

const blockedBy = (text: string, config: GateConfig, paymentPath: Path, units?: number) =>
  runGates(text, ctx({ config, paymentPath, ...(units ? { units } : {}) })).traces
    .filter((t) => t.verdict === "block")
    .map((t) => t.gate);

it("o exemplo carrega a decisão de 2026-09-28: grátis só na entrega", () => {
  expect(example.delivery.freeShipping).toBe(false);
  expect(example.delivery.codFreeShipping).toBe(true);
  expect(example.prices.prepayDiscountPercent).toBe(10);
});

const HONEST: Array<{ text: string; paths: readonly Path[] }> = [
  // Frete grátis na entrega: só nas frases canônicas (grafo §32), a primeira é a que o prompt ensina.
  { text: "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis! 💛", paths: BOTH },
  { text: "E olha, pagando na entrega o frete é grátis: você só paga quando receber.", paths: BOTH },
  { text: "Lembrando que no pagamento na entrega o frete é grátis, você paga R$ 129,90 quando o colete chegar.", paths: BOTH },
  { text: "Na entrega não tem frete, você paga R$ 129,90 e mais nada.", paths: BOTH },
  { text: "Na entrega não tem frete: você paga só R$ 129,90.", paths: BOTH },
  { text: "Frete grátis pagando na entrega!", paths: BOTH },
  { text: "Frete grátis na entrega.", paths: BOTH },
  { text: "O frete na entrega é gratuito.", paths: BOTH },
  { text: "Na entrega o frete é grátis, sem nada a mais na porta.", paths: BOTH },
  { text: "Na entrega nenhum frete a mais: você paga R$ 129,90 na porta.", paths: BOTH },
  // O frete do antecipado, dito com honestidade — inclusive negando o grátis.
  { text: "No antecipado o frete é calculado por região, e o valor aparece pra você no checkout, antes de pagar.", paths: BOTH },
  { text: "No pix não tem frete grátis, ele é calculado no checkout.", paths: BOTH },
  { text: "No antecipado o frete não é grátis: o valor aparece no checkout, antes de pagar.", paths: BOTH },
  { text: "No antecipado o frete não é grátis, é calculado no checkout.", paths: BOTH },
  { text: "No pix o frete é calculado por região. Pagando na entrega o frete é grátis.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis. No antecipado a garantia também é de 7 dias.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis. No pix não tem frete grátis, ele é calculado no checkout.", paths: BOTH },
  { text: "No pix o frete não é igual ao da entrega: ele é calculado no checkout.", paths: BOTH },
  // Cada caminho na sua frase: o desconto do antecipado depois da frase canônica.
  { text: "Pagando na entrega o frete é grátis. No pix você ganha 10% de desconto.", paths: BOTH },
  // Desconto do antecipado e dos kits.
  { text: "No antecipado você tem 10% de desconto: sai R$ 116,91.", paths: BOTH },
  { text: "10% de desconto: R$ 116,91 no antecipado.", paths: BOTH },
  { text: "Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega.", paths: BOTH },
  { text: "Na entrega, 3 peças saem por R$ 311,76, com 20% de desconto.", paths: BOTH },
  { text: "Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado.", paths: BOTH },
  { text: "No antecipado, 3 peças saem por R$ 272,79, com 30% de desconto.", paths: BOTH },
  // Pagar só ao receber, garantia e troca.
  { text: "Você só paga quando receber.", paths: BOTH },
  { text: "Você não paga nada agora e tem 7 dias após o recebimento pra devolver.", paths: BOTH },
  { text: "Você tem 7 dias após o recebimento para trocar ou devolver.", paths: BOTH },
  { text: "Se não servir, você pode trocar em até 7 dias após o recebimento.", paths: BOTH },
  { text: "Se não gostar, pode devolver em até 7 dias após o recebimento e a gente devolve o seu dinheiro sem custo nenhum.", paths: BOTH },
  // Vetadas até 2026-09-28: o objeto "pelo tamanho certo" não governava a garantia (`delivery_promise`),
  // e o "tem" de "você tem 7 dias pra trocar de tamanho" era lido como estoque (`unverified_size`).
  { text: "Se não servir, você pode trocar pelo tamanho certo em até 7 dias após o recebimento.", paths: BOTH },
  { text: "Você tem 7 dias pra trocar de tamanho.", paths: BOTH },
  { text: "Tem 7 dias pra trocar o tamanho depois que chegar.", paths: BOTH },
  // Prazo de cada caminho.
  { text: "Na entrega você recebe em 1 a 3 dias, no dia que escolher no checkout.", paths: COD },
  { text: "Entrega em 1 a 3 dias, agendada — quem escolhe o dia é você, no checkout.", paths: COD },
  { text: "No antecipado o prazo varia por região, em média 5 dias úteis.", paths: BOTH },
];

describe.each(Object.entries(configs))("verdades que vendem passam a cadeia inteira (%s)", (_name, config) => {
  it.each(HONEST)("passa: $text", ({ text, paths }) => {
    for (const paymentPath of paths) {
      expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toEqual({ paymentPath, blocked: [] });
    }
  });
  // The kit's price in the canonical tail: the delivery kit's, with the kit's quantity in the turn.
  it.each([
    [2, "Pagando na entrega o frete é grátis: você paga só R$ 233,82 quando receber."],
    [3, "Ah, na entrega o frete é grátis — você paga R$ 311,76 quando receber."],
  ] as const)("passa com o kit de %i: %s", (units, text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath, units) }).toEqual({ paymentPath, blocked: [] });
  });
});

/**
 * Custa uma reescrita (R15.3 canônica, grafo §32). True lines, each of them, and each vetoed by
 * `shipping_promise` now: the free claim passes only in a canonical sentence, because three rounds
 * of proving from free text that a "grátis" stays at the door (§29–§31) each let the next lie
 * through. This is the price of that, written down instead of hidden: one rewrite each, where the
 * lie cost the freight at the door. `tests/prompt.test.ts` proves the sentence the prompt teaches
 * passes, so the rewrite lands.
 */
const COSTS_A_REWRITE = [
  // Passed from 2026-09-28 (§29) to 2026-09-29 (§31).
  "O frete é grátis e você só paga quando receber.",
  "No pagamento na entrega você não paga frete: são R$ 129,90 quando receber.",
  "Na entrega o frete sai de graça.",
  "Pagando ao entregador, o frete é por nossa conta.",
  "Pagando na entrega, levando 2 peças o frete é grátis e sai R$ 233,82.",
  "Não se preocupe com a entrega: pagando na entrega o frete é grátis.",
  "Pagando na entrega o frete é grátis, e você também tem 7 dias pra trocar.",
  "Pagando na entrega o frete é grátis; no pix você ganha 10% de desconto.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto.",
  "Entrega grátis pagando na hora que receber.",
  "O frete é grátis, você paga só os R$ 129,90 na entrega.",
  "Pagando na entrega, em dinheiro ou cartão, o frete é grátis.",
  "Na entrega não tem frete; você paga só R$ 129,90.",
  "No kit de 2 peças pagando na entrega o frete também é grátis.",
  "Levando 2 peças pagando na entrega o frete é grátis também.",
  "Pagando na entrega o frete é grátis, sempre.",
  "Pagando na entrega você não paga frete.",
  "O frete é grátis pra quem paga na entrega.",
  "Pagando na entrega o frete é grátis e chega em 1 a 3 dias.",
  "Na entrega você paga R$ 129,90 e nenhum frete a mais na porta.",
  "Nenhum frete na entrega.",
];
describe.each(Object.entries(configs))("custa uma reescrita (R15.3 canônica) (%s)", (_name, config) => {
  it.each(COSTS_A_REWRITE)("veta pelo frete, e a frase canônica passa no lugar: %s", (text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toMatchObject({ paymentPath, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
});

/**
 * The exchange window, both ways (2026-09-28). `delivery_promise` read "trocar pelo tamanho certo em
 * até 7 dias após o recebimento" as a 7-day delivery: the return verb's `OBJECT` knew no "pelo" and
 * no adjective, so the 7 was not governed, and the anchor's "recebimento" made it delivery talk.
 * `unverified_size` read the "tem" of "você tem 7 dias pra trocar de tamanho" as "tem o tamanho".
 * The honest forms pass the whole chain — `warranty_promise` included — and the lies next to them
 * keep the veto of the gate that owns them.
 */
const EXCHANGE_HONEST = [
  "Pode trocar em até 7 dias depois de receber.",
  "A troca é em até 7 dias após receber.",
  "Tem 7 dias pra trocar o tamanho depois que chegar.",
  "Você pode trocar pelo tamanho certo em até 7 dias depois de receber.",
  "Pra trocar pelo tamanho certo, você tem 7 dias após o recebimento.",
  "Você tem até 7 dias pra devolver o tamanho errado.",
  "Você tem uma semana pra trocar o tamanho, contando de quando recebeu.",
  // The 5 is the prepaid average, in a clause of its own (grafo §28), and stays passing (§31).
  "Você tem 7 dias de garantia, e a média do antecipado é de 5 dias, tá?",
  // The average's clause ends at "e" (and), and the return after it is the 7's (grafo §32; vetoed at dd530a7).
  "Pagando antecipado a média é de 5 dias e a troca é em 7 dias.",
  "No pix a média é 5 dias e você tem 7 dias de garantia.",
  "Em média 5 dias no pix e 7 dias pra trocar.",
];
const EXCHANGE_LIES: Array<[string, string]> = [
  ["Chega em até 7 dias.", "delivery_promise"],
  ["No antecipado você recebe em até 7 dias.", "delivery_promise"],
  ["Troca grátis e chega em 7 dias.", "delivery_promise"],
  ["Em até 7 dias após o pagamento você recebe.", "delivery_promise"],
  ["7 dias após o pix ele chega.", "delivery_promise"],
  ["Pode trocar pelo tamanho certo e chega em 7 dias.", "delivery_promise"],
  ["Pode trocar pelo tamanho certo em até 7 dias; a entrega também.", "delivery_promise"],
  ["Pode trocar pelo tamanho certo em até 3 dias após o recebimento.", "warranty_promise"],
  ["Tem 7 dias pra trocar e temos o seu tamanho.", "unverified_size"],
  ["Tem 7 dias pra trocar, e o seu tamanho tá aí.", "unverified_size"],
  ["Você tem 7 dias pra trocar o tamanho que está em estoque.", "unverified_size"],
  ["Tem pra troca no seu tamanho.", "unverified_size"],
  // "Em média" and a path before the number, the return after it (2026-09-29, grafo §31): the clause
  // the warranty gate read stopped at the number and never saw "trocar".
  ["Na entrega em média você tem 3 dias de garantia.", "warranty_promise"],
  ["Na entrega em média você tem 3 dias pra trocar.", "warranty_promise"],
  ["No pix em média você tem 5 dias pra trocar.", "warranty_promise"],
  ["Pagando no pix em média você tem 5 dias pra devolver.", "warranty_promise"],
  ["Na entrega em média são 3 dias pra trocar de tamanho.", "warranty_promise"],
  // "é" (is) is not "e" (and): the clause does not end there (grafo §32).
  ["Na entrega em média 3 dias é o prazo pra trocar.", "warranty_promise"],
  ["No pix em média 5 dias é o prazo pra devolver.", "warranty_promise"],
];
describe.each(Object.entries(configs))("a janela de troca, nos dois sentidos (%s)", (_name, config) => {
  it.each(EXCHANGE_HONEST)("passa: %s", (text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toEqual({ paymentPath, blocked: [] });
  });
  it.each(EXCHANGE_LIES)("veta: %s (%s)", (text, gate) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toMatchObject({ paymentPath, blocked: expect.arrayContaining([gate]) });
  });
});

/** The mirror of each value: said where it is not true. Blocked on both paths. */
const LIES: string[] = [
  // Frete grátis no antecipado, dito de todo jeito.
  "No pix o frete é grátis.",
  "Frete grátis no antecipado.",
  "Pagando no pix o frete é grátis.",
  "No cartão o frete é grátis.",
  "Frete grátis nos dois caminhos.",
  "O frete é grátis em qualquer forma de pagamento.",
  "Na entrega e no pix o frete é grátis.",
  "Frete grátis na entrega ou no antecipado.",
  "O frete é grátis na entrega e também no antecipado.",
  "O frete é grátis na entrega, e no outro pagamento também.",
  "Com ou sem pix, frete grátis na entrega.",
  "Até na entrega o frete é grátis.",
  "Não é só na entrega que o frete é grátis.",
  "Não tem frete grátis só na entrega.",
  "No pix o frete não é grátis só na entrega.",
  "Pagando na entrega o frete é grátis, independente da forma de pagamento.",
  "Nenhum frete a mais na entrega, é só pagar no checkout.",
  // A entrega nomeada só para ser negada.
  "Sem pagamento na entrega, frete grátis.",
  "Se não for na entrega, o frete é grátis.",
  "Fora da entrega o frete é grátis.",
  "Se não quiser pagar na entrega, o frete é grátis igual.",
  // Com alternativa, e por referência ou reticência, depois de uma frase da entrega que passa.
  "O frete é grátis pagando na entrega ou antes.",
  "Seja qual for o pagamento, na entrega o frete é grátis.",
  "O frete do pix é igual ao da entrega.",
  "No pix o frete é o mesmo da entrega.",
  "Pagando na entrega o frete é grátis. No pix também.",
  "Pagando na entrega o frete é grátis. E no antecipado? Também!",
  "Pagando na entrega o frete é grátis. No pix é igual.",
  // A negação que não nega (negation-blindness, sentido 2).
  "Sem frete no pix.",
  "Nem no pix tem frete.",
  "Nem na entrega tem frete.",
  "No pix não cobramos frete.",
  "No antecipado você não paga frete.",
  "No pix o frete não é cobrado.",
  "A entrega é grátis no pix.",
  "O frete no pix é zero.",
  // Grátis sem caminho: a produção passa "cod" quando ela não escolheu nada.
  "Frete grátis!",
  "O frete é grátis.",
  "Frete grátis e você recebe na porta.",
  "Frete grátis, o entregador leva até você.",
  // Valor de frete: nenhum caminho tem um citável.
  "Na entrega o frete é R$ 0,00.",
  "Pagando na entrega o frete sai R$ 15.",
  "O frete fica R$ 129,90.",
  // Desconto, kit, garantia e prazo fora do lugar.
  "No antecipado você tem 15% de desconto: sai R$ 116,91.",
  "Levando 2 peças na entrega sai R$ 207,84.",
  "Você economiza R$ 12,99 no antecipado.",
  "Você tem 30 dias para trocar.",
  "Na entrega chega amanhã.",
  "No antecipado chega em 2 dias.",
];

describe.each(Object.entries(configs))("a mentira espelhada continua vetada (%s)", (_name, config) => {
  it.each(LIES)("veta: %s", (text) => {
    for (const paymentPath of BOTH) {
      expect({ paymentPath, blocked: blockedBy(text, config, paymentPath).length > 0 }).toEqual({ paymentPath, blocked: true });
    }
  });
});

/**
 * Examples do not hold a heuristic with exceptions (negation-blindness, 2026-09-25): generate the
 * property. Every free-shipping claim × every way of naming the prepaid offer or both paths, in
 * both orders and with the delivery named too, is vetoed by `shipping_promise` on both paths; and
 * every canonical sentence passes, while the same sentence extended to anything else vetoes (grafo §32).
 */
const CLAIMS = [
  "o frete é grátis",
  "frete grátis",
  "não tem frete",
  "sem frete",
  "o frete sai de graça",
  "você não paga frete",
  "o frete é por nossa conta",
  "o frete não custa nada",
  "não cobramos frete",
  "a entrega é grátis",
  "o frete é zero",
  "o frete não é cobrado",
];
const PREPAID_CUES = [
  "no pix",
  "pagando no pix",
  "no antecipado",
  "pagando antecipado",
  "no cartão",
  "pelo cartão",
  "no boleto",
  "pagando antes",
  "nos dois caminhos",
  "em qualquer forma de pagamento",
  "também no antecipado",
  "no outro pagamento",
  "com ou sem pix",
  "pagando no link",
  "sem pagamento na entrega",
  "se não for na entrega",
];
const COD_ANCHORS = ["pagando na entrega", "na entrega", "no pagamento na entrega", "pagando ao entregador"];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The canonical free sentences (`canonicalFree` in `guardrails.ts`, grafo §32): lead × core × tail × end. */
const CANONICAL_LEADS = ["", "e ", "e olha, ", "ah, ", "lembrando que ", "aqui, "];
const CANONICAL_CORES = [
  "pagando na entrega o frete é grátis",
  "no pagamento na entrega o frete é grátis",
  "com pagamento na entrega, o frete é gratuito",
  "na entrega o frete é grátis",
  "o frete é grátis pagando na entrega",
  "frete grátis pagando na entrega",
  "frete grátis na entrega",
  "na entrega não tem frete",
  "o frete na entrega é grátis",
  "na entrega, nenhum frete a mais",
];
const CANONICAL_TAILS = [
  "",
  ": você paga só R$ 129,90 quando receber",
  ", você paga R$ 129,90 quando receber",
  " e você só paga quando receber",
  ": você paga só quando o colete chegar",
  " — você paga só R$ 129,90 e mais nada",
  ", sem nada a mais na porta",
  ": você paga o valor de R$ 129,90 quando receber",
];
const CANONICAL_BODIES = CANONICAL_LEADS.flatMap((lead) =>
  CANONICAL_CORES.flatMap((core) => CANONICAL_TAILS.map((tail) => cap(lead + core) + tail)),
);
const CANONICAL = CANONICAL_BODIES.flatMap((body) => [`${body}.`, `${body}! 💛`]);
/** Anything more in the canonical sentence reaches past the door, or might: every one vetoes. */
const SAME_SENTENCE = [
  ", e no pix também",
  " e no site",
  " e pela internet",
  " e na Coinzz",
  ", e comprando agora também",
  " nos dois pagamentos",
  ", sempre",
  " ou no pix",
  ", igual no cartão",
  " e quem compra agora não paga frete",
  ", e comprando no site o frete é grátis",
];
/** The short sentence right after that extends it, with no free word of its own. */
const FOLLOW_UPS = ["No pix também.", "E no site também!", "Igual no pix.", "Vale pros dois.", "No cartão, idem.", "Pagando antes, a mesma coisa."];

describe.each(Object.entries(configs))("gerador: frete grátis × caminho (%s)", (_name, config) => {
  const lies = CLAIMS.flatMap((claim) =>
    PREPAID_CUES.flatMap((cue) => [
      `${cap(cue)}, ${claim}.`,
      `${cap(claim)} ${cue}.`,
      `${cap(claim)} na entrega e ${cue}.`,
      `Pagando na entrega ou ${cue}, ${claim}.`,
    ]),
  );
  it(`${lies.length} promessas de frete grátis fora da entrega, todas vetadas`, () => {
    const passed = lies.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")));
    expect(passed).toEqual([]);
  });

  // Since 2026-09-29 (grafo §32) the free claim beside the delivery passes only in a canonical
  // sentence: the claim × anchor crossing that passed here is the price in `COSTS_A_REWRITE`.
  it(`${CANONICAL.length} frases canônicas do frete grátis na entrega, todas passam a cadeia inteira`, () => {
    expect(CANONICAL.filter((text) => BOTH.some((p) => blockedBy(text, config, p).length > 0))).toEqual([]);
  });
  const extended = CANONICAL_BODIES.filter((_, i) => i % 3 === 0).flatMap((body) => [
    ...SAME_SENTENCE.map((more) => `${body}${more}.`),
    ...FOLLOW_UPS.map((next) => `${body}. ${next}`),
  ]);
  it(`${extended.length} frases canônicas estendidas a outro pagamento, todas vetadas pelo frete`, () => {
    expect(extended.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
  const prepaidPrice = CANONICAL_CORES.flatMap((core) => ["R$ 116,91", "R$ 207,84", "R$ 272,79", "R$ 129,91", "R$ 1.129,90"].map((price) => `${cap(core)}: você paga só ${price} quando receber.`));
  it(`${prepaidPrice.length} frases canônicas com preço que não é da entrega, todas vetadas pelo frete`, () => {
    expect(prepaidPrice.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
});

/**
 * Conversation audit (2026-09-28), two true lines `BEYOND_COD` vetoed: its "not only" read the
 * "não" of one clause with the "só" of the next ("não tem frete: você paga só R$ 129,90" — the
 * price's "só"), and "também" next to the freight was always another path, even when what it adds
 * is the kit named in its clause. The mirror lies keep the veto.
 */
// The ";" and the kit's "também" forms moved to `COSTS_A_REWRITE` (grafo §32).
const KIT_AND_ONLY_HONEST = ["Na entrega não tem frete: você paga só R$ 129,90."];
const KIT_AND_ONLY_LIES = [
  "Não é só na entrega que o frete é grátis.",
  "O frete é grátis na entrega e no pix também.",
  "Frete grátis também no antecipado.",
  "Não tem frete só na entrega: você paga R$ 129,90.",
  "Na entrega não tem frete: e não só na entrega.",
  "Pagando na entrega o frete também é grátis.",
  "No pix sai R$ 116,91. Pagando na entrega o frete também é grátis.",
  "No kit de 2 peças o frete também é grátis no pix.",
  "No kit de 2 peças o frete também é grátis.",
  "Levando 2 peças o frete é grátis na entrega e também pelo site.",
  "Levando 2 peças na entrega o frete também é grátis nos dois pagamentos.",
  "No kit de 2 peças pagando na entrega ou antes o frete também é grátis.",
  "No kit de 2 peças pagando na entrega o frete é grátis, e no site o frete também.",
  // The kit more than 40 characters behind "também" is not the one the mutation reaches (grafo §31).
  "Kit de 2 na entrega é grátis, e no site o frete também.",
  "2 peças na entrega, e no site também é grátis o frete.",
];
describe.each(Object.entries(configs))("'só' do preço e 'também' do kit (%s)", (_name, config) => {
  it.each(KIT_AND_ONLY_HONEST)("passa: %s", (text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toEqual({ paymentPath, blocked: [] });
  });
  it.each(KIT_AND_ONLY_LIES)("veta pelo frete: %s", (text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toMatchObject({ paymentPath, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
});

/** The kit's "também" is an exception, so it gets its generator: kit × delivery × prepaid cue. */
const KITS = ["no kit de 2 peças", "levando 2 peças", "no kit de 3 peças", "levando 3 peças"];
const ALSO = ["o frete também é grátis", "o frete é grátis também", "também é grátis o frete"];
describe.each(Object.entries(configs))("gerador: 'também' do kit × caminho (%s)", (_name, config) => {
  // Custa uma reescrita (R15.3 canônica, grafo §32): true, and not a canonical sentence.
  const honest = KITS.flatMap((kit) => COD_ANCHORS.flatMap((anchor) => ALSO.map((also) => `${cap(kit)} ${anchor} ${also}.`)));
  it(`${honest.length} kits na entrega com 'também' custam uma reescrita`, () => {
    expect(honest.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
  const lies = KITS.flatMap((kit) =>
    ALSO.flatMap((also) => [
      `${cap(kit)} ${also}.`,
      ...PREPAID_CUES.flatMap((cue) => [`${cap(kit)} ${cue} ${also}.`, `${cap(kit)} pagando na entrega ${also} ${cue}.`, `${cap(kit)} pagando na entrega ou ${cue} ${also}.`]),
    ]),
  );
  it(`${lies.length} kits com 'também' fora da entrega ou sem ela, todos vetados`, () => {
    expect(lies.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
});

/**
 * Fourth review (2026-09-29, grafo §31): the free claim reached past the delivery in shapes
 * `BEYOND_COD` did not list — the other payment before "ou na entrega", "tanto … quanto", "também"
 * closing the clause after another payment, "igual", "todos os pagamentos" — and in payment verbs it
 * never read ("pagando por cartão", "pela internet", "na hora do pedido"). The generator crosses the
 * shapes with payments the gate names nowhere; since 2026-09-29 (grafo §32) the whole sentence is held
 * to the canonical set, so none of them can match it.
 */
const REVIEW4_LIES = [
  "Antes ou na entrega, o frete é grátis.",
  "Tanto antes quanto na entrega, o frete é grátis.",
  "Seja agora ou na entrega, o frete é grátis.",
  "Pagando por cartão de crédito ou na entrega, o frete é grátis.",
  "Com pagamento por cartão ou na entrega, o frete é grátis.",
  "Pagando na entrega o frete é grátis, e pagando pela internet também.",
  "Pagando na entrega o frete é grátis, e pagando pelo celular também.",
  "Pagando na entrega o frete é grátis, e pagando pela Coinzz também.",
  "Pagando na entrega o frete é grátis, e pagando na hora do pedido também.",
  "Pagando na entrega o frete é grátis, e pagando por cartão de crédito também.",
  "Pagando na entrega o frete é grátis, igual pagando por cartão.",
  "Pagando na entrega o frete é grátis, e vale pra todos os pagamentos.",
  "Pagando na entrega o frete é grátis, e na compra pelo site é igual.",
  "Frete grátis pagando na entrega. Por cartão também.",
  "Frete grátis pagando na entrega. E por cartão? Também!",
  "Frete grátis pagando na entrega. Pagando por cartão, também.",
  "Pagando na entrega o frete é grátis, e antes também.",
  "Pagando na entrega o frete é grátis em todas as formas.",
  // A payment verb that is not the door's, with no "ou", "também" or "igual" to give it away.
  "Frete grátis na entrega pagando pela internet.",
  "Pagando pelo aplicativo, na entrega o frete é grátis.",
  // The prepaid discount's own clause is read apart only while it says nothing of the freight.
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto também.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto e o frete também.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto e não paga o envio.",
  "Pagando na entrega o frete é grátis; no pix também.",
];
const OTHER_PAYMENTS = [
  "antes",
  "agora",
  "pagando antes",
  "por cartão",
  "pagando por cartão de crédito",
  "com pagamento por cartão",
  "pela internet",
  "pagando pela internet",
  "pagando pelo celular",
  "pagando pelo aplicativo",
  "pagando pela Coinzz",
  "pagando na hora do pedido",
  "pelo site",
  "no pix",
];
/** Payment verbs the gate names nowhere: only an allow-list catches them. */
const OTHER_PAY_VERBS = ["pagando por cartão", "pagando pela internet", "pagando pelo celular", "pagando pelo aplicativo", "pagando na hora do pedido", "pagando pela Coinzz", "com pagamento por cartão", "pagando de outro jeito"];
describe.each(Object.entries(configs))("gerador: outro pagamento × forma de alcançar (%s)", (_name, config) => {
  it.each(REVIEW4_LIES)("veta pelo frete: %s", (text) => {
    for (const paymentPath of BOTH) expect({ paymentPath, blocked: blockedBy(text, config, paymentPath) }).toMatchObject({ paymentPath, blocked: expect.arrayContaining(["shipping_promise"]) });
  });
  const lies = CLAIMS.flatMap((claim) =>
    COD_ANCHORS.flatMap((anchor) => [
      `${cap(anchor)} ${claim}, e vale pra todos os pagamentos.`,
      ...OTHER_PAYMENTS.flatMap((other) => [
        `${cap(other)} ou ${anchor}, ${claim}.`,
        `Tanto ${other} quanto ${anchor}, ${claim}.`,
        `Seja ${other} ou ${anchor}, ${claim}.`,
        `${cap(anchor)} ${claim}, e ${other} também.`,
        `${cap(anchor)} ${claim}, igual ${other}.`,
        `${cap(claim)} ${anchor}. ${cap(other)} também.`,
        `${cap(claim)} ${anchor}. E ${other}? Também!`,
      ]),
      ...OTHER_PAY_VERBS.flatMap((verb) => [`${cap(claim)} ${anchor} ${verb}.`, `${cap(verb)}, ${anchor} ${claim}.`]),
    ]),
  );
  it(`${lies.length} promessas que alcançam outro pagamento, todas vetadas`, () => {
    expect(lies.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
  const DISCOUNT = ["; no pix você ganha 10% de desconto", ", e no pix você ganha 10% de desconto", ", mas no antecipado tem 10% de desconto"];
  // In the same sentence the discount's clause costs a rewrite (grafo §32); in a sentence of its own
  // after the canonical one, it passes.
  const discountSameSentence = CLAIMS.flatMap((claim) => COD_ANCHORS.flatMap((anchor) => DISCOUNT.map((d) => `${cap(anchor)} ${claim}${d}.`)));
  it(`${discountSameSentence.length} frases da entrega com o desconto do antecipado na mesma frase custam uma reescrita`, () => {
    expect(discountSameSentence.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
  const discountHonest = CANONICAL_BODIES.flatMap((body) => ["No pix você ganha 10% de desconto.", "No antecipado você tem 10% de desconto: sai R$ 116,91."].map((d) => `${body}. ${d}`));
  it(`${discountHonest.length} frases canônicas com o desconto do antecipado na frase seguinte, nenhuma vetada`, () => {
    expect(discountHonest.filter((text) => BOTH.some((p) => blockedBy(text, config, p).length > 0))).toEqual([]);
  });
  const DISCOUNT_TAILS = [" também", " e o frete também", " e o frete é grátis", " e não paga o envio", " e frete grátis", " e a entrega sai de graça", ", também"];
  const discountLies = CLAIMS.flatMap((claim) =>
    COD_ANCHORS.flatMap((anchor) => DISCOUNT.flatMap((d) => DISCOUNT_TAILS.map((tail) => `${cap(anchor)} ${claim}${d}${tail}.`))),
  );
  it(`${discountLies.length} frases em que a oração do desconto leva o frete junto, todas vetadas`, () => {
    expect(discountLies.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
});

/**
 * Fifth and sixth reviews (2026-09-29, grafo §32): every free-shipping lie both reviews wrote against
 * the §31 gate, many of which passed it ("Frete grátis na entrega e pagando R$ 129,90 pela internet." —
 * the price's decimal comma read as a clause end —, "…e no site.", "…e na Coinzz.", "…e fechando
 * agora."), plus the "nenhum frete a mais" forms the same free-text proof let through. All vetoed by
 * `shipping_promise` on both paths, with the key and without it.
 */
const REVIEW5_LIES = [
  "Frete grátis sempre, qualquer que seja o jeito.",
  "Comprando pelo link também sai sem frete.",
  "Pagando na entrega o frete é grátis, e comprando pelo link também.",
  "Na entrega o frete é grátis e comprando pelo site sai igual.",
  "Na entrega o frete é grátis, e no antecipado o desconto é de 10% e o frete é grátis.",
  "Na entrega o frete é grátis; no pix, 10% de desconto e frete grátis.",
  "Na entrega o frete é grátis; no pix você ganha 10% de desconto e sem frete.",
  "Na entrega o frete é grátis e comprando agora também.",
  "Na entrega ou comprando pelo site o frete é grátis.",
  "Frete grátis na entrega e no site.",
  "Frete grátis na entrega e na compra online.",
  "O frete é grátis na entrega e no cartão de crédito.",
  "Frete grátis na entrega e comprando pelo site.",
  "Na entrega o frete é grátis, e à vista também.",
  "Frete grátis: na entrega e antecipado.",
  "O frete é grátis na entrega e com cartão.",
  "Na entrega o frete é grátis e no crédito também é.",
  "Frete grátis na entrega, e no pix você ganha desconto de 10% mais frete zero.",
  "Frete grátis na entrega; no site você ganha 10% de desconto além disso.",
  "Frete grátis pra todo o Brasil pagando na entrega ou não.",
  "Pagando na entrega o frete é grátis, e comprando antes sai grátis.",
  "Frete grátis em toda compra, pagando na entrega.",
  "Frete grátis em qualquer compra na entrega.",
  "O frete é grátis na entrega e na loja.",
  "Na entrega o frete é grátis, e comprando no site o frete é grátis.",
  "Na entrega o frete é grátis e sempre foi grátis em todas as compras.",
  "Aqui o frete é sempre grátis, na entrega por exemplo.",
  "Frete grátis! Na entrega.",
  "Frete grátis na entrega e pela internet.",
  "Frete grátis na entrega e na hora do pedido.",
  "Frete grátis na entrega e comprando pelo celular.",
  "Frete grátis na entrega e pelo Mercado Pago.",
  "Frete grátis na entrega e via Coinzz.",
  "Frete grátis na entrega e fechando agora.",
  "Frete grátis na entrega e comprando já.",
  "Frete grátis na entrega e no carrinho.",
  "Frete grátis na entrega e na compra antes.",
  "Na entrega o frete é grátis, e comprando antes também sai grátis.",
  "Na entrega o frete é grátis, e antes também.",
  "Frete grátis na entrega, e comprando antes, frete grátis.",
  "Frete grátis na entrega e em compra antecipada.",
  "Frete grátis na entrega e na maquininha.",
  "Frete grátis na entrega, e se comprar hoje, frete grátis.",
  "Na entrega o frete é grátis, e quem compra agora não paga frete.",
  "Na entrega o frete é grátis e quem paga antes não paga frete.",
  "Na entrega o frete é grátis, e quem paga antes ganha 10% e não paga frete.",
  "Frete grátis na entrega e no depósito.",
  "Frete grátis na entrega e na Coinzz.",
  "Frete grátis: na entrega e no site.",
  "Frete grátis sempre! Na entrega ou no site.",
  "Frete grátis em tudo, até na entrega.",
  "Frete grátis em todo o site, pagando na entrega.",
  "Na entrega o frete é grátis e no pix sai grátis.",
  "Pagando na entrega ou no pix, frete grátis.",
  "Frete grátis na entrega, e no pix? Também.",
  "Na entrega o frete é grátis; no pix com desconto sai R$ 116,91 sem nenhuma taxa.",
  "Na entrega o frete é grátis; no pix você ganha 10% de desconto sem custo adicional.",
  "Na entrega o frete é grátis; no pix você ganha 10% de desconto com tudo incluso.",
  "Na entrega o frete é grátis; no pix o desconto é de 10% e chega sem custo pra você.",
  "Na entrega o frete é grátis; no pix tem 10% de desconto e o transporte por nossa conta.",
  "Na entrega o frete é grátis, e no pix com desconto você não paga mais nada além de R$ 116,91.",
  "Na entrega o frete é grátis; no pix 10% de desconto, sem taxa de envio.",
  "Frete grátis na entrega; pagando antecipado 10% de desconto e sem taxa de entrega.",
  "Na entrega o frete é grátis; no pix você tem desconto de 10% e a mesma vantagem.",
  "Na entrega o frete é grátis; no pix você ganha 10% de desconto e o frete fica por conta da loja.",
  "Na entrega o frete é grátis, mas no pix tem desconto de 10% e não cobra frete.",
  "Na entrega o frete é grátis; e no pix tem 10% de desconto em cima disso.",
  "Na entrega o frete é grátis; no pix o desconto de 10% já cobre o frete.",
  "Na entrega o frete é grátis; no pix o desconto de 10% compensa o frete.",
  "Pagando na entrega o frete é grátis; no pix você ganha 10% de desconto e paga R$ 116,91.",
  "Na entrega o frete é grátis; no pix, 10% de desconto; no cartão, parcelado.",
  "Frete grátis na entrega e pagando na hora do pedido.",
  "Frete grátis na entrega e pagando R$ 129,90 na hora do pedido.",
  "Frete grátis na entrega e pagando pela internet.",
  "Frete grátis na entrega e pagando R$ 129,90 pela internet.",
  "Na entrega o frete é grátis, e quem paga R$ 129,90 por cartão de crédito online sai sem frete.",
  "Frete grátis na entrega e pagando por cartão.",
  "Frete grátis na entrega e pagando R$ 129,90 por cartão.",
  "Frete grátis pagando R$ 129,90 na entrega ou pagando R$ 129,90 no ato da compra.",
  "Pagando por cartão de crédito ou na entrega, o frete é grátis.",
  "Pagando na entrega o frete é grátis, e pagando por cartão de crédito também.",
  "Frete grátis pagando na entrega. Pagando por cartão, também.",
  "Pagando na entrega o frete é grátis, e pagando pela internet também.",
  "Pagando na entrega o frete é grátis, igual pagando por cartão.",
  "Pagando na entrega o frete é grátis, e antes também.",
  "Com pagamento por cartão ou na entrega, o frete é grátis.",
  "Pagando na entrega ou por cartão, frete grátis.",
  "Frete grátis pagando na entrega ou parcelado em 3x.",
  "Pagando na entrega o frete é grátis e ainda tem 10% de desconto.",
  "Frete grátis pagando na entrega. E por cartão?  Também!",
  "Frete grátis pagando na entrega. Por cartão também.",
  "Pagando na entrega o frete é grátis. Parcelando também.",
  "Pagando na entrega o frete é grátis. Pagando antes, idem.",
  "Pagando na entrega o frete é grátis, e pagando antes é a mesma coisa.",
  "Frete grátis pagando na entrega, em qualquer região, e no cartão sai igual.",
  "O frete é grátis pagando na entrega, e com o desconto de 10% também.",
  "Pagando na entrega o frete é grátis, e pagando antes também.",
  "Pagando na entrega o frete é grátis, e pelo site também.",
  "Pagando na entrega o frete é grátis, e no pagamento online também.",
  "Pagando na entrega o frete é grátis, e à vista também.",
  "Pagando na entrega o frete é grátis, e pagando pelo celular também.",
  "Pagando na entrega o frete é grátis, e pagando pela Coinzz também.",
  "Pagando na entrega o frete é grátis, e no outro pagamento também.",
  "Pagando na entrega o frete é grátis e parcelado também.",
  "Pagando na entrega o frete é grátis, e se pagar agora também.",
  "Pagando na entrega o frete é grátis, e pagando na hora do pedido também.",
  "Pagando na entrega ou na hora do pedido, o frete é grátis.",
  "Pagando na entrega ou agora, o frete é grátis.",
  "Pagando agora ou na entrega, o frete é grátis.",
  "Seja agora ou na entrega, o frete é grátis.",
  "Tanto antes quanto na entrega, o frete é grátis.",
  "Antes ou na entrega, o frete é grátis.",
  "Pagando na entrega o frete é grátis, e pagando antes do envio também.",
  "Pagando na entrega o frete é grátis. Pagando antes também.",
  "Pagando na entrega o frete é grátis. Pelo site também.",
  "Pagando na entrega o frete é grátis. Pagando na hora também.",
  "No pix o frete não é cobrado.",
  "No pix você não paga o frete.",
  "No pix a entrega sai de graça.",
  "Pelo link você não paga frete nenhum.",
  "No pix o frete é zero.",
  "O frete no antecipado é por nossa conta.",
  "Não tem frete grátis só na entrega: no pix também é grátis.",
  "Pagando na entrega o frete é grátis. E no pix? Também.",
  "Pagando na entrega o frete é grátis, e no pix o frete também sai grátis.",
  "Pagando na entrega o frete é grátis, e quem paga no pix também não paga frete.",
  "Frete grátis pagando na entrega, e pagando no pix você também não paga frete.",
  "O frete é grátis pagando na entrega e também pagando antes.",
  "Pagando na entrega, e também no cartão, o frete é grátis.",
  "Pagando na entrega o frete é grátis, e isso vale pra qualquer pagamento.",
  "Pagando na entrega o frete é grátis, e vale pra todos os pagamentos.",
  "Pagando na entrega ou não, frete grátis.",
  "Frete grátis em todo pagamento, até na entrega.",
  "Pagando na entrega o frete é grátis, e na compra pelo site é igual.",
  "Kit de 2 na entrega é grátis, e no site o frete também.",
  "No kit de 2 peças pagando na entrega o frete é grátis, e no site o frete também.",
  "Kit de 2 pagando na entrega, e no site o frete também é grátis.",
  "2 peças na entrega, e no site também é grátis o frete.",
  "Pagando na entrega o frete é grátis, e no pix também.",
  "Pagando na entrega o frete é grátis; no pix também.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto também.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto e o frete também.",
  "Na entrega o frete é grátis, e no pix você ganha 10% de desconto e não paga o envio.",
  "Na entrega o frete é grátis; no pix, com 10% de desconto, também.",
  "Tanto antes quanto no pagamento na entrega, o frete é grátis.",
  "Pagando pelo aplicativo ou na entrega, frete grátis.",
  "Pagando na entrega o frete é grátis, e pagando pelo whatsapp também.",
  "Pagando na entrega o frete é grátis, e pagando de outro jeito também.",
  "Pagando na entrega o frete é grátis em todas as formas.",
  "Na entrega e no site, nenhum frete a mais.",
  "Nenhum frete a mais na entrega nem pela internet.",
  "Nenhum frete a mais na entrega e comprando pelo site.",
  "Na entrega nenhum frete a mais, e no site também.",
  "Nenhum frete extra na entrega ou na Coinzz.",
];
describe.each(Object.entries(configs))("as mentiras da quinta e da sexta revisão (%s)", (_name, config) => {
  it(`${REVIEW5_LIES.length} promessas de frete grátis, todas vetadas pelo frete`, () => {
    expect(REVIEW5_LIES.filter((text) => BOTH.some((p) => !blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
  });
});

/** `codFreeShipping: false` is the 2026-09-22 world again: free on neither path. */
describe("com codFreeShipping: false, o grátis da entrega volta a ser vetado", () => {
  const off: GateConfig = { ...example, delivery: { ...example.delivery, codFreeShipping: false } };
  it.each(["Pagando na entrega o frete é grátis.", "O frete é grátis e você só paga quando receber.", "Na entrega não tem frete, você paga R$ 129,90 e mais nada."])(
    "veta: %s",
    (text) => {
      for (const p of BOTH) expect(blockedBy(text, off, p)).toContain("shipping_promise");
    },
  );
  it.each(["No pix não tem frete grátis, ele é calculado no checkout.", "Na entrega nenhum frete a mais: você paga R$ 129,90 na porta."])(
    "a verdade de 22/09 continua passando: %s",
    (text) => {
      for (const p of BOTH) expect(blockedBy(text, off, p)).not.toContain("shipping_promise");
    },
  );
});
