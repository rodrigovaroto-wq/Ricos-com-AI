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
    ", e ele está com você", ", e ele tá aqui com você", ", e ele está aí com você", ", e o colete é seu", ", que você já abre a caixa", ", ou seja, você já tem ele",
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

// Sétima revisão da M-08: "do pedido até a entrega" só sai com o sujeito do roteiro ("eu fico
// aqui … com você"); solta, é a entrega no mesmo prazo.
const pedidoAteEntrega: string[] = [];
for (const name of ["No pix, ", "No antecipado, ", "Pagando antes, "])
  for (const govern of ["você tem {c} pra trocar", "pode trocar em {c}", "a garantia é de {c}", "você tem {c} pra devolver"])
    for (const sep of [", ", "; ", " "])
      for (const tail of ["do pedido até a entrega", "e eu te acompanho do pedido até a entrega", "e eu te acompanho do pedido até a entrega, que é rapidinha", "com você do pedido até a entrega"])
        for (const c of ["7 dias", "uma semana"]) pedidoAteEntrega.push(cap(`${name}${govern.replace("{c}", c)}${sep}${tail}.`));

// Sétima revisão: "o prazo pra trocar é de N" é garantia — o "prazo" só não é tomado sem troca.
const honestPrazo: string[] = [];
for (const name of ["", "No pix, ", "No antecipado, "])
  for (const lead of ["o prazo pra trocar é de", "o prazo pra devolver é de", "seu prazo pra desistir é de", "pra trocar, o prazo é de", "o prazo pra trocar ou devolver é de"])
    for (const start of ["", " depois que receber", ", contados do recebimento"])
      for (const c of ["7 dias", "uma semana"]) honestPrazo.push(cap(`${name}${lead} ${c}${start}.`));

// Oitava revisão da M-08: "o prazo é / são / fica / é N" depois de uma troca solta, em outra
// oração, é prazo — a troca só toma a contagem quando a governa ("o prazo pra trocar é de",
// "pra trocar, o prazo é de", "se precisar trocar, são").
const looseReturn: string[] = [];
for (const name of ["No antecipado ", "No pix ", "Pagando antes, ", "No pix, "])
  for (const ret of ["a troca é fácil", "pode trocar", "tem garantia", "com garantia", "tem troca grátis", "a devolução é fácil", "com direito a troca"])
    for (const sep of [", e ", " e ", ", ", "; "])
      for (const verb of ["o prazo é", "o prazo é de", "são", "fica", "é", "o prazo fica", "o prazo são"])
        for (const c of ["7 dias", "uma semana"]) looseReturn.push(cap(`${name}${ret}${sep}${verb} ${c}.`));

// Nona revisão: "se … <chegada> e <troca>, são N" — o "se" não atravessa a chegada.
const ifArrival: string[] = [];
for (const name of ["No pix, ", "No antecipado, ", "Pagando antes, "])
  for (const cond of ["se precisar", "se quiser"])
    for (const arr of ["receber", "chegar", "esperar a entrega"])
      for (const ret of ["trocar", "devolver"])
        for (const takes of [", são", ", você tem", ", o prazo é de"])
          for (const c of ["7 dias", "uma semana"]) ifArrival.push(cap(`${name}${cond} ${arr} e ${ret}${takes} ${c}.`));

