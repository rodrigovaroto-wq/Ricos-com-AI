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

// Segunda revisão da M-08: enchimento entre o verbo da âncora e a contagem ("quando chegar aí
// em 7 dias") não faz da chegada uma âncora de garantia.
const filledAnchors: { text: string; both: boolean }[] = [];
for (const name of [...NAMES, ""])
  for (const ret of ["trocar", "desistir", "devolver"])
    for (const anchor of ["quando chegar", "quando receber", "depois que chegar", "a contar do dia que chegar", "a partir de quando receber", "após receber"])
      for (const filler of ["aí", "na sua casa", "pra você", "aí na sua casa"])
        for (const count of ["em 7 dias", "em uma semana", "em até 7 dias"])
          filledAnchors.push({ text: cap(`${name} você tem 7 dias pra ${ret} ${anchor} ${filler} ${count}.`.trim()), both: name !== "" });

// Segunda revisão da M-08: a palavra de troca ao lado de uma chegada sem verbo de entrega.
const returnThenArrival: string[] = [];
for (const ret of ["trocar", "desistir", "devolver"])
  for (const arrival of ["ele está aí", "tá na sua mão", "o colete é seu"])
    for (const count of ["7 dias", "uma semana"])
      returnThenArrival.push(
        `Pode ${ret}: em ${count} ${arrival}.`,
        `Você tem 7 dias pra ${ret} e ${arrival} em ${count}.`,
        `Pode ${ret} em ${count}, que é quando ele chega.`,
        `Pode ${ret} em ${count}, que é quando você recebe.`,
      );

// Terceira revisão da M-08: a contagem na mesma oração do verbo da âncora é complemento dele,
// qualquer que seja a preposição ou o quantificador — e "tem/trocar" no meio não corta.
const PREPS = [
  "em", "em até", "em uns", "em cerca de", "em torno de", "em mais ou menos", "em no máximo", "no prazo de",
  "por volta de", "com", "depois de", "após", "daqui a", "dentro de",
];
const anchorComplements: string[] = [];
for (const anchor of ["quando chegar", "quando receber", "depois que chegar", "a contar do dia que chegar", "após receber"])
  for (const filler of ["", "lá pra você", "aí", "pra você poder usar", "na casa que você tem", "pra você trocar"])
    for (const prep of PREPS)
      for (const count of ["7 dias", "uma semana"])
        anchorComplements.push(`Tem 7 dias pra trocar ${anchor} ${filler} ${prep} ${count}.`.replace(/\s+/g, " "));

// Terceira revisão: conjunção (e preposição) colada à contagem abre oração nova.
const conjunctionArrivals: string[] = [];
for (const ret of ["Pode trocar", "Você tem 7 dias pra desistir", "Pode devolver"])
  for (const conj of ["e", "mas", "porque", "pois", "já que", "que"])
    for (const prep of ["em", "daqui a", "dentro de", "até"])
      for (const arrival of ["ele está aí", "tá aí", "o colete tá em casa"])
        conjunctionArrivals.push(`${ret} ${conj} ${prep} 7 dias ${arrival}.`);

// Terceira revisão: a âncora depois da contagem só vale colada a ela ou ao propósito.
const detachedAnchors: string[] = [];
for (const ret of ["trocar", "devolver", "desistir"])
  for (const count of ["7 dias", "uma semana"])
    for (const tail of [
      ", que é bem quando ele chega", ", que é justamente quando ele chega", ", quando ele chega", ", bem quando ele chega",
      ", exatamente quando ele chega", ", o mesmo tempo de quando ele chega", ", que é quando você recebe", ", justo quando chegar",
    ])
      detachedAnchors.push(`Pode ${ret} em ${count}${tail}.`);

// Quarta revisão da M-08: o ônus invertido. A contagem da garantia só é isenta quando uma forma
// de garantia a governa; o prazo ou o tempo "até quando chegar" nunca é garantia.
const untilArrival: { text: string; both: boolean }[] = [];
for (const name of ["", "No pix ", "No antecipado "])
  for (const ret of ["pode trocar", "pode devolver", "tem garantia", "pode desistir"])
    for (const noun of ["o prazo", "o tempo", "o prazo de entrega"])
      for (const anchor of ["até quando chegar", "até quando o colete chegar", "até quando você receber", "até chegar"])
        for (const count of ["7 dias", "uma semana"])
          untilArrival.push(
            { text: cap(`${name}${ret}, e ${noun} ${anchor} é de ${count}.`), both: name !== "" },
            { text: cap(`${name}${ret}, ${noun} ${anchor} são ${count}.`), both: name !== "" },
          );
// A chegada entre a troca e "é/são N": "pode trocar, e quando o colete chegar é de 7 dias".
for (const name of ["", "No pix "])
  for (const ret of ["pode trocar", "pode devolver", "tem garantia de troca"])
    for (const arrival of ["e quando o colete chegar é de", "e quando chegar são", "e quando ele chega é de"])
      for (const count of ["7 dias", "uma semana"])
        for (const tail of ["", " de viagem", " até lá"])
          untilArrival.push({ text: cap(`${name}${ret}, ${arrival} ${count}${tail}.`), both: name !== "" });

