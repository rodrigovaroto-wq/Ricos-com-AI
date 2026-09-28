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

const blockedBy = (text: string, config: GateConfig, paymentPath: Path) =>
  runGates(text, ctx({ config, paymentPath })).traces
    .filter((t) => t.verdict === "block")
    .map((t) => t.gate);

it("o exemplo carrega a decisão de 2026-09-28: grátis só na entrega", () => {
  expect(example.delivery.freeShipping).toBe(false);
  expect(example.delivery.codFreeShipping).toBe(true);
  expect(example.prices.prepayDiscountPercent).toBe(10);
});

const HONEST: Array<{ text: string; paths: readonly Path[] }> = [
  // Frete grátis na entrega — o que o prompt ensina, e as formas que ela escreve.
  { text: "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis.", paths: BOTH },
  { text: "O frete é grátis e você só paga quando receber.", paths: BOTH },
  { text: "Na entrega não tem frete, você paga R$ 129,90 e mais nada.", paths: BOTH },
  { text: "Frete grátis pagando na entrega!", paths: BOTH },
  { text: "No pagamento na entrega você não paga frete: são R$ 129,90 quando receber.", paths: BOTH },
  { text: "Na entrega o frete sai de graça.", paths: BOTH },
  { text: "Pagando ao entregador, o frete é por nossa conta.", paths: BOTH },
  { text: "Na entrega nenhum frete a mais: você paga R$ 129,90 na porta.", paths: BOTH },
  { text: "Pagando na entrega, levando 2 peças o frete é grátis e sai R$ 233,82.", paths: BOTH },
  // O frete do antecipado, dito com honestidade — inclusive negando o grátis.
  { text: "No antecipado o frete é calculado por região, e o valor aparece pra você no checkout, antes de pagar.", paths: BOTH },
  { text: "No pix não tem frete grátis, ele é calculado no checkout.", paths: BOTH },
  { text: "No antecipado o frete não é grátis: o valor aparece no checkout, antes de pagar.", paths: BOTH },
  { text: "Não se preocupe com a entrega: pagando na entrega o frete é grátis.", paths: BOTH },
  { text: "No pix o frete é calculado por região. Pagando na entrega o frete é grátis.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis. No antecipado a garantia também é de 7 dias.", paths: BOTH },
  { text: "Pagando na entrega o frete é grátis, e você também tem 7 dias pra trocar.", paths: BOTH },
  { text: "No pix o frete não é igual ao da entrega: ele é calculado no checkout.", paths: BOTH },
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
});

/**
 * Over-restriction found while writing this file, and left for its own change (one change at a
 * time): `delivery_promise` reads "trocar pelo tamanho certo em até 7 dias" as a 7-day delivery
 * — the count's governing verb has an object it does not know. Vetoed on HEAD `ca691f6` too. The
 * honest sentences above say the same without the object. `it.fails` so the day it is fixed,
 * this goes red and moves up into `HONEST`.
 */
it.fails("conhecido: 'trocar pelo tamanho certo em até 7 dias' é vetada pelo delivery_promise", () => {
  expect(blockedBy("Se não servir, você pode trocar pelo tamanho certo em até 7 dias após o recebimento.", example, "cod")).toEqual([]);
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
 * every claim beside the delivery named alone passes it.
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

  const honest = CLAIMS.flatMap((claim) => COD_ANCHORS.flatMap((anchor) => [`${cap(anchor)}, ${claim}.`, `${cap(claim)} ${anchor}.`]));
  it(`${honest.length} frases de frete grátis na entrega, nenhuma vetada pelo frete`, () => {
    const vetoed = honest.filter((text) => BOTH.some((p) => blockedBy(text, config, p).includes("shipping_promise")));
    expect(vetoed).toEqual([]);
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
