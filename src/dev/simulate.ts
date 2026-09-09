/**
 * The conversation range. 100 scenarios, three variations each, run against the real
 * deterministic core — the same guardrail chain, size table, address reader, remedy
 * ladder and rulers that production runs.
 *
 * What it is for: a scenario file is cheap to add and costs nothing to run, so the
 * awkward customer — the one who haggles, asks for a person mid-sale, quotes her shoe
 * size, says stop, or asks something the shop has no answer for — can be fired at the
 * chain a thousand times before she is a real person waiting on WhatsApp.
 *
 * What it is NOT: it does not call a model. Everything here is decided by code, which
 * is exactly what makes it repeatable. The model's own wording is checked separately,
 * by probing the deployed function.
 *
 *   pnpm dev            # run the whole range, print only what failed
 *   pnpm dev --verbose  # print every case
 */
import {
  classifyOptOut,
  remedyFor,
  runGates,
  wantsHuman,
  type GateContext,
} from "../agent/guardrails.js";
import { extractDressSize, sizeFromDressSize, sizeFromLabel } from "../agent/sizing.js";
import { extractAddress, isComplete, nextQuestion } from "../agent/address.js";
import { decideNext } from "../agent/retry.js";
import { decideTouch, renderFollowup, scheduleSilence, type FollowupKind } from "../agent/followups.js";
import { CHATS } from "./chats.js";

const config = {
  prices: { codBrl: 129.9, prepayBrl: 110.41, prepayDiscountPercent: 15, anchorBrl: 216.5 },
  delivery: {
    codDaysMin: 1,
    codDaysMax: 3,
    prepayDaysMin: 5,
    prepayDaysMax: 10,
    warrantyDays: 7,
    freeShipping: true,
  },
  hours: { openHour: 6, closeHour: 24 },
  coupon: { percent: 20, active: false },
  cod: { physicalOnDeliveryActive: true },
  testimonials: ["vesti pra festa e não tirei mais, o vestido caiu diferente"],
};

const DAYTIME = new Date("2026-09-08T18:00:00Z"); // 15:00 in São Paulo
const NIGHT = new Date("2026-09-08T06:00:00Z"); //  03:00 in São Paulo

const gateCtx = (over: Partial<GateContext> = {}): GateContext => ({
  config,
  layer: "agent",
  optedOut: false,
  now: DAYTIME,
  paymentPath: "cod",
  ...over,
});

/**
 * One check. `expected` and `actual` are compared as strings so a failure prints both
 * sides instead of "expected true to be false".
 */
interface Case {
  scenario: string;
  angle: string;
  input: string;
  expected: string;
  actual: string;
}

const cases: Case[] = [];

/** Todo caso da bateria, já executado. É o que o teste consome. */
export const range = (): readonly Case[] => cases;

const check = (scenario: string, angle: string, input: string, expected: string, actual: string) =>
  cases.push({ scenario, angle, input, expected, actual });

/** What the chain does with a message the agent wants to send. */
const outcome = (text: string, over: Partial<GateContext> = {}): string => {
  const gates = runGates(text, gateCtx(over));
  if (gates.allowed) return "envia";
  const blocked = gates.traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  return `barra(${blocked.join("+")})`;
};

/** What the turn does with a customer message, before any model call. */
const intake = (text: string): string => {
  if (classifyOptOut(text) === "explicit") return "opt-out";
  if (classifyOptOut(text) === "ambiguous") return "opt-out?";
  if (wantsHuman(text)) return "handoff";
  return "responde";
};

