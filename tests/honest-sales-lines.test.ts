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

/**
 * Conversation audit (2026-09-28), two true lines `BEYOND_COD` vetoed: its "not only" read the
 * "não" of one clause with the "só" of the next ("não tem frete: você paga só R$ 129,90" — the
 * price's "só"), and "também" next to the freight was always another path, even when what it adds
 * is the kit named in its clause. The mirror lies keep the veto.
 */
const KIT_AND_ONLY_HONEST = [
  "Na entrega não tem frete: você paga só R$ 129,90.",
  "Na entrega não tem frete; você paga só R$ 129,90.",
  "No kit de 2 peças pagando na entrega o frete também é grátis.",
  "Levando 2 peças pagando na entrega o frete é grátis também.",
];
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
  const honest = KITS.flatMap((kit) => COD_ANCHORS.flatMap((anchor) => ALSO.map((also) => `${cap(kit)} ${anchor} ${also}.`)));
  it(`${honest.length} kits na entrega com 'também', nenhum vetado pelo frete`, () => {
    expect(honest.filter((text) => BOTH.some((p) => blockedBy(text, config, p).includes("shipping_promise")))).toEqual([]);
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