describe("M-08, oitava revisão: a troca solta não toma a contagem", () => {
  it(`${looseReturn.length} prazos depois de troca solta, todos vetados nos dois caminhos`, () => {
    expect(looseReturn.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${ifArrival.length} prazos com "se … chegada e troca", todos vetados nos dois caminhos`, () => {
    expect(ifArrival.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
});

describe("M-08, sétima revisão: locução do roteiro presa ao sujeito, e o prazo de troca", () => {
  it(`${pedidoAteEntrega.length} garantias com "do pedido até a entrega", todas vetadas nos dois caminhos`, () => {
    expect(pedidoAteEntrega.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${honestPrazo.length} "o prazo pra trocar é de N", todas passam nos dois caminhos`, () => {
    expect(honestPrazo.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
});

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

// 2026-09-28: a troca com objeto "pelo tamanho certo" (o `OBJECT` só lia "de/o/a/por outro" +
// substantivo) não governava a contagem, e a âncora "após o recebimento" virava chegada. Honesta
// com o 7 e com ela recebendo; toda isca de garantia com o objeto, e o 7 com uma chegada, seguem prazo.
const OBJECTS = ["pelo tamanho certo", "pelo número certo", "pelo tamanho maior"];
const objectHonest: string[] = [];
const objectLies: string[] = [];
for (const obj of OBJECTS) {
  for (const name of ["", "No pix, ", "No antecipado, ", "Na entrega, "])
    for (const govern of ["pode trocar {o} em até 7 dias", "você tem 7 dias pra trocar {o}", "pra trocar {o}, você tem 7 dias"])
      for (const anchor of ["", " após o recebimento", " depois de receber", " depois que chegar", ", contando de quando recebeu"])
        objectHonest.push(cap(`${name}${govern.replace("{o}", obj)}${anchor}.`));
  for (const name of NAMES) {
    for (const n of [1, 2, 3, 10])
      for (const bait of [...WARRANTY_BAITS.filter((b) => /\btroc/.test(b)), "{name} pode trocar em até {n} dias após o recebimento."])
        objectLies.push(cap(bait.replace(/\b(troca\w*)/, `$1 ${obj}`).replaceAll("{name}", name).replaceAll("{n}", String(n))));
    for (const bait of [
      "{name} pode trocar {o} em até 7 dias, e chega junto.", "{name} pode trocar {o} e chega em 7 dias.",
      "{name} pode trocar {o} em até 7 dias; a entrega também.", "{name} pode trocar {o} em 7 dias, quando chegar aí na sua casa.",
      "{name} você tem 7 dias pra trocar {o} e ele chega junto.", "{name} pra trocar {o}, o prazo até quando chegar é de 7 dias.",
    ])
      objectLies.push(cap(bait.replaceAll("{o}", obj).replaceAll("{name}", name)));
  }
}

describe("2026-09-28: a troca 'pelo tamanho certo' governa a garantia, e só ela", () => {
  it(`${objectHonest.length} garantias com objeto, todas passam nos dois caminhos`, () => {
    expect(objectHonest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
  it(`${new Set(objectLies).size} iscas com o objeto, todas vetadas nos dois caminhos`, () => {
    expect([...new Set(objectLies)].filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
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
      // Only the CEP purpose frees "ver a entrega" (cep-entrega mutation; the line above is
      // also caught by "nesse tempo" since M-08's fourth review).
      "No antecipado você tem 7 dias pra trocar, e dá pra ver a entrega aí.",
      "Pagando antecipado, em 7 dias pra trocar você consegue ver a entrega na sua casa.",
      "No antecipado, 7 dias pra trocar e ver a entrega na sua porta.",
      "No antecipado chega em 3 dias, na entrega também.",
      "Na entrega ou no antecipado, chega em 3 dias.",
      "Na entrega é de 1 a 3 dias e no pix chega em 2 dias.",
    ])
      expect(delivery(lie, "prepay"), lie).toBe("block");
    // Fala do pagamento na entrega ("paga … na mão do entregador"): nomeia a entrega, e desde
    // 2026-09-28 (um nome por caminho) a faixa é dela também numa conversa do antecipado — como a
    // contagem já era. O entregador sozinho não nomeia caminho nenhum: ele entrega os dois.
    expect(delivery("Ela paga R$ 129,90 na mão do entregador quando receber em 1 a 3 dias, com 7 dias pra trocar ou devolver se precisar.", "cod")).toBe("pass");
    expect(delivery("Ela paga R$ 129,90 na mão do entregador quando receber em 1 a 3 dias, com 7 dias pra trocar ou devolver se precisar.", "prepay")).toBe("pass");
    expect(delivery("No antecipado, o entregador leva de 1 a 3 dias.", "cod")).toBe("block");
  });
});

// M-10: no caminho da entrega, toda contagem de entrega cabe na faixa configurada (1 a 3 no
// fixture) — um número dentro dela, ou a faixa inteira dentro dela. Semana nunca cabe. Nomes da
// entrega × verbos × contagens por extenso e em dígito, avulsas e em faixa, com as iscas que já
// liberaram mentira noutras regras.
const COD_NAMES = ["Na entrega", "Pagando na entrega", "No pagamento na entrega", "Pagando na porta", "Pagando na mão do entregador"];
const COD_VERBS = [
  "chega em {c}", "você recebe em {c}", "a entrega leva {c}", "chega em até {c}", "demora {c}", "leva de {c}",
  "o prazo é de {c}", "chega em no máximo {c}", "o colete tá aí em {c}",
];
const COD_BAITS = [
  "{name} {verb}.", "{name}, {verb}.", "{name} {verb}, com garantia.", "{name} não demora, {verb}.", "{name} sem demora, {verb}.",
  "{name}, pode ficar tranquila que {verb}.", "Não posso negar que {name} {verb}.", "{name} {verb} ou seu dinheiro de volta.",
  "{name} chega em 1 a 3 dias, no máximo {c}.", "{name} é rapidinho: {verb}.",
];
const COD_LIE_COUNTS = [
  "4 dias", "5 dias", "10 dias", "quatro dias", "cinco dias", "dez dias", "quinze dias", "uns 5 dias",
  "uma semana", "1 semana", "duas semanas", "2 semanas", "um a cinco dias", "dois a cinco dias", "uma a duas semanas", "um a dez dias",
];
const COD_OK_COUNTS = ["1 dia", "2 dias", "3 dias", "um dia", "dois dias", "três dias", "1 a 3 dias", "um a três dias", "dois a três dias", "1 a 2 dias"];
const codCounts = (counts: string[], name: string) =>
  counts.flatMap((c) =>
    COD_VERBS.flatMap((verb) =>
      COD_BAITS.filter((b) => !b.includes("no máximo {c}") || counts === COD_LIE_COUNTS).map((bait) =>
        cap(bait.replaceAll("{verb}", verb).replaceAll("{name}", name).replaceAll("{c}", c).replace(/^\s*,?\s*/, "").replace(/\s+/g, " ").replace(" , ", ", ")),
      ),
    ),
  );
const codLiesNamed = [...new Set(COD_NAMES.flatMap((n) => codCounts(COD_LIE_COUNTS, n)))];
const codLiesBare = [...new Set(codCounts(COD_LIE_COUNTS, ""))];
const codHonestNamed = [...new Set(COD_NAMES.flatMap((n) => codCounts(COD_OK_COUNTS, n)))];
const codHonestBare = [...new Set(codCounts(COD_OK_COUNTS, ""))];

// M-10: o nome do antecipado num cabeçalho logo antes — pergunta, ou fragmento de até 4
// palavras, em sequência — vale para a frase seguinte que não nomeia caminho nenhum.
const HEADERS = [
  "Pagou no pix?", "E no pix?", "No antecipado?", "Pagando antes?", "Se pagar no pix?", "Quer pagar no cartão?", "No boleto?",
  "Pix?", "No pix.", "Pagando antecipado!", "Pagou no pix? Ótimo.", "E se for no pix? Perfeito, então.", "Prefere na entrega ou no pix?",
  "E pagando à vista?", "Com crédito?",
];
const HEADER_LIES = [
  "Chega em 2 dias.", "Chega em 1 a 3 dias.", "São 7 dias contados da data que recebermos.", "Você recebe em 3 dias.", "Leva uma semana.",
  "A entrega leva de um a três dias.", "Chega em 5 dias.", "O prazo é de 2 dias.", "Em 2 dias ele está aí na sua casa.",
  "Pode ficar tranquila, chega em dois dias.", "Não demora, chega em 1 a 3 dias.",
];
const HEADER_HONEST = [
  "Varia por região, em média 5 dias úteis.", "O prazo varia, em média 5 dias úteis.", "Você tem 7 dias pra trocar depois que receber.",
  "Não consigo garantir 2 dias, varia por região, em média 5 dias úteis.",
];
// M-10: a garantia dita no caminho da entrega, com o nome dele na frente — o nome do caminho não é
// chegada. Têm de passar nos dois caminhos.
const codWarranty: string[] = [];
for (const name of ["Na entrega", "Na entrega,", "Pagando na entrega", "No pagamento na entrega,", "Pagando na porta,", "Pagando na mão do entregador"])
  for (const govern of ["você tem 7 dias pra trocar", "você tem 7 dias pra devolver", "são 7 dias de garantia", "a troca é em 7 dias", "você pode devolver em 7 dias", "pode trocar em até uma semana"])
    for (const anchor of ["", " depois que receber", ", contados do recebimento", " após a entrega"])
      codWarranty.push(`${name} ${govern}${anchor}.`);
// E o que essa exceção não pode abrir: o 7 da garantia como prazo de chegada, com o nome da entrega.
const codWarrantyLies: string[] = [];
for (const name of ["Na entrega", "Pagando na entrega", "No pagamento na entrega", "Pagando na porta", "Pagando na mão do entregador"])
  for (const bait of [
    "{name} chega em 7 dias pra trocar.", "{name} leva 7 dias, com garantia.", "{name} a garantia é de 7 dias pra entrega.",
    "{name} a troca é em 7 dias e chega junto.", "{name}: 7 dias, com garantia.", "{name} você tem 7 dias pra trocar e ele está aí em 7 dias.",
    "{name} a troca é em 7 dias, e a entrega também.", "{name} pode trocar em 7 dias, que é quando ele chega.", "{name} em 7 dias está aí, pode trocar.",
    "{name} pode trocar: em 7 dias ele está aí.", "{name} a troca é fácil, e o prazo é 7 dias.", "{name} são 7 dias depois que recebermos.",
    "{name} você tem 7 dias pra trocar, na entrega em 7 dias.", "{name} em 7 dias pra trocar ele chega.",
  ])
    codWarrantyLies.push(bait.replaceAll("{name}", name));

const headerLies = HEADERS.flatMap((h) => HEADER_LIES.map((b) => `${h} ${b}`));
const headerHonest = HEADERS.flatMap((h) => HEADER_HONEST.map((b) => `${h} ${b}`));

describe("M-10: o prazo da entrega por extenso e avulso, e o nome do caminho na frase anterior", () => {
  it(`${codLiesNamed.length} prazos fora da faixa com nome da entrega, todos vetados nos dois caminhos`, () => {
    expect(codLiesNamed.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block").slice(0, 40)).toEqual([]);
  });
  it(`${codLiesBare.length} prazos fora da faixa sem nome, todos vetados no caminho da entrega`, () => {
    expect(codLiesBare.filter((s) => delivery(s, "cod") !== "block").slice(0, 40)).toEqual([]);
  });
  // No antecipado, a checagem de faixa só lê "na entrega" como nome da entrega: "pagando na porta, 1 a 3
  // dias" é vetada lá desde antes da M-10 (falso positivo barato, fora deste conserto).
  it(`${codHonestNamed.length} prazos dentro da faixa com nome da entrega, todos passam`, () => {
    expect(
      codHonestNamed.filter((s) => delivery(s, "cod") !== "pass" || (/na entrega/i.test(s) && delivery(s, "prepay") !== "pass")).slice(0, 40),
    ).toEqual([]);
  });
  it(`${codHonestBare.length} prazos dentro da faixa sem nome, todos passam no caminho da entrega`, () => {
    expect(codHonestBare.filter((s) => delivery(s, "cod") !== "pass").slice(0, 40)).toEqual([]);
  });
  it(`${codWarranty.length} garantias com o nome da entrega na frente, todas passam nos dois caminhos`, () => {
    expect(codWarranty.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
  it(`${codWarrantyLies.length} prazos com forma de garantia e nome da entrega, todos vetados nos dois caminhos`, () => {
    expect(codWarrantyLies.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`${headerLies.length} prazos atrás de cabeçalho do antecipado, todos vetados nos dois caminhos`, () => {
    expect(headerLies.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block").slice(0, 40)).toEqual([]);
  });
  it(`${headerHonest.length} médias e garantias atrás de cabeçalho do antecipado, todas passam nos dois caminhos`, () => {
    expect(headerHonest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass").slice(0, 40)).toEqual([]);
  });
});

// M-10, revisão independente: o nome do antecipado negado não nomeia o antecipado. Negadores ×
// nomes × corpo honesto da entrega (tem de passar no COD) e corpo mentiroso (tem de ser vetado).
const NEGATED: Array<(n: string) => string> = [
  (n) => `Nada de ${n}.`, (n) => `Sem ${n}.`, (n) => `Sem ${n}?`, (n) => `Não precisa de ${n}.`, (n) => `Nem ${n}.`,
  (n) => `${cap(n)} não precisa.`, (n) => `${cap(n)} não!`, (n) => `Você não quer ${n}.`,
];
const NEGATED_NAMES = ["pix", "Pix", "boleto", "transferência", "antecipado", "pagar antes", "pagamento adiantado"];
const NEGATED_HONEST = ["Chega em 1 a 3 dias.", "A entrega leva de 1 a 3 dias.", "Você recebe em 1 a 3 dias.", "Chega em 2 dias.", "A entrega leva de um a três dias."];
const NEGATED_LIES = [
  "Chega em 5 dias, depende da região.", "Chega em 5 dias, varia.", "Chega em uma semana.", "Varia, em média 5 dias úteis.",
  "Em média 5 dias úteis.", "Chega em 1 a 5 dias.", "A entrega leva de 4 a 6 dias.",
];
const negatedHonest: string[] = [];
const negatedLies: string[] = [];
for (const neg of NEGATED)
  for (const n of NEGATED_NAMES) {
    for (const b of NEGATED_HONEST) negatedHonest.push(`${neg(n)} ${b}`);
    // Cabeçalho é pergunta ou fragmento de até 4 palavras (M-10); afirmação maior encerra a janela.
    if (neg(n).endsWith("?") || neg(n).split(/\s+/).length <= 4) for (const b of NEGATED_LIES) negatedLies.push(`${neg(n)} ${b}`);
  }
// Na mesma frase, a faixa (a contagem avulsa com o nome na frase é outra regra, anterior à M-10).
for (const n of NEGATED_NAMES)
  for (const lead of [`Sem ${n}, `, `Nada de ${n}: `, `Não precisa de ${n}, `, `Sem ${n} e sem cartão, `]) {
    negatedHonest.push(`${lead}chega em 1 a 3 dias.`, `${lead}a entrega leva de 1 a 3 dias.`);
    negatedLies.push(`${lead}chega em 1 a 5 dias.`, `${lead}chega em 5 dias, varia.`, `${lead}em média 5 dias úteis.`);
  }
// Negativas que não negam: o antecipado continua nomeado, e a faixa da entrega é mentira nele.
const notNegating: string[] = [];
for (const n of ["pix", "boleto", "antecipado"])
  notNegating.push(
    `Não quer pagar no ${n}? Chega em 1 a 3 dias.`, `Não é caro no ${n}? Chega em 1 a 3 dias.`, `No ${n} não demora, chega em 1 a 3 dias.`,
    `Sem juros no ${n}: chega em 1 a 3 dias.`, `Nem precisa esperar, no ${n} chega em 1 a 3 dias.`, `Não quer pagar no ${n}? Chega em 2 dias.`,
  );
// Revisão final de correção: "<nome> não precisa <verbo>" e "nem no <nome> <verbo>" (= "nem mesmo")
// dizem algo do antecipado, não o negam — passavam no COD depois do 5995923.
for (const n of ["no pix", "no boleto", "no antecipado", "pagando antecipado", "pagando antes", "pagou no pix", "se pagar no pix"])
  for (const pred of [
    "não precisa esperar", "não precisa esperar muito", "não precisa se preocupar", "não precisa esperar a entrega",
    "não precisa de cadastro e", "não precisa de comprovante, e", "nao precisa pagar frete", "não precisa fazer nada",
  ])
    for (const body of ["chega em 2 dias.", "você recebe em 2 dias.", "chega em 1 a 3 dias.", "em 2 dias chega."])
      notNegating.push(cap(n) + " " + pred + (/(?:,| e)$/.test(pred) ? " " : ", ") + body);
for (const n of ["no pix", "no antecipado", "no boleto", "pagando antes"])
  for (const pred of ["demora: chega em 2 dias.", "demora, chega em 2 dias.", "passa de 2 dias.", "demora mais que 2 dias.", "leva mais de 1 a 3 dias."])
    notNegating.push("Nem " + n + " " + pred);
// E o que tem de continuar passando no COD: o nome negado com pontuação, ou em série com outro "nem".
const stillDenied = [
  "Sem pix, chega em 1 a 3 dias.", "Pix não precisa. Chega em 1 a 3 dias.", "Te mando o link e chega em 1 a 3 dias.",
  "Nada de cartão, nada de Pix, nada de cadastro. O colete chega na sua casa em 1 a 3 dias.",
  "Nem pix, nem boleto: chega em 1 a 3 dias.", "Nem pix nem boleto, chega em 1 a 3 dias.", "Nem pix. Chega em 2 dias.",
  "Pix não precisa, chega em 1 a 3 dias.",
];

describe("M-10, revisão independente: o antecipado negado não nomeia o antecipado", () => {
  it(`${negatedHonest.length} prazos da entrega depois do antecipado negado, todos passam no caminho da entrega`, () => {
    expect(negatedHonest.filter((s) => delivery(s, "cod") !== "pass").slice(0, 40)).toEqual([]);
  });
  it(`${negatedLies.length} prazos fora da faixa depois do antecipado negado, todos vetados no caminho da entrega`, () => {
    expect(negatedLies.filter((s) => delivery(s, "cod") !== "block").slice(0, 40)).toEqual([]);
  });
  it(`${notNegating.length} negativas que não negam o antecipado, todas vetadas nos dois caminhos`, () => {
    expect(notNegating.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(stillDenied.length + " negações de verdade continuam passando no caminho da entrega", () => {
    expect(stillDenied.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
  });
});

// Revisão de integração: "um/uma" é artigo tanto quanto contagem. A régua mandava "esperando um
// dia bom" e o antecipado vetava — e o toque vetado é cancelado sem aviso. Fora de frase que fala
// de entrega, chegada, posse ou do antecipado, "um/uma" só conta prazo quando uma palavra de
// tempo o toma ("em/de/até/só/tem/leva … uma semana", "um dia só").
const articleHonest: string[] = [];
for (const open of ["", "Oi! ", "Olha, "])
  for (const s of [
    "pensa naquela roupa que está parada no armário esperando um dia bom.", "um dia desses você me conta.",
    "usa um dia inteiro sem incomodar.", "uma semana depois de usar você já sente a diferença.",
    "num dia desses você me manda uma foto.", "veste um dia qualquer e me conta.", "uma semana depois você me fala.",
  ])
    articleHonest.push(open ? open + s : cap(s));
// A contagem do pagamento compensar não é prazo de entrega.
for (const n of ["No pix", "No antecipado", "Pagando antes", "No boleto"])
  for (const c of ["um dia", "uma semana"])
    for (const p of ["pra eu confirmar o pagamento", "pra compensar", "para o banco aprovar", "pra gente identificar o pagamento"])
      articleHonest.push(n + " é só " + c + " " + p + ".");
// A negação que governa a contagem, com a verdade na mesma frase.
const deniedHonestCod = [
  "Na entrega não chega em uma semana, chega em 1 a 3 dias.", "Na entrega chega em até 3 dias, nunca uma semana.",
  "Na entrega não é uma semana, é de 1 a 3 dias.", "Na entrega nunca uma semana: de 1 a 3 dias.",
];
const deniedHonestPrepay = [
  "No antecipado não chega em um dia, chega em média 5 dias úteis.", "No antecipado não é um dia, varia, em média 5 dias úteis.",
];
// As mentiras vizinhas: "um/uma" tomado por palavra de tempo, com o antecipado nomeado, ou com a
// chegada/posse na frase — e a negação que não nega ("não demora um dia") ou nega sem a verdade.
const articleLies: string[] = [];
for (const c of ["um dia", "uma semana", "num dia", "numa semana"]) {
  const em = c.startsWith("n") ? c : "em " + c;
  const bare = c.replace(/^n/, "");
  articleLies.push(
    cap(em) + " o colete é seu.", cap(em) + " você já abre a caixa.", cap(em) + " ele tá contigo.", cap(em) + " tá na sua mão.",
    "No antecipado, " + bare + " só.", "No pix é " + bare + ".", "Pagando antes, " + em + " você recebe.",
    "No antecipado leva " + bare + ".", "Pelo link não passa de " + bare + ".", "No pix é só " + bare + " e chega.",
    "No pix é só " + bare + " pra confirmar e já chega.", "No antecipado não demora " + bare + ".",
    "Não chega em " + bare + ", chega antes.",
  );
}
const articleLiesCod = [
  "Na entrega chega em uma semana.", "Na entrega não chega em uma semana.", "Na entrega, nunca menos de uma semana.",
  "Na entrega não demora, chega em 5 dias.", "Não demora, em uma semana tá aí.",
];

describe("revisão de integração: 'um/uma' é artigo fora de prazo, e a negação governa a contagem", () => {
  it(articleHonest.length + " falas com artigo ou pagamento, todas passam nos dois caminhos", () => {
    expect(articleHonest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
  });
  it("a negação com a verdade na frase passa no caminho que ela descreve", () => {
    expect(deniedHonestCod.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
    expect(deniedHonestPrepay.filter((s) => delivery(s, "prepay") !== "pass" || delivery(s, "cod") !== "pass")).toEqual([]);
  });
  it(articleLies.length + " mentiras com um/uma, todas vetadas no antecipado", () => {
    expect(articleLies.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(articleLiesCod.length + " mentiras vizinhas, todas vetadas na entrega", () => {
    expect(articleLiesCod.filter((s) => delivery(s, "cod") !== "block")).toEqual([]);
  });
  it("negar uma semana no antecipado ainda diz que é mais rápido — vetado", () => {
    expect(delivery("No antecipado não chega em uma semana, chega em média 5 dias úteis.", "prepay")).toBe("block");
  });
});

// Reestruturação (2026-09-28): um nome por caminho, uma função de caminho e um vocabulário de
// chegada. Cada item tem a frase honesta que precisa passar e a mentira vizinha que precisa barrar.
// a) Recusar a data impossível na entrega é o trabalho — a negação que governa a contagem, com a
// verdade na mesma frase. A negação que não governa ("não demora, chega…"), a que promete teto
// ("não passa de", "não demora mais que") e a sem verdade continuam vetadas.
const refusalHonest = [
  "Não, na entrega não demora uma semana: chega em 1 a 3 dias.", "Na entrega não chega em 5 dias, chega em 1 a 3 dias.",
  "Na entrega não é 5 dias, é de 1 a 3 dias.", "Na entrega chega em até 3 dias, nunca 5 dias.",
  "Na entrega não leva 10 dias não, é de 1 a 3 dias.",
];
const refusalLies = ["Não demora, chega em 5 dias", "Na entrega não demora, chega em 5 dias.", "Na entrega não chega em 5 dias."];
for (const neg of ["não", "nunca"])
  for (const verb of ["chega em", "recebe em", "entrega em", "é", "leva", "demora", ""])
    for (const c of ["5 dias", "10 dias", "uma semana", "duas semanas", "quinze dias"]) {
      const denial = ("Na entrega " + neg + " " + verb + " " + c).replace(/\s+/g, " ");
      for (const truth of [", chega em 1 a 3 dias.", ": é de 1 a 3 dias.", ", você recebe em até 3 dias."]) refusalHonest.push(denial + truth);
      refusalLies.push(denial + ".", denial + ", chega em 4 dias.", denial + ", chega em " + (c === "5 dias" ? "6" : "5") + " dias.");
    }
for (const c of ["5 dias", "uma semana", "10 dias"])
  refusalLies.push(
    "Na entrega não passa de " + c + ", geralmente 1 a 3 dias.", "Na entrega não demora mais que " + c + ", em geral 1 a 3 dias.",
    "Na entrega nunca menos de " + c + ", às vezes 1 a 3 dias.", "Não demora, em " + c + " tá aí e em 1 a 3 dias você usa.",
  );

// b) Garantia e média do antecipado na mesma frase (prompt.ts, fala da garantia).
const warrantyAndAverage = [
  "Você tem 7 dias pra trocar ou devolver, e no antecipado o prazo varia por região, em média 5 dias úteis.",
  "A troca é grátis em até 7 dias; no pix chega em média 5 dias úteis, varia por região.",
];
const warrantyAndAverageLies = [
  "Você tem 7 dias pra trocar ou devolver, e no antecipado o prazo é o mesmo, em média 5 dias úteis.",
  "A troca é grátis em até 7 dias; no pix chega em média 5 dias úteis, varia por região, e chega junto.",
  "Você tem 7 dias pra trocar, e no antecipado varia por região, em média 7 dias úteis.",
  "A troca é grátis em até 7 dias; no pix chega em 7 dias.",
];

// c) O antecipado negado nomeia a entrega, e a posse sem verbo é chegada: fora da faixa, vetada.
const deniedPossessionLies: string[] = [];
for (const lead of ["Sem pix,", "Nada de pix:", "Não precisa pagar antes,", "Sem boleto,", "Nada de cartão, nada de pix:"])
  for (const c of ["em 5 dias", "em até 4 dias", "numa semana", "em dez dias"])
    for (const arrival of ["o colete é seu", "ele tá com você", "ele tá contigo", "você já abre a caixa"])
      deniedPossessionLies.push(lead + " " + c + " " + arrival + ".");
const deniedPossessionHonest = ["Sem pix, em 2 dias o colete é seu.", "Nada de pix: em até 3 dias ele tá com você."];

// d) No antecipado, a contagem sem caminho nomeado só é prazo quando fala de entrega ou chegada.
const notDeadlinePrepay = [
  "Se devolver, o reembolso cai em até 5 dias úteis na sua conta.", "Se precisar devolver, o dinheiro volta em até 10 dias.",
  "Pelo CDC você tem 7 dias pra desistir e 90 dias de garantia contra defeito.", "A promoção vale só por 5 dias.",
  "O link fica válido por 2 dias.", "Nos primeiros 3 dias usa só umas horas, depois o dia todo.",
  "Com uns 2 dias de uso você se acostuma.", "Usa ele por 2 dias e me conta o que achou.",
  "Nos primeiros 2 dias pode apertar um pouco, é normal.", "Te chamo daqui a 2 dias pra saber o que achou.",
  "Tem cliente que usa há 30 dias e ama.",
  "Você escolhe um dos próximos 3 dias, recebe em casa e paga R$ 129,90 na mão do entregador.",
];
const notDeadlineCod = ["Usa ele uns 15 dias em casa e depois me conta como ficou."];
// A sonda negada: sem nome, com chegada ou posse, continua prazo no antecipado.
const unnamedArrivalLies: string[] = [];
for (const c of ["2 dias", "3 dias", "10 dias", "uma semana", "dois dias"])
  for (const s of [
    "Em {c} chega.", "Em {c} o colete tá em casa.", "Em {c} ele está na sua casa.", "Em {c} o colete é seu.", "Leva {c}.",
    "Demora {c}.", "É rapidinho, {c}.", "Em {c} você já veste.", "Em {c} você recebe.", "O prazo é de {c}.",
    "Em {c} ele tá contigo.", "Em {c} tá na sua mão.", "Usa ele por {c} e chega aí.", "Em {c} de uso ele está aí.",
    // A contagem que é a oração inteira responde a pergunta do prazo.
    "É {c}.", "São {c}.", "Em {c}.", "{c}, viu?", "Sem pix, é {c}.", "Mais ou menos {c}.",
  ])
    unnamedArrivalLies.push(s.replace("{c}", c));

// e) A cauda da garantia: o que não fala de tempo nem de chegada passa; a chegada disfarçada, não.
const warrantyTailsHonest = [
  "Você tem 7 dias pra trocar e eu te ajudo logo.", "Você tem 7 dias pra trocar, sem burocracia e sem perder tempo.",
  "Você tem 7 dias pra trocar, e eu fico aqui contigo.", "São 7 dias pra trocar, mesmo tamanho ou outro.",
  "Pagamento na entrega, 7 dias pra trocar e suporte todo dia.",
];
const warrantyTailsLies = [
  "Você tem 7 dias pra trocar e logo tá aí.", "Você tem 7 dias pra trocar, e ele fica aqui contigo.",
  "São 7 dias pra trocar, mesmo prazo da entrega.", "Você tem 7 dias pra trocar e todo dia ele chega.",
  "Você tem 7 dias pra trocar, sem perder tempo: ele chega junto.", "São 7 dias pra trocar, e é o mesmo tempo.",
];

// f) "Sem/nada de <nome> <adjetivo>" não nega o antecipado: fala dele.
const notDenyingAdjective: string[] = [];
for (const lead of ["Nada de", "Sem", "Não precisa de"])
  for (const n of ["pix", "boleto", "antecipado", "pagamento antecipado"])
    for (const adj of ["demorado", "que demora", "lento", "caro", "complicado"])
      for (const body of ["chega em 2 dias.", "em média 2 dias úteis.", "você recebe em 1 a 3 dias."])
        notDenyingAdjective.push(lead + " " + n + " " + adj + ", " + body, lead + " " + n + " " + adj + ": " + body);
const stillDeniedSeries = ["Sem pix e sem boleto, chega em 2 dias.", "Nada de pix nem cartão: chega em 1 a 3 dias.", "Sem pix nenhum, chega em 2 dias."];

// g) A função única de caminho: nome depois da contagem, cabeçalho da entrega, os dois caminhos.
const pathLies: Array<[string, "cod" | "prepay"]> = [
  ["Chega em 2 dias no pix.", "cod"], ["Chega em 5 dias na entrega.", "prepay"], ["Vai ser na entrega? Chega em média 5 dias úteis.", "prepay"],
  ["No pix ou na entrega, chega em 1 a 3 dias.", "cod"], ["No pix ou na entrega, chega em 1 a 3 dias.", "prepay"],
  ["Você recebe em 2 dias pelo pix.", "cod"], ["Chega em uma semana na entrega.", "prepay"], ["Na entrega? Varia, em média 5 dias úteis.", "prepay"],
  ["No pix ou na entrega, chega em 2 dias.", "cod"], ["Na entrega ou no pix, em média 5 dias úteis.", "cod"],
  ["Vai ser na entrega? Chega em 2 dias.", "prepay"], ["No pix, o entregador leva 2 dias.", "cod"], ["O entregador leva 2 dias.", "prepay"],
  ["No pix ou na entrega, em média 5 dias úteis.", "cod"],
];
// A faixa e a contagem da entrega, com o antecipado nomeado depois: além da janela dele, só cabe o
// que é preço ou pagamento — nunca tempo, chegada ou semelhança junto do preço.
const priceTailLies: string[] = [];
for (const head of ["Na entrega você recebe em 1 a 3 dias", "Na entrega chega em 2 dias", "Pagando na porta, você recebe em até 3 dias"])
  for (const t of [
    "e o frete é grátis e chega junto", "e no cartão parcela em 12x e é parecido", "e com desconto de 10%, 2 dias",
    "e o preço é R$ 116,91, é o mesmo tempo", "e no cartão o valor muda, mas chega igual", "e com desconto bate com esse prazo",
    "e o preço é R$ 116,91 e em 2 dias tá aí", "e com desconto chega antes", "e no cartão em 12x, também",
  ])
    priceTailLies.push(head + ", e no antecipado varia por região, em média 5 dias úteis, " + t + ".");
const pathHonest: Array<[string, "cod" | "prepay"]> = [
  ["Nada de pix, nada de cartão: você recebe em 1 a 3 dias e paga na porta.", "prepay"],
  ["Chega em 2 dias na entrega.", "prepay"], ["Chega em média 5 dias úteis no pix.", "cod"],
  ["Vai ser na entrega? Chega em 1 a 3 dias.", "cod"],
];

describe("reestruturação (2026-09-28): um nome por caminho, uma função de caminho, um vocabulário de chegada", () => {
  it("a) " + refusalHonest.length + " recusas da data impossível passam na entrega; " + refusalLies.length + " vizinhas, vetadas", () => {
    expect(refusalHonest.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
    expect(refusalLies.filter((s) => delivery(s, "cod") !== "block")).toEqual([]);
  });
  it("b) garantia e média do antecipado na mesma frase passam nos dois caminhos; as vizinhas, não", () => {
    expect(warrantyAndAverage.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
    expect(warrantyAndAverageLies.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it("c) " + deniedPossessionLies.length + " posses fora da faixa depois do antecipado negado, vetadas na entrega", () => {
    expect(deniedPossessionLies.filter((s) => delivery(s, "cod") !== "block")).toEqual([]);
    expect(deniedPossessionHonest.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
  });
  it("d) contagem que não é prazo passa; " + unnamedArrivalLies.length + " chegadas sem nome continuam vetadas no antecipado", () => {
    expect(notDeadlinePrepay.filter((s) => delivery(s, "prepay") !== "pass")).toEqual([]);
    expect(notDeadlineCod.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
    expect(unnamedArrivalLies.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it("e) a cauda da garantia sem tempo nem chegada passa nos dois caminhos; a chegada disfarçada, não", () => {
    expect(warrantyTailsHonest.filter((s) => delivery(s, "cod") !== "pass" || delivery(s, "prepay") !== "pass")).toEqual([]);
    expect(warrantyTailsLies.filter((s) => delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it("f) " + notDenyingAdjective.length + " \"sem <nome> <adjetivo>\" falam do antecipado: vetadas na entrega", () => {
    expect(notDenyingAdjective.filter((s) => delivery(s, "cod") !== "block")).toEqual([]);
    expect(stillDeniedSeries.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
  });
  it("a faixa da entrega com o antecipado depois: " + priceTailLies.length + " caudas de preço com tempo, vetadas nos dois caminhos", () => {
    expect(priceTailLies.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it("g) o caminho vem do nome antes, do nome depois, do cabeçalho, ou dos dois", () => {
    expect(pathLies.filter(([s, p]) => delivery(s, p) !== "block")).toEqual([]);
    expect(pathHonest.filter(([s, p]) => delivery(s, p) !== "pass")).toEqual([]);
  });
});

// Terceira revisão do PR #37 (2026-09-28). Cada item: a frase honesta que precisa passar e a
// mentira vizinha que precisa barrar, com a causa no código.
const allowed = (text: string, paymentPath: "cod" | "prepay") => runGates(text, ctx({ paymentPath, regionKnown: false })).allowed;

// 1) O antecipado negado nomeia a entrega como "na entrega" nomeia: a contagem é dela mesmo sem
// palavra de chegada. Antes, "Sem pix, em 5 dias você tem o colete" passava nos dois caminhos — a
// negação dava o caminho, mas a regra da entrega ainda exigia chegada, e "você tem o colete" não
// era chegada. E a posse com "ter" ("você tem o colete", "é todo seu") passa a ser chegada.
const DENIALS = ["Sem pix,", "Sem antecipado,", "Sem pagar antes,", "Nada de pix:", "Nada de cartão, nada de pix:", "Sem boleto,"];
const POSSESSIONS = ["você tem o colete", "você já tem ele", "ele é todo seu", "você tem ele aí", "o colete é seu", "chega", "você está usando ele"];
const deniedOutOfRange: string[] = [];
const deniedInRange: string[] = [];
for (const d of DENIALS)
  for (const p of POSSESSIONS) {
    for (const c of ["em 5 dias", "em até 4 dias", "numa semana", "em dez dias", "em 7 dias"]) deniedOutOfRange.push(`${d} ${c} ${p}.`);
    for (const c of ["em 2 dias", "em até 3 dias", "em um dia"]) deniedInRange.push(`${d} ${c} ${p}.`);
  }
// A sonda negada: a negativa que não nega o nome ("sem juros no pix", "sem pix demorado") fala do
// antecipado, e a posse sem nome nenhum continua prazo.
const notDeniedPossession: string[] = [];
for (const d of ["Sem juros no pix,", "Sem pix demorado,", "Nada de boleto que demora:"])
  for (const p of POSSESSIONS) notDeniedPossession.push(`${d} em 2 dias ${p}.`);
const unnamedPossession = ["Em 5 dias você tem o colete.", "Em 5 dias ele é todo seu.", "Nada de pix. Em 5 dias você tem o colete.", "Vai ser na entrega? Em 5 dias você tem o colete."];

// 2) A garantia seguida da janela da própria entrega, como oração que é só ela: o 7 é a garantia, e
// o número da janela é julgado sozinho. Vetada desde a M-10, que passou a julgar a contagem sem nome
// na entrega com a fala de entrega da oração vizinha.
const warrantyThenCodWindow = [
  "Você tem 7 dias pra devolver, e a entrega leva de 1 a 3 dias.", "Você tem 7 dias pra trocar, e na entrega chega em 1 a 3 dias.",
  "São 7 dias pra trocar ou devolver; a entrega é de 1 a 3 dias.", "Você tem 7 dias pra trocar, e na entrega você recebe em até 3 dias.",
];
// Só o prazo: `warranty_promise` ainda lê o 2 como garantia ("leva" não isenta ali), como na base.
const warrantyThenCodCount = "Você tem 7 dias pra devolver, e a entrega leva 2 dias.";
const warrantyThenCodWindowLies = [
  "Você tem 7 dias pra devolver, e a entrega leva de 1 a 7 dias.", "Você tem 7 dias pra devolver, e a entrega leva 7 dias.",
  "Você tem 7 dias pra devolver, e a entrega também.", "Você tem 7 dias pra devolver, e a entrega leva o mesmo.",
  "Você tem 7 dias pra devolver, e a entrega leva de 1 a 3 dias, e chega junto.", "Você tem 7 dias pra devolver, e a entrega leva de 5 a 7 dias.",
  "Você tem 7 dias pra devolver, e a entrega leva uns 5 dias.",
];

// 3) A garantia e a média do antecipado como sujeito ("a média do antecipado é de 5 dias"): cada
// gate pegava o número da outra oração — `delivery_promise` dava o 7 ao antecipado porque a janela
// só lia "em média N dias", e `warranty_promise` dava o 5 à garantia pelos 40 caracteres em volta.
const warrantyAndAverageSubject = [
  "Você tem 7 dias de garantia, e a média do antecipado é de 5 dias, tá?", "Você tem 7 dias pra trocar, e a média no pix é de 5 dias.",
  "São 7 dias de garantia; a média do antecipado é de 5 dias úteis, viu?",
];
const warrantyAndAverageSubjectLies = [
  "Você tem 7 dias de garantia, e a média do antecipado é de 7 dias.", "Você tem 7 dias de garantia, e a média do antecipado é de 3 dias.",
  "A garantia é de 30 dias, e a média do antecipado é de 5 dias.", "Pode trocar, e em média 30 dias.", "Pode trocar, e no pix em média 30 dias.",
  "A garantia em média é de 30 dias no antecipado.", "Você tem 7 dias de garantia, e a média do antecipado é de 5 dias, e chega junto.",
];

describe("terceira revisão do PR #37: antecipado negado com posse, garantia com a janela ao lado", () => {
  it(`1) ${deniedOutOfRange.length} posses fora da faixa depois do antecipado negado, vetadas nos dois caminhos`, () => {
    expect(deniedOutOfRange.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it(`1) ${deniedInRange.length} posses dentro da faixa depois do antecipado negado passam na entrega`, () => {
    expect(deniedInRange.filter((s) => delivery(s, "cod") !== "pass")).toEqual([]);
  });
  it("1) a negativa que não nega fala do antecipado, e a posse sem nome continua prazo", () => {
    expect(notDeniedPossession.filter((s) => delivery(s, "cod") !== "block")).toEqual([]);
    expect(unnamedPossession.filter((s) => delivery(s, "cod") !== "block" || delivery(s, "prepay") !== "block")).toEqual([]);
  });
  it("2) a garantia com a janela da entrega ao lado passa na entrega; a janela que se amarra ao 7, não", () => {
    expect(warrantyThenCodWindow.filter((s) => !allowed(s, "cod"))).toEqual([]);
    expect(delivery(warrantyThenCodCount, "cod")).toBe("pass");
    expect(warrantyThenCodWindowLies.filter((s) => allowed(s, "cod"))).toEqual([]);
  });
  it("3) garantia e média do antecipado como sujeito passam nos dois caminhos; os números trocados, não", () => {
    expect(warrantyAndAverageSubject.filter((s) => !allowed(s, "cod") || !allowed(s, "prepay"))).toEqual([]);
    expect(warrantyAndAverageSubjectLies.filter((s) => allowed(s, "cod") || allowed(s, "prepay"))).toEqual([]);
  });
});

// 4) Desempenho. Cada regra lê a sentença inteira da contagem, então o custo é contagens × sentença:
// "se trocar 7 dias" repetido até 16k caracteres levava 7 s (o "se …" preguiçoso de `takenAfterReturn`
// revarria a sentença a partir de cada "se"), e perguntas curtas em sequência faziam `headerPath`
// refazer a caminhada a cada contagem. A resposta degenerada volta para ser reescrita antes.
describe("desempenho: a cadeia de gates fica bem abaixo de 100 ms a 16k caracteres", () => {
  const SHAPES = [
    "se trocar 7 dias ", "7 dias pra trocar ", "um dia ", "voce tem 7 dias ", "Em 2 dias? ", "Oi? Em 1 a 3 dias? ",
    "Na entrega? Em 2 dias? ", "e ou tambem 2 dias na entrega ", "? ", "pix? ", "nada de pix, nada de cartao, ",
    // Abaixo do teto de contagens: a caminhada do cabeçalho e o "se …" preguiçoso.
    "Oi? ".repeat(3960) + "Em 2 dias? ".repeat(20), ("se ".repeat(320) + "trocar 7 dias. ").repeat(16),
  ];
  it.each(SHAPES.map((s) => [s.slice(0, 30), s]))("%j repetido até 16k caracteres", (_, unit) => {
    const text = unit.repeat(Math.ceil(16000 / unit.length)).slice(0, 16000);
    for (const p of ["cod", "prepay"] as const) runGates(text, ctx({ paymentPath: p, regionKnown: false }));
    const t0 = performance.now();
    for (const p of ["cod", "prepay"] as const) runGates(text, ctx({ paymentPath: p, regionKnown: false }));
    expect((performance.now() - t0) / 2).toBeLessThan(100);
  });
  it("a resposta degenerada é vetada: contagens demais, ou uma sentença sem fim", () => {
    expect(delivery("Chega em 2 dias. ".repeat(21), "cod")).toBe("block");
    expect(delivery("Chega em 2 dias. ".repeat(20), "cod")).toBe("pass");
    expect(delivery("olha ".repeat(210) + "chega em 2 dias.", "cod")).toBe("block");
    expect(delivery("olha ".repeat(190) + "chega em 2 dias.", "cod")).toBe("pass");
  });
});