// ─────────────────────────────────────────────────────────────────────────────
// A. Como a cliente diz o tamanho (1-14)
// ─────────────────────────────────────────────────────────────────────────────
const sizeSays: Array<[string, string, string | null]> = [
  ["número solto", "42", "G"],
  ["de calça", "eu uso 42 de calça", "G"],
  ["de vestido", "visto 46 de vestido", "GG"],
  ["de blusa", "uso blusa 38", "M"],
  ["meu tamanho é", "meu tamanho é 40", "M"],
  ["sou", "sou 48", "GG"],
  ["com hesitação", "acho que uso 44, mais ou menos", "G"],
  ["dois números", "entre 42 e 44", "G"],
  ["negado", "não uso 40, uso 46", "GG"],
  ["idade, não tamanho", "tenho 44 anos, serve pra mim?", null],
  ["peso, não tamanho", "tenho 78 kg", null],
  ["sapato", "calço 38", null],
  ["sapato explícito", "uso 38 de sapato", null],
  ["fora da faixa", "uso 60 de calça", null],
];
for (const [angle, input, esperado] of sizeSays) {
  const n = extractDressSize(input);
  const got = n === null ? null : sizeFromDressSize(n);
  check("tamanho pela fala da cliente", angle, input, String(esperado), String(got));
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Tamanho por letra (15-20) — ela diz "uso M", não um número
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, label, esperado] of [
  ["letra nossa", "M", "M"],
  ["letra grande", "GG", "GG"],
  ["padrão americano", "L", "G"],
  ["padrão americano grande", "XL", "GG"],
  ["dois X", "XXL", "XGG"],
  ["não é tamanho", "banana", null],
] as Array<[string, string, string | null]>) {
  check("tamanho por letra", angle, `uso ${label}`, String(esperado), String(sizeFromLabel(label)));
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Pechincha e preço (21-32)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["recusa honesta de %", "Não consigo oferecer 30% de desconto.", "envia"],
  ["recusa honesta de valor", "Não é R$ 99,90, o valor é R$ 129,90.", "envia"],
  ["preço do COD", "Fica R$ 129,90 com frete incluído.", "envia"],
  ["preço antecipado", "No antecipado sai R$ 110,41, com 15% de desconto.", "envia"],
  ["âncora publicada", "De R$ 216,50 por R$ 129,90 — 40% off.", "envia"],
  ["economia", "A economia é de R$ 19,49.", "envia"],
  ["promete % inexistente", "Consigo 30% de desconto pra você!", "barra(price_promise)"],
  ["promete valor inexistente", "Hoje sai por R$ 99,90.", "barra(price_promise)"],
  ["oferta sem a palavra desconto", "Te dou 30% agora se fechar.", "barra(price_promise)"],
  ["porcentagem por extenso", "Te dou 30 por cento de desconto.", "barra(price_promise)"],
  ["valor em reais por extenso", "Fica só 200 reais.", "barra(price_promise)"],
  ["'sem juros' não é negação", "Sem juros e sem taxa, sai por R$ 59,90.", "barra(price_promise)"],
] as Array<[string, string, string]>) {
  check("preço e desconto", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Composição e ficha técnica (33-36) — % que não é desconto
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply] of [
  ["tecido", "O tecido é 92% poliamida e 8% elastano."],
  ["tecido junto de desconto real", "No antecipado são 15% de desconto, e o tecido é 92% poliamida."],
  ["garantia em %", "100% de garantia: 7 dias pra trocar."],
  ["algodão", "A faixa interna é 100% algodão."],
] as Array<[string, string]>) {
  check("ficha técnica não é oferta", angle, reply, "envia", outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// E. Prazo de entrega (37-46)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, ctx, esperado] of [
  ["janela correta", "Chega em 1 a 3 dias, com entrega agendada.", {}, "envia"],
  ["recusa amanhã", "Não consigo entregar amanhã: a entrega leva de 1 a 3 dias.", {}, "envia"],
  ["promete amanhã", "Você recebe amanhã!", {}, "barra(delivery_promise)"],
  ["promete hoje", "Chega hoje mesmo.", {}, "barra(delivery_promise)"],
  ["'sem esperar' não é negação", "Sem esperar muito, chega amanhã.", {}, "barra(delivery_promise)"],
  ["janela larga demais", "Chega em 7 a 14 dias.", {}, "barra(delivery_promise)"],
  ["entrega com a janela do antecipado", "Chega em 5 a 10 dias.", {}, "barra(delivery_promise)"],
  ["véspera na logística", "Sua entrega está marcada pra amanhã 💛", { stage: "logistics" as const }, "envia"],
  ["véspera na pré-venda", "Sua entrega está marcada pra amanhã 💛", { stage: "presale" as const }, "barra(delivery_promise)"],
  ["antecipado dentro da janela dele", "No antecipado chega em 5 a 10 dias úteis.", { paymentPath: "prepay" as const }, "envia"],
  ["antecipado com a janela da entrega", "No antecipado chega em 1 a 3 dias.", { paymentPath: "prepay" as const }, "barra(delivery_promise)"],
] as Array<[string, string, Partial<GateContext>, string]>) {
  check("prazo", angle, reply, esperado, outcome(reply, ctx));
}

