import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * Propriedade, não exemplo (M-07, quarta revisão). Cada exceção da regra de número do
 * antecipado — recusa, troca, garantia, "você tem 7 dias", "após o recebimento" — é um
 * afrouxamento, e cada rodada de revisão achou a mentira que se escondia atrás da última.
 * Frase de exemplo só prova a frase. Aqui toda combinação de isca × nome do antecipado ×
 * verbo de entrega × número diferente da média (5 no fixture) tem de ser vetada.
 */
const delivery = (text: string, paymentPath: "cod" | "prepay") =>
  runGates(text, ctx({ paymentPath, regionKnown: false })).traces.find((t) => t.gate === "delivery_promise")?.verdict;

const NAMES = [
  "No antecipado", "No pix", "Pagando antes", "No cartão", "Pagando agora", "No boleto",
  // Quinta revisão.
  "À vista", "Pagamento online", "Pelo link", "Se pagar hoje",
];
const PROMISES = ["chega em {n} dias", "você recebe em {n} dias", "a entrega sai em {n} dias", "chega em até {n} dias"];
// Iscas: tudo que já liberou uma mentira nesta regra, ou pode.
const BAITS = [
  "{name} {promise}.",
  "{name} com garantia {promise}.",
  "{name} com dinheiro de volta {promise}.",
  "{name} a troca é fácil e {promise}.",
  "{name} {promise} com garantia.",
  "{name} {promise} ou seu dinheiro de volta.",
  "{name} {promise} pra troca.",
  "{name} {promise} depois de receber o pagamento.",
  "{name} {promise} após o recebimento do pagamento.",
  "{name} não demora, {promise}.",
  "{name} não tem como passar de {n} dias.",
  "{name} nunca dá pra demorar mais de {n} dias.",
  "Não posso negar que {name} {promise}.",
  "Não garanto que chegue antes, mas {name} {promise}.",
  "{name} você tem {n} dias pra receber.",
  "{name} há {n} dias de prazo.",
  // Quinta revisão: a palavra de troca como adjunto da entrega, e o número sem preposição.
  "{name} chega com garantia em {n} dias.",
  "{name} com garantia chega em apenas {n} dias.",
  "{name} com garantia leva {n} dias.",
  "{name} você recebe com troca grátis em {n} dias.",
  "A troca é grátis e {name} chega em só {n} dias.",
  "{name} leva {n} dias, com garantia.",
  "{name} leva {n} dias e tem troca grátis.",
  "{name} chega em no máximo {n} dias, e a troca é grátis.",
];

// Sexta revisão: iscas com forma de garantia. Só o número da garantia (7 no fixture) pode
// ser garantia; com qualquer outro número elas são prazo inventado.
const WARRANTY_BAITS = [
  "{name} são {n} dias após o recebimento do pedido.",
  "{name} chega, {n} dias após o recebimento do pix.",
  "{name} a entrega tem garantia de {n} dias.",
  "{name}, entrega com garantia de até {n} dias.",
  "{name} chega com troca em {n} dias.",
  "{name}: {n} dias, com garantia.",
  "Garantia total, e {name}: {n} dias.",
  "{name} com {n} dias de garantia chega.",
  "{name} a devolução em {n} dias e chega junto.",
  "{name} a garantia é de {n} dias.",
  "{name} você tem {n} dias pra trocar.",
];

const cap = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
const lies: string[] = [];
for (const name of NAMES) {
  for (const n of [1, 2, 3, 7, 10])
    for (const promise of PROMISES)
      for (const bait of BAITS)
        lies.push(cap(bait.replaceAll("{promise}", promise).replaceAll("{name}", name).replaceAll("{n}", String(n))));
  // 7 é a garantia configurada: com 7 essas frases podem ser honestas; com outro número, não.
  for (const n of [1, 2, 3, 10]) for (const bait of WARRANTY_BAITS) lies.push(cap(bait.replaceAll("{name}", name).replaceAll("{n}", String(n))));
  // E com 7, as que dizem entrega continuam prazo.
  for (const bait of ["{name} a entrega tem garantia de 7 dias.", "{name}, entrega com garantia de até 7 dias.", "{name} chega com troca em 7 dias.", "{name}: 7 dias, com garantia.", "Garantia total, e {name}: 7 dias.", "{name} leva 7 dias, com garantia.", "{name} chega em 7 dias pra trocar.",
    // Sétima revisão: a entrega depois do 7.
    "{name} a garantia é de 7 dias pra entrega.", "{name} a troca também é em 7 dias, e a entrega também.",
    "{name}, a garantia é a mesma: 7 dias pra chegar na sua casa.", "{name} a troca é em 7 dias e chega junto.",
    // Oitava revisão: a âncora que era o próprio verbo do prazo, e "em 7 dias" num trecho só dele.
    "{name} a garantia é boa, quando o colete chegar em 7 dias.", "{name} tem troca, e quando você receber, em 7 dias.",
    "{name} a troca é fácil, depois de chegar em 7 dias você usa.", "Com garantia, {name} o colete tá na sua casa em 7 dias.",
    "Com troca grátis, {name} você veste em 7 dias.", "Garantia total: {name}, em 7 dias está aí."])
    lies.push(cap(bait.replaceAll("{name}", name)));
}