// Quarta revisão: conjunção + quantificador + contagem + chegada sem verbo.
const conjQuantArrivals: string[] = [];
for (const ret of ["Pode trocar", "Pode devolver", "Você tem 7 dias pra desistir"])
  for (const conj of ["e", "mas", "porque", "pois", "já que", ""])
    for (const quant of ["em até", "em uns", "em média", "com", "numa", "em", "daqui a", ""])
      for (const count of ["7 dias", "semana"])
        for (const arrival of ["ele está aí", "ele tá aí", "o colete tá em casa"]) {
          if (count === "semana" && quant !== "numa") continue;
          if (quant === "numa" && count !== "semana") continue;
          conjQuantArrivals.push(`${ret} ${conj} ${quant} ${count} ${arrival}.`.replace(/\s+/g, " "));
        }
for (const ret of ["Pode trocar", "Pode devolver"])
  for (const conj of ["e", "mas", "porque"])
    conjQuantArrivals.push(`${ret} ${conj} 7 dias depois ele tá aí.`, `${ret} ${conj} uma semana depois ele está aí.`);

// Quarta revisão: as formas honestas de garantia, geradas, têm de PASSAR nos dois caminhos.
const honestWarranty: string[] = [];
for (const name of ["", "No pix, ", "No antecipado, "])
  for (const govern of [
    "você tem {c} pra trocar", "você tem {c} pra devolver", "você tem {c} pra desistir", "são {c} de garantia",
    "pode trocar em até {c}", "a troca é em {c}", "a garantia é de {c}", "você pode devolver em {c}",
  ])
    for (const anchor of [
      "", " depois que receber", ", contados do recebimento", ", a partir do recebimento", " após a entrega",
      ", a contar do dia que receber", ", contados de quando ele chegar", " a partir de quando você receber",
    ])
      for (const c of ["7 dias", "uma semana"])
        honestWarranty.push(cap(`${name}${govern.replace("{c}", c)}${anchor}.`));

// Quinta revisão da M-08: falas do roteiro e da base de conhecimento, e a troca com objeto ou
// adjetivo, geradas — têm de PASSAR nos dois caminhos.
const SCRIPT_LINES = [
  "Eu sei que pagar antes muda a conversa, então deixa eu te dar as garantias: a compra é feita no ambiente da Coinzz, com nota; você tem 7 dias pra trocar ou devolver contando do dia que receber; e eu fico aqui no WhatsApp com você do pedido até a entrega, pode me cobrar.",
  "Aí a gente troca ou devolve, sem drama, você tem 7 dias contando do dia que receber.",
  "E se mesmo assim não servir, chame no WhatsApp. Você tem 7 dias contando de quando recebeu.",
  "Você tem 7 dias pra trocar, contando da data em que você recebe.",
];
const honestObjects: string[] = [...SCRIPT_LINES];
for (const name of ["", "No pix, ", "No antecipado, "])
  for (const c of ["7 dias", "uma semana"]) {
    for (const govern of [
      "você tem {c} pra trocar de tamanho", "você tem {c} pra trocar o tamanho", "você tem {c} pra trocar por outro tamanho",
      "você tem {c} pra devolver o produto", "pode trocar o tamanho em até {c}", "você pode trocar de tamanho em até {c}",
      "a troca é grátis em até {c}", "a troca é gratuita em até {c}", "você tem {c} pra trocar ou devolver",
      "são {c} de garantia", "você tem {c}",
    ])
      for (const start of [
        "", " contando do dia que receber", ", contados da entrega", " a partir do dia que receber",
        ", contando da data em que você recebe", " contando de quando recebeu", " a partir do dia em que chegar",
      ]) {
        // "Você tem N" sem troca só se isenta com ela recebendo (sexta revisão): "contados da
        // entrega" fica fora dessa forma.
        if (govern === "você tem {c}" && (start === "" || start === ", contados da entrega")) continue;
        honestObjects.push(cap(`${name}${govern.replace("{c}", c)}${start}.`));
      }
    honestObjects.push(cap(`${name}a garantia de ${c} vale nos dois.`), cap(`${name}a garantia é igual: ${c}.`));
  }
honestObjects.push("A garantia de 7 dias vale também no antecipado.", "Se o tamanho não servir, a troca é grátis em até 7 dias.");

// Quinta revisão: a chegada em palavras depois da garantia.
const presenceTails: string[] = [];
for (const govern of ["Pode trocar em {c}", "A troca é em {c}", "A garantia é de {c}", "Você tem {c} pra trocar", "Pagando no pix, {c} de garantia"])
  for (const tail of [
    ", e ele está com você", ", e o colete é seu", ", que você já abre a caixa", ", ou seja, você já tem ele",
    " e ele tá contigo", " e ele é seu", ", e o colete tá contigo", "; e ele chega junto", "; e chega na sua casa",
  ])
    for (const c of ["7 dias", "uma semana"]) presenceTails.push(`${govern.replace("{c}", c)}${tail}.`);