// ─────────────────────────────────────────────────────────────────────────────
// F. Emagrecimento — a promessa que a marca não faz (47-53)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["a verdade que vende", "O colete não muda o seu corpo. Muda como a roupa cai nele.", "envia"],
  ["nega emagrecer", "Ele não emagrece — ele modela enquanto você usa.", "envia"],
  ["nega em cadeia", "Ele não emagrece nem elimina gordura.", "envia"],
  ["sem promessa", "Sem promessa de emagrecimento: o efeito acaba quando você tira.", "envia"],
  ["promete emagrecer", "Ele emagrece 5 kg em uma semana.", "barra(weight_loss_claim)"],
  ["promete queimar gordura", "Ele queima gordura localizada.", "barra(weight_loss_claim)"],
  ["negação que não alcança", "Não precisa de academia: ele emagrece você rápido.", "barra(weight_loss_claim)"],
] as Array<[string, string, string]>) {
  check("emagrecimento", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// G. Identidade — "você é um robô?" (54-58)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["a resposta que o prompt exige", "Não sou uma pessoa, sou a assistente virtual da Encorpa.", "envia"],
  ["assistente virtual", "Sou a assistente virtual da marca, posso chamar alguém do time.", "envia"],
  ["afirma ser gente", "Pode ficar tranquila, sou uma pessoa de verdade.", "barra(humanity_claim)"],
  ["nega ser robô", "Não sou um robô, viu?", "barra(humanity_claim)"],
  ["afirma ser humana", "Sou humana sim!", "barra(humanity_claim)"],
] as Array<[string, string, string]>) {
  check("identidade", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// H. Cupom (59-62)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["recusa honesta", "Não temos cupom no momento.", "envia"],
  ["não tem cupom, mas tem desconto", "Não temos cupom, o desconto do antecipado é 15%.", "envia"],
  ["anuncia cupom", "Tenho um cupom de 20% pra você.", "barra(price_promise+coupon_exists)"],
  ["cupom sem número", "Vou te mandar um cupom especial.", "barra(coupon_exists)"],
] as Array<[string, string, string]>) {
  check("cupom", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// I. Depoimento (63-66)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["repete a pergunta dela", 'Você perguntou "qual tamanho eu peço?" — me diz o de calça.', "envia"],
  ["cita depoimento inventado", 'Uma cliente me disse: "mudou minha vida, perdi 10 cm".', "barra(invented_testimonial)"],
  ["atribui a ela mesma", 'Ela contou: "não tiro mais, uso todo dia agora".', "barra(invented_testimonial)"],
  ["aspas curtas não contam", 'É o modelo "colete".', "envia"],
] as Array<[string, string, string]>) {
  check("depoimento", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// J. Pagamento na entrega (67-69)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, cod, esperado] of [
  ["COD ligado", "Você paga na entrega, direto pro entregador.", true, "envia"],
  ["COD ligado, não paga agora", "Você não paga nada agora.", true, "envia"],
  ["COD desligado", "Você paga na entrega, direto pro entregador.", false, "barra(charge_promise)"],
] as Array<[string, string, boolean, string]>) {
  const ctx = { config: { ...config, cod: { physicalOnDeliveryActive: cod } } };
  check("pagamento na porta", angle, reply, esperado, outcome(reply, ctx));
}