// M-08: a contagem em palavras e em semanas passa pelas mesmas iscas.
for (const name of NAMES)
  for (const count of ["um dia", "uma semana", "numa semana", "1 semana", "duas semanas"])
    for (const promise of PROMISES)
      for (const bait of BAITS)
        lies.push(cap(bait.replaceAll("{promise}", promise).replaceAll("{name}", name).replaceAll("{n} dias", count).replace(/\bem numa/g, "numa")));

// M-08: no antecipado, a chegada sem verbo de entrega e sem nome do caminho.
const arrivals: string[] = [];
for (const count of ["2 dias", "3 dias", "um dia", "uma semana", "dois dias"])
  for (const arrival of ["ele está aí na sua casa", "o colete é seu", "tá na sua mão", "ele está com você", "você já abre a caixa"])
    arrivals.push(`Em ${count} ${arrival}.`, `${cap(arrival)} em ${count}.`, `Não se preocupa, em ${count} ${arrival}.`);
// Revisão da M-08: a isca de uso só isenta quando governa a contagem — nunca ao lado de uma chegada.
for (const count of ["2 dias", "3 dias", "um dia", "uma semana", "dois dias"])
  for (const arrival of ["ele está aí", "ele está aí na sua casa", "o colete é seu", "tá na sua mão", "ele está com você"])
    arrivals.push(
      `Em ${count} ${arrival} pra você se adaptar.`,
      `Em ${count} ${arrival} pra você se acostumar com ele.`,
      `Em ${count} ${arrival} pra você adaptar a rotina.`,
      `Em ${count} de uso ${arrival}.`,
      `Em ${count} você se acostuma e ${arrival}.`,
      `Em ${count} você se acostuma, ${arrival}.`,
      `Em ${count} de uso, ${arrival}.`,
      `Pra você se acostumar, em ${count} ${arrival}.`,
    );

// Revisão da M-08: faixa em semanas, com qualquer nome — inclusive o da entrega.
const weekRanges: string[] = [];
for (const name of [...NAMES, "Na entrega", ""])
  for (const [a, b] of [[1, 2], [2, 3], [1, 3]])
    for (const promise of ["chega em {a} a {b} semanas", "leva de {a} a {b} semanas", "chega em {a} e {b} semanas", "você recebe em {a} a {b} semanas"])
      weekRanges.push(cap(`${name} ${promise.replace("{a}", String(a)).replace("{b}", String(b))}.`.trim()));

// Revisão da M-08: a âncora da garantia não pode ser o próprio verbo do prazo (backtracking).
const anchoredDeadlines: string[] = [];
for (const name of NAMES)
  for (const warranty of ["você tem 7 dias pra trocar", "tem uma semana pra trocar", "você tem 7 dias pra devolver"])
    for (const anchor of ["depois que chega", "quando receber", "quando chegar", "depois que receber", "após receber", "a partir de quando chegar", "a contar do dia que receber"])
      for (const count of ["em 7 dias", "em uma semana", "em até 7 dias", "em 2 dias"])
        anchoredDeadlines.push(`${name} ${warranty} ${anchor} ${count}.`);