// Sexta revisão da M-08: "são / o prazo é de N" + início da contagem sem palavra de troca, com a
// loja como sujeito ("depois que recebermos") ou o substantivo ("a partir do recebimento").
// "Pagou no pix?" nomeia o caminho na frase anterior, que o caminho da entrega não lê (fora da
// M-08): essas só no antecipado.
const startWithoutReturn: string[] = [];
for (const name of ["No pix, ", "No pix ", "No antecipado, ", "Pagou no pix? "])
  for (const verb of ["são {c}", "o prazo é de {c}", "é de {c}", "são {c} úteis"])
    for (const start of [
      " depois que recebermos", " a partir do recebimento", ", contados a partir do recebimento", " contados da data que recebermos",
      " depois do recebimento", " a partir de quando recebermos", " contando do dia que recebermos",
    ])
      for (const c of ["7 dias", "uma semana"]) startWithoutReturn.push(cap(`${name}${verb.replace("{c}", c)}${start}.`));

// Sexta revisão: depois de ";", a entrega, o mesmo prazo e a chegada continuam julgados.
const afterSemicolon: { text: string; both: boolean }[] = [];
for (const govern of ["No pix você tem 7 dias pra trocar", "Pode trocar em 7 dias", "Você tem 7 dias pra trocar", "A troca é em uma semana"])
  for (const tail of [
    "; a entrega também", "; a entrega é igual", "; é o mesmo prazo da entrega", "; o frete é no mesmo prazo",
    "; a transportadora faz no mesmo prazo", "; a entrega segue o mesmo prazo", "; é o prazo da transportadora também",
    "; o correio faz igual", "; e ele vem nesse tempo", "; ele aparece aí nesse prazo", "; nesse prazo ele bate na sua porta",
    "; nesse tempo ele tá na sua casa", "; que é o tempo da viagem", "; e o colete é seu nesse tempo",
  ])
    afterSemicolon.push({ text: `${govern}${tail}.`, both: govern.startsWith("No pix") });

describe("M-08, sexta revisão: início da contagem sem troca, e o que vem depois de ponto e vírgula", () => {
  it(`${startWithoutReturn.length} prazos "são N depois que recebermos", todos vetados nos dois caminhos`, () => {
    expect(
      startWithoutReturn.filter((s) => delivery(s, "prepay") !== "block" || (!s.startsWith("Pagou") && delivery(s, "cod") !== "block")),
    ).toEqual([]);
  });
  it(`${afterSemicolon.length} prazos depois de ponto e vírgula, todos vetados`, () => {
    expect(
      afterSemicolon.filter(({ text, both }) => delivery(text, "prepay") !== "block" || (both && delivery(text, "cod") !== "block")).map((x) => x.text),
    ).toEqual([]);
  });
});

describe("M-08, quinta revisão: roteiro e objeto passam, chegada em palavras não", () => {
  it(`${honestObjects.length} falas honestas, todas passam nos dois caminhos`, () => {
    expect(honestObjects.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
  it(`${presenceTails.length} chegadas em palavras depois da garantia, todas vetadas no antecipado`, () => {
    expect(presenceTails.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

describe("M-08, quarta revisão: o ônus invertido", () => {
  it(`${untilArrival.length} prazos "até quando chegar", todos vetados`, () => {
    expect(
      untilArrival.filter(({ text, both }) => delivery(text, "prepay") !== "block" || (both && delivery(text, "cod") !== "block")).map((x) => x.text),
    ).toEqual([]);
  });
  it(`${conjQuantArrivals.length} conjunções com quantificador e chegada, todas vetadas no antecipado`, () => {
    expect(conjQuantArrivals.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${honestWarranty.length} garantias honestas geradas, todas passam nos dois caminhos`, () => {
    expect(honestWarranty.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
});

describe("M-08, terceira revisão: complemento da âncora, conjunção e âncora solta", () => {
  it(`${anchorComplements.length} contagens complemento do verbo da âncora, todas vetadas no antecipado`, () => {
    expect(anchorComplements.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${conjunctionArrivals.length} chegadas depois de conjunção, todas vetadas no antecipado`, () => {
    expect(conjunctionArrivals.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${detachedAnchors.length} âncoras soltas depois da contagem, todas vetadas no antecipado`, () => {
    expect(detachedAnchors.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

describe("M-08, segunda revisão: âncora com enchimento e troca ao lado da chegada", () => {
  it(`${filledAnchors.length} prazos atrás de âncora com enchimento, todos vetados`, () => {
    expect(
      filledAnchors.filter(({ text, both }) => delivery(text, "prepay") !== "block" || (both && delivery(text, "cod") !== "block")).map((x) => x.text),
    ).toEqual([]);
  });
  it(`${returnThenArrival.length} trocas ao lado da chegada, todas vetadas no antecipado`, () => {
    expect(returnThenArrival.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

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