// ─────────────────────────────────────────────────────────────────────────────
// K. Opt-out e pedido de humano — o que a cliente escreve (70-84)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, input, esperado] of [
  ["opt-out claro", "não quero mais receber nada", "opt-out"],
  ["opt-out por imperativo", "pode parar de me mandar mensagem", "opt-out"],
  ["opt-out lista", "me tira da lista", "opt-out"],
  ["opt-out descadastrar", "quero me descadastrar", "opt-out"],
  ["'parar' sozinho é ambíguo", "parar", "opt-out?"],
  ["parar não é opt-out aqui", "tem como parar a dor nas costas?", "responde"],
  ["cancelar pedido não é opt-out", "quero cancelar meu pedido", "responde"],
  ["quer pessoa", "quero falar com uma pessoa", "handoff"],
  // A agente já é atendente: pedir atendente é descrever o que a cliente está fazendo.
  ["quer atendente não é pedir humano", "quero falar com um atendente", "responde"],
  ["abre a conversa pedindo atendimento", "olá, gostaria de falar com um atendente", "responde"],
  ["tem alguém aí pergunta se há alguém ouvindo", "tem alguém aí?", "responde"],
  // A frase exata "atendimento humano" está na lista; embutida numa pergunta, não está —
  // e é aí que a regra de frase exata cobra o preço dela, de propósito.
  ["atendimento humano exato", "atendimento humano", "handoff"],
  ["atendimento humano dentro de uma frase", "vocês têm atendimento humano?", "responde"],
  ["recusa o robô", "não quero falar com robô", "handoff"],
  ["transfere", "me passa pra um humano", "handoff"],
  ["recusa a pessoa", "não quero falar com uma pessoa agora", "responde"],
  ["pessoa é o assunto", "tem uma pessoa que usa e amou?", "responde"],
  ["pergunta se é robô", "você é um robô?", "responde"],
] as Array<[string, string, string]>) {
  check("intenção da cliente", angle, input, esperado, intake(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// L. Endereço (85-92)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, input, esperado] of [
  ["completo", "Rua das Flores 123, bairro Centro, Campinas/SP, CEP 13010-100", "completo"],
  ["só o CEP com a rua", "Rua das Flores, 13010-100", "falta:number"],
  ["sem bairro", "Rua das Flores 123, Campinas/SP, CEP 13010-100", "falta:neighborhood"],
  ["CEP repetido é placeholder", "Rua das Flores 123, bairro Centro, Campinas/SP, CEP 00000-000", "falta:cep"],
  ["sem número da casa", "Rua das Flores, bairro Centro, Campinas/SP, CEP 13010-100", "falta:number"],
  ["sem nada", "moro em Campinas", "falta:cep"],
  ["com complemento", "Av. Brasil 45 apto 3, bairro Centro, Campinas-SP, 13010100", "completo"],
  ["rural sem número", "Rodovia SP-101 s/n, bairro Zona Rural, Campinas/SP, 13010-100", "completo"],
] as Array<[string, string, string]>) {
  const r = extractAddress(input);
  const got = isComplete(r.fields) ? "completo" : `falta:${r.missing[0]}`;
  check("endereço", angle, input, esperado, got);

  // O que falta tem de virar exatamente uma pergunta — senão o laço de coleta trava
  // com o endereço incompleto e ninguém pede a peça que falta.
  const pergunta = nextQuestion(r.missing);
  check(
    "endereço",
    `${angle} — vira pergunta`,
    input,
    isComplete(r.fields) ? "sem pergunta" : "pergunta",
    pergunta === null ? "sem pergunta" : "pergunta",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M. Horário e adiamento (93-96)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, now, layer, esperado] of [
  ["de dia, resposta normal", "Fica R$ 129,90 na entrega.", DAYTIME, "agent" as const, "envia"],
  ["de madrugada, resposta normal", "Fica R$ 129,90 na entrega.", NIGHT, "agent" as const, "barra(business_hours)"],
  ["de madrugada, recibo automático", "Recebemos sua mensagem!", NIGHT, "auto" as const, "envia"],
  ["de madrugada com erro de conteúdo", "Hoje sai por R$ 99,90.", NIGHT, "agent" as const, "barra(price_promise+business_hours)"],
] as Array<[string, string, Date, "agent" | "auto", string]>) {
  check("janela de envio", angle, reply, esperado, outcome(reply, { now, layer }));
}

// A precedência: conteúdo errado se corrige ANTES de adiar, senão o texto errado é
// guardado, re-checado ao amanhecer, barrado de novo e cancelado em silêncio.
{
  const gates = runGates("Hoje sai por R$ 99,90.", gateCtx({ now: NIGHT }));
  check("janela de envio", "remédio quando preço e hora barram juntos", "R$ 99,90 às 03:00", "rewrite", String(remedyFor(gates)));
}

// ─────────────────────────────────────────────────────────────────────────────
// N. O que o turno faz depois do veto (97-102)
// ─────────────────────────────────────────────────────────────────────────────
const turn = (remedy: "rewrite" | "defer" | "stop" | null, used: number, spent: number) =>
  decideNext({ remedy, rewritesUsed: used, spentBrl: spent, ceilingBrl: 1, reasons: ["x"], vetoedText: "y" }).kind;
for (const [angle, got, esperado] of [
  ["nada barrou", turn(null, 0, 0), "send"],
  ["primeira reescrita", turn("rewrite", 0, 0), "rewrite"],
  // Uma reescrita só, e o fim dela não é handoff: a cliente recebe a resposta de saída e
  // a conversa continua com a agente. Handoff ficou para o que não é questão de redação.
  ["esgotou a reescrita", turn("rewrite", 1, 0), "fallback"],
  ["esgotou de novo", turn("rewrite", 2, 0), "fallback"],
  ["sem orçamento pra reescrever", turn("rewrite", 0, 1.5), "handoff"],
  ["opt-out nunca reescreve", turn("stop", 0, 0), "stop"],
  ["hora errada adia", turn("defer", 0, 0), "defer"],
] as Array<[string, string, string]>) {
  check("depois do veto", angle, "-", esperado, got);
}

// ─────────────────────────────────────────────────────────────────────────────
// O. As réguas (103-110)
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, kind, remedy, esperado] of [
  ["toque liberado", "silence_1", null, "send"],
  ["toque barrado pelo relógio", "silence_1", "defer", "postpone+reancora"],
  ["toque barrado por conteúdo", "silence_1", "rewrite", "cancel"],
  ["pós-pedido barrado pelo relógio", "order_eve", "defer", "postpone"],
  ["resposta adiada barrada pelo relógio", "deferred_reply", "defer", "postpone"],
  ["opt-out cancela o toque", "silence_2", "stop", "cancel"],
] as Array<[string, FollowupKind, "rewrite" | "defer" | "stop" | null, string]>) {
  const a = decideTouch(kind, remedy);
  const got = a.do === "postpone" ? (a.restartRuler ? "postpone+reancora" : "postpone") : a.do;
  check("régua barrada", angle, `${kind}/${remedy}`, esperado, got);
}