describe("M-08, revisão: faixa em semanas e âncora da garantia", () => {
  it(`${weekRanges.length} faixas em semanas, todas vetadas nos dois caminhos`, () => {
    expect(weekRanges.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${anchoredDeadlines.length} prazos atrás de âncora de garantia, todos vetados nos dois caminhos`, () => {
    expect(anchoredDeadlines.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

describe("M-08: a chegada sem verbo de entrega também é prazo no antecipado", () => {
  it(`${arrivals.length} chegadas geradas, todas vetadas no antecipado`, () => {
    expect(arrivals.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

describe("M-07: nenhuma isca libera prazo do antecipado", () => {
  it(`${new Set(lies).size} mentiras geradas, todas vetadas nos dois caminhos`, () => {
    const passed = [...new Set(lies)].filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block");
    expect(passed.slice(0, 40)).toEqual([]);
  });

  it("e as frases honestas que as exceções existem para liberar continuam passando", () => {
    const honest = [
      "Não consigo garantir 2 dias no antecipado: varia por região, em média 5 dias úteis.",
      "No antecipado não dá pra prometer 2 dias, o prazo varia por região, em média 5 dias úteis.",
      "No antecipado você também tem 7 dias corridos para devolver.",
      "No pix, a garantia é a mesma: 7 dias.",
      "No antecipado você tem 7 dias de prazo pra troca.",
      "Você recebe o reembolso em até 30 dias.",
      "Você tem 7 dias após o recebimento para trocar.",
      // Quinta revisão.
      "No antecipado, quando o colete chegar você tem até 7 dias pra trocar.",
      "No pix, você recebe o colete e tem até 7 dias pra devolver.",
      "Pra devolver, você recebe em até 30 dias o seu dinheiro de volta.",
      "No antecipado você pode devolver em 7 dias se não servir.",
      // Sexta revisão: garantia honesta em outras formas — inclusive a frase que o próprio
      // warranty_promise ensina no briefing.
      "A garantia é de 7 dias após o recebimento para trocar ou devolver.",
      "No antecipado a garantia é de 7 dias após o recebimento para trocar ou devolver.",
      "No antecipado o prazo de troca é de 7 dias.",
      "No antecipado a garantia é de 7 dias.",
      "Pagando no pix, a garantia também é de 7 dias.",
      "No antecipado o prazo pra devolução é de 7 dias.",
      "No pix a troca pode ser feita em até 7 dias.",
      "No antecipado você tem até 7 dias depois de receber pra trocar.",
      "No antecipado você tem 7 dias corridos, a partir do recebimento, para trocar.",
      "Você tem 7 dias a partir do recebimento para trocar.",
      // Sétima revisão.
      "No antecipado, o colete chega e você tem 7 dias pra trocar.",
      "O prazo de troca no antecipado é de 7 dias.",
      "No pix, a troca pode ser pedida em até 7 dias.",
      "No antecipado a devolução pode ser solicitada em até 7 dias.",
      "No pix, se precisar trocar, são 7 dias a partir de quando você receber.",
      "No pix você também tem 7 dias corridos, contados do recebimento, pra devolver.",
      "No pix vale o mesmo direito de 7 dias de arrependimento.",
      // Oitava revisão.
      "No pix você tem 7 dias pra trocar depois que receber.",
      "No pix você tem 7 dias a partir da entrega pra trocar.",
      "No pix você tem 7 dias após a entrega pra devolver.",
      "No pix você tem 7 dias pra devolver a partir da entrega.",
      "No pix você tem 7 dias pra trocar, contados do recebimento.",
      // Loop de 2026-09-25: falas da própria Malu vetadas no antecipado.
      "E pode ficar tranquila que se não amar como ficou você devolve em até 7 dias após o recebimento sem custo nenhum, me passa seu CEP pra eu ver a entrega aí?",
      "Não precisa ter medo de errar, se não gostar pode devolver em até 7 dias após receber e recebe seu dinheiro de volta",
      // Rodada final de 2026-09-25: comparação dos caminhos numa conversa do antecipado.
      "Na entrega não tem parcelamento, você recebe em até 3 dias e o checkout confirma pelo seu CEP, e no antecipado o prazo varia por região, em média 5 dias úteis, e no cartão pelo checkout dá pra parcelar em até 12x.",
      "Fazer por 100 não consigo, o preço é R$ 129,90 que você paga na entrega e recebe em até 3 dias, e no antecipado é R$ 116,91 com 10% de desconto e o prazo varia por região, em média 5 dias úteis.",
    ];
    const vetoed = honest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass");
    expect(vetoed).toEqual([]);
    // O que a exceção do loop de 2026-09-25 não pode abrir: "ver a entrega" com prazo, e o
    // colete recebido junto com o dinheiro.
    for (const lie of [
      "No pix você tem 7 dias pra trocar, dá pra ver a entrega chegar antes.",
      "No pix você devolve em 7 dias e recebe o colete em 7 dias.",
      "No pix você tem 7 dias pra devolver, e recebe seu dinheiro de volta e o colete em até 7 dias.",
      "No antecipado a garantia é de 7 dias pra devolver, e dá pra ver a entrega em casa nesse tempo.",
      "Pagando antecipado, em 7 dias pra trocar você consegue ver a entrega na sua casa.",
      "No antecipado, 7 dias pra trocar e ver a entrega na sua porta.",
      "No antecipado chega em 3 dias, na entrega também.",
      "Na entrega ou no antecipado, chega em 3 dias.",
      "Na entrega é de 1 a 3 dias e no pix chega em 2 dias.",
    ])
      expect(delivery(lie, "prepay"), lie).toBe("block");
    // Fala do pagamento na entrega ("na mão do entregador"): só vale nesse caminho — no
    // antecipado, "1 a 3 dias" é faixa inventada, e a checagem de faixa a veta.
    expect(delivery("Ela paga R$ 129,90 na mão do entregador quando receber em 1 a 3 dias, com 7 dias pra trocar ou devolver se precisar.", "cod")).toBe("pass");
  });
});