// Toda a copy das réguas tem de passar na própria cadeia — senão o cron gera mensagem
// que ele mesmo recusa, e a cliente fica sem o toque.
for (const kind of ["silence_1", "silence_2", "order_confirmed", "order_shipped", "order_eve", "order_delivered"] as FollowupKind[]) {
  for (const stopPoint of ["before_size", "after_price", "link_sent"] as const) {
    const text = renderFollowup(kind, { leadId: `lead-${stopPoint}`, config, stopPoint, size: "G" });
    if (text === null) continue;
    const got = outcome(text, { stage: kind.startsWith("order_") ? "logistics" : "presale" });
    check("copy da régua passa na cadeia", `${kind}/${stopPoint}`, text.slice(0, 48), "envia", got);
    if (kind !== "silence_1") break;
  }
}

// A régua de silêncio nunca pode marcar dois toques colados: repetir é o que derruba o número.
{
  const [um, dois, tres] = scheduleSilence(new Date("2026-09-08T12:00:00Z"));
  const h = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
  check("espaçamento da régua", "toque 1 → 2", "-", "≥ 6h", h(um!.runAt, dois!.runAt) >= 6 ? "≥ 6h" : `${h(um!.runAt, dois!.runAt).toFixed(1)}h`);
  check("espaçamento da régua", "toque 2 → 3", "-", "≥ 6h", h(dois!.runAt, tres!.runAt) >= 6 ? "≥ 6h" : `${h(dois!.runAt, tres!.runAt).toFixed(1)}h`);
}

// ─────────────────────────────────────────────────────────────────────────────
// P. Fora do escopo — o que a loja não vende, não sabe e não pode prometer
//
// A expectativa aqui é o que a operação **precisa** que aconteça, não o que a cadeia
// faz hoje. Um caso que falha nesta seção é uma lacuna de guardrail, não um bug de
// código — e é exatamente o que esta bateria existe para encontrar.
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["cura dor nas costas", "Ele corrige a sua postura e cura a dor nas costas.", "barra(health_claim)"],
  ["trata problema de saúde", "Ajuda a tratar hérnia de disco e melhora a circulação.", "barra(health_claim)"],
  ["indicação pós-cirúrgica", "É indicado para pós-operatório de cirurgia plástica.", "barra(health_claim)"],
  ["fala de postura sem prometer cura", "Muita cliente conta que se sente mais ereta usando.", "envia"],
  // Os dois casos abaixo eram vetos até 2026-09-09, quando o frete foi zerado na oferta
  // da entrega e o antecipado se confirmou grátis nacional. A frase virou verdade, e
  // agora quem mente é quem cobra frete dela.
  ["frete grátis no antecipado", "No antecipado o frete é grátis também.", "envia"],
  ["frete grátis genérico", "O frete é por nossa conta em qualquer forma de pagamento.", "envia"],
  ["cobrar frete que não existe", "São R$ 129,90 mais o frete.", "barra(shipping_promise)"],
  ["frete à parte", "O frete é calculado à parte no checkout.", "barra(shipping_promise)"],
  ["valor de frete atribuído", "O frete fica R$ 129,90.", "barra(shipping_promise)"],
  ["frete incluído no COD é verdade", "No pagamento na entrega o frete já está incluído.", "envia"],
  ["troca sem prazo", "Você troca quantas vezes quiser, sem prazo nenhum.", "barra(warranty_promise)"],
  ["garantia maior que a real", "Você tem 30 dias para devolver.", "barra(warranty_promise)"],
  ["garantia correta", "Você tem 7 dias para trocar ou devolver.", "envia"],
  ["parcelamento inventado", "Dá pra parcelar em 3x sem juros.", "barra(installment_promise)"],
  ["pix com desconto extra", "Se pagar no pix eu tiro mais um pouquinho.", "barra(price_promise)"],
  ["loja física", "Pode retirar na nossa loja em São Paulo.", "barra(unavailable_offer)"],
  ["outro produto", "Também temos calcinha modeladora.", "barra(unavailable_offer)"],
  ["estoque inventado", "Só restam 3 unidades no estoque!", "barra(scarcity_claim)"],
  ["urgência falsa", "A promoção acaba em 10 minutos.", "barra(scarcity_claim)"],
] as Array<[string, string, string]>) {
  check("fora do escopo", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// Q. As conversas — 100 roteiros × 3 variações de escrita real
//
// Cada variação é um chat: a mensagem entra, o turno decide o que fazer com ela antes
// de gastar qualquer chamada de modelo, e o tamanho que ela declarou (se declarou) tem
// de terminar certo. Escrita como a cliente escreve — minúscula, sem acento, com erro
// de digitação — porque é assim que a mensagem chega.
// ─────────────────────────────────────────────────────────────────────────────
for (const chat of CHATS) {
  for (const [i, message] of chat.variants.entries()) {
    check("conversa: tratamento", `${chat.name} #${i + 1}`, message, chat.handling, intake(message));
    if (chat.size !== undefined) {
      const n = extractDressSize(message);
      check(
        "conversa: tamanho gravado",
        `${chat.name} #${i + 1}`,
        message,
        String(chat.size),
        String(n === null ? null : sizeFromDressSize(n)),
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// R. A copy persuasiva passa na própria cadeia
//
// A régua fala de espelho, de vestido parado no armário e de promessa que já quebraram
// com ela. É a copy que converte, e é também a que chega mais perto dos gates de
// emagrecimento e de saúde — se o cron gerar uma frase que ele mesmo recusa, a cliente
// simplesmente não recebe o toque.
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply, esperado] of [
  ["espelho, sem prometer corpo", "Você recebe, veste com a sua roupa, se olha no espelho — e só então decide.", "envia"],
  ["a roupa parada no armário", "Pensa naquela roupa que está parada no armário esperando um dia bom.", "envia"],
  ["honestidade como argumento", "O colete não muda o seu corpo, ele muda como a roupa cai enquanto você usa.", "envia"],
  ["a cena concreta", "É o vestido que você já tem, caindo do jeito que você queria.", "envia"],
  ["urgência verdadeira do COD", "Adiar não protege o seu bolso: você só paga quando receber.", "envia"],
  ["mas prometer corpo continua barrado", "Você vai emagrecer e finalmente se amar no espelho.", "barra(weight_loss_claim)"],
  ["e apontar defeito com promessa de cura", "Ele corrige a sua postura e resolve a sua barriga.", "barra(health_claim)"],
] as Array<[string, string, string]>) {
  check("copy persuasiva", angle, reply, esperado, outcome(reply));
}

// ─────────────────────────────────────────────────────────────────────────────
// T. As técnicas de venda que ela pode usar à vontade
//
// Nada aqui é exceção aberta na cadeia: são as ferramentas que já passavam e que o
// prompt agora manda usar. O teste existe para que uma mudança futura de gate não as
// feche sem ninguém perceber — perder a ancoragem ou o fechamento por escolha é perder
// conversão, e isso não pode acontecer em silêncio.
// ─────────────────────────────────────────────────────────────────────────────
for (const [angle, reply] of [
  ["ancoragem no preço cheio publicado", "De R$ 216,50 por R$ 129,90 — e o frete já está incluído."],
  ["reversão de risco", "Você não paga nada agora e tem 7 dias pra devolver se não gostar."],
  ["antecipar a objeção", "Você deve estar pensando que não vai servir. Por isso você só paga depois de vestir."],
  ["fechamento por escolha", "Prefere pagar na entrega ou antecipado, com 15% de desconto?"],
  ["espelhar a palavra dela", "Pra segurar a barriguinha no vestido, o G é o que eu indico."],
  ["prova social sem citar ninguém", "É o que mais ouço de quem já recebeu: a roupa cai diferente."],
  ["urgência verdadeira do COD", "Adiar não protege o seu bolso — você só paga quando receber."],
  ["três parágrafos, quando o momento pede", "Entendo a dúvida.\n\nO colete não muda o seu corpo: ele muda como a roupa cai, enquanto você usa.\n\nE você decide depois de vestir. Prefere na entrega ou antecipado?"],
] as Array<[string, string]>) {
  check("técnica de venda liberada", angle, reply, "envia", outcome(reply));
}

// Prova social por citação: bloqueada enquanto não houver depoimento real, liberada
// quando houver — palavra por palavra, e só o que está na lista.
{
  const real = config.testimonials![0]!;
  check(
    "prova social",
    "cita depoimento real declarado",
    real,
    "envia",
    outcome(`Uma cliente me disse: "${real}"`, { knownTestimonials: config.testimonials }),
  );
  check(
    "prova social",
    "inventa outro depoimento",
    "-",
    "barra(invented_testimonial)",
    outcome('Uma cliente me disse: "perdi 10 cm em uma semana"', { knownTestimonials: config.testimonials }),
  );
  check(
    "prova social",
    "sem lista declarada, toda citação é invenção",
    "-",
    "barra(invented_testimonial)",
    outcome(`Uma cliente me disse: "${real}"`),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// S. Escassez: verdadeira passa, inventada não
// ─────────────────────────────────────────────────────────────────────────────
{
  const semEscassez = config;
  const comEstoque = { ...config, scarcity: { unitsLeft: 3 } };
  const comPrazo = { ...config, scarcity: { offerEndsAt: "2026-09-30T00:00:00Z" } };
  const prazoVencido = { ...config, scarcity: { offerEndsAt: "2026-01-01T00:00:00Z" } };

  for (const [angle, reply, cfg, esperado] of [
    ["sem nada declarado, estoque é invenção", "Só restam 3 unidades!", semEscassez, "barra(scarcity_claim)"],
    ["com o estoque declarado, é fato", "Só restam 3 unidades!", comEstoque, "envia"],
    ["mas não um número diferente do declarado", "Só restam 2 unidades!", comEstoque, "barra(scarcity_claim)"],
    ["sem prazo declarado, contagem é invenção", "A promoção acaba hoje!", semEscassez, "barra(scarcity_claim)"],
    ["com prazo declarado e aberto, é fato", "A promoção acaba em breve, viu?", comPrazo, "envia"],
    ["com prazo já vencido, volta a ser invenção", "A promoção acaba em breve, viu?", prazoVencido, "barra(scarcity_claim)"],
    ["contagem regressiva nunca passa", "Corre que acaba em 10 minutos!", comPrazo, "barra(scarcity_claim)"],
  ] as Array<[string, string, typeof config, string]>) {
    check("escassez", angle, reply, esperado, outcome(reply, { config: cfg }));
  }

  // A chave do operador: com ela ligada, a cadeia para de recusar urgência que não
  // consegue verificar. Decisão dele, registrada em código e em teste.
  const liberado = { ...config, scarcity: { allowUnverified: true } };
  for (const [angle, reply] of [
    ["estoque sem contagem por trás", "Corre que estão acabando as últimas peças do lote!"],
    ["número improvisado", "Só restam 4 unidades!"],
    ["prazo sem data declarada", "A promoção acaba hoje, viu?"],
  ] as Array<[string, string]>) {
    check("escassez liberada pelo operador", angle, reply, "envia", outcome(reply, { config: liberado }));
  }

  // E o que a chave NÃO libera: ela abre a urgência, não o resto da cadeia.
  for (const [angle, reply, esperado] of [
    ["preço inventado continua barrado", "Últimas peças por R$ 59,90!", "barra(price_promise)"],
    ["emagrecimento continua barrado", "Últimas peças! Ele emagrece 5 kg.", "barra(weight_loss_claim)"],
    ["cupom inventado continua barrado", "Últimas unidades, use o cupom de 20%!", "barra(price_promise+coupon_exists)"],
  ] as Array<[string, string, string]>) {
    check("escassez liberada pelo operador", angle, reply, esperado, outcome(reply, { config: liberado }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório
// ─────────────────────────────────────────────────────────────────────────────
const verbose = process.argv.includes("--verbose");
const asCli = process.argv[1]?.includes("simulate");

const failed = cases.filter((c) => c.expected !== c.actual);
const byScenario = new Map<string, { total: number; bad: number }>();
for (const c of cases) {
  const s = byScenario.get(c.scenario) ?? { total: 0, bad: 0 };
  s.total += 1;
  if (c.expected !== c.actual) s.bad += 1;
  byScenario.set(c.scenario, s);
}

if (!asCli) {
  // importado por um teste: sem relatório, o vitest cuida disso.
} else {
console.log(`\n${cases.length} casos em ${byScenario.size} cenários\n`);
for (const [scenario, s] of byScenario) {
  console.log(`${s.bad === 0 ? "✓" : "✗"} ${scenario.padEnd(36)} ${s.total - s.bad}/${s.total}`);
}

if (verbose) {
  console.log("");
  for (const c of cases) {
    console.log(`${c.expected === c.actual ? "✓" : "✗"} [${c.scenario}] ${c.angle}: ${c.actual}`);
  }
}

if (failed.length > 0) {
  console.log(`\n${failed.length} divergência(s):\n`);
  for (const c of failed) {
    console.log(`✗ [${c.scenario}] ${c.angle}`);
    console.log(`    entrada:  ${c.input}`);
    console.log(`    esperado: ${c.expected}`);
    console.log(`    obtido:   ${c.actual}\n`);
  }
  process.exitCode = 1;
} else {
  console.log(`\n✓ ${cases.length}/${cases.length}\n`);
}
}
