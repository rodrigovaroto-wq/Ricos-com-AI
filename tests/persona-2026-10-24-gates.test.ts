import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asksForTestimonial, runGates, type GateContext } from "@/agent/guardrails.js";
import type { BusinessConfig } from "@/config/business.js";
import { ctx } from "./fixtures.js";

/**
 * Final persona review, 2026-10-24 (grafo §129; R21.6: persona sentences). Each real draft vetoed by a gate that read a true
 * sentence as a lie now passes that gate, and the neighbouring lie stays vetoed. Config: `business.example.json` (prepaid
 * R$ 116,91, delivery kits R$ 233,82 / R$ 311,76, testimonials, 7-day warranty).
 */
const config = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const gates = (text: string, over: Partial<GateContext> = {}) =>
  runGates(text, ctx({ config, ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const COD = { paymentPath: "cod" as const };
const NO_COD = { paymentPath: "prepay" as const, codUnavailable: true };

const passes = (gate: string, cases: readonly string[], over: Partial<GateContext> = COD) =>
  it.each(cases)(`${gate} passa: %s`, (text) => expect(gates(text, over)).not.toContain(gate));
const vetoes = (gate: string, cases: readonly string[], over: Partial<GateContext> = COD) =>
  it.each(cases)(`${gate} veta: %s`, (text) => expect(gates(text, over)).toContain(gate));

const FREE = "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.";

describe("1. shipping_promise: pix e cartão na porta, boleto negado", () => {
  passes("shipping_promise", [
    `Não é o correio nem o carteiro, quem leva é o entregador e você paga direto pra ele na porta, e dá pra pagar no cartão sim.\n\n${FREE}\n\nMe passa seu CEP que eu já vejo como fica aí em BH?`,
    `Não é pelo correio não, viu? Quem leva é o entregador, e ele não cobra nada a mais na porta.\n\n${FREE}\n\nE pode pagar com cartão na porta sim, no dinheiro, no Pix ou no cartão, do jeito que ficar melhor pra você.`,
    `Isso mesmo, R$ 129,90 pagando na entrega!!\n\n${FREE}\n\nVocê paga direto ao entregador quando o colete chegar, no dinheiro, no Pix ou no cartão 😊`,
    `É verdade mesmo, você só paga quando o colete chegar na sua mão, direto ao entregador, no dinheiro, no Pix ou no cartão 😊\n\n${FREE}`,
    `Na lotérica também não consigo, a loja não trabalha com boleto em nenhum caminho.\n\n${FREE}\n\nMe passa seu CEP que eu já vejo como fica a entrega aí na sua região?`,
    `Na lotérica também não consigo, tá? A loja não tem boleto em nenhum caminho, só Pix ou cartão no antecipado.\n\n${FREE}\n\nNo antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91.`,
    `Entendo que você sempre paga assim, mas boleto não tem mesmo, nem na lotérica, só pix ou cartão no antecipado.\n\n${FREE}\n\nNo antecipado o frete é calculado por região no checkout, e o valor aparece pra você no checkout, antes de pagar.`,
    `Pode ser G pras 3 sim!\n\nPagando na entrega o frete é grátis: você paga só R$ 311,76 quando receber.\n\nNo antecipado o frete é calculado por região no checkout. Quer fechar as 3 no pix então?`,
    "No pix o frete não é grátis, ele é calculado por região no checkout e aparece pra você lá dentro, antes de pagar, tá?",
  ]);
  vetoes("shipping_promise", [
    `${FREE} No pix também é grátis.`,
    `${FREE} No pix também.`,
    `${FREE} Na porta também pode pagar no pix.`,
    `${FREE} E no pix na porta é grátis também, no dinheiro ou no cartão.`,
    `${FREE} No pix você paga e o entregador leva na porta.`,
    `${FREE} Dá pra pagar no pix ou no cartão?`,
    `${FREE} Vale pros dois. No antecipado o frete é calculado por região no checkout.`,
    `${FREE} No pix também. No antecipado o frete é calculado por região no checkout.`,
    `${FREE} A loja não tem boleto, só pix ou cartão no antecipado.`,
    `${FREE} Boleto também.`,
    "No pix o frete não é grátis, né? É grátis sim!",
    "Não é frete grátis no pix?",
  ]);
});

describe("2. charge_promise: onde não chega a entrega, a explicação verdadeira", () => {
  passes(
    "charge_promise",
    [
      "Não engana não, é que o pagamento na entrega depende da região e na sua ainda não chega 😊",
      "Entendo, e é justo querer pagar só quando recebe, viu?\n\nAí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado.",
      "Entendo, seria ótimo pagar só quando chegar, né? Aí na sua região a transportadora ainda não tem pagamento na entrega, então por aí vai no antecipado.",
      "Entendo, pagar quando receber seria ótimo, né? Aí na sua região a transportadora ainda não tem pagamento na entrega.",
      "Entendi — você queria pagar só na entrega. Aí no seu CEP ainda não tem pagamento na entrega, por aí vai só no antecipado, que sai com 10% de desconto: R$ 116,91",
      "Entendo você preferir pagar na entrega, aí no seu CEP a transportadora ainda não tem essa opção, vai só no antecipado com 10% de desconto: R$ 116,91.",
      "É justo estranhar, sua colega deve estar onde o pagamento no recebimento já chega, aí na sua região a transportadora ainda não tem pagamento na entrega.",
      "O de R$ 129,90 é pagando na entrega, que aí na sua região a transportadora ainda não tem, então segue no antecipado.",
      "É justo olhar o valor, os R$ 129,90 são de quem paga na entrega, aí pra você no antecipado fica R$ 116,91 com 10% de desconto.",
      "Aí no seu CEP a transportadora ainda não leva com pagamento na entrega, por isso pra você aparece só o antecipado.",
    ],
    NO_COD,
  );
  vetoes(
    "charge_promise",
    [
      "Entendo você querer pagar na entrega, pode sim, é só escolher o dia.",
      "Entendo, e é justo querer pagar só quando recebe, aí dá sim!",
      "Entendo você querer pagar na entrega, que na maioria das regiões chega, mas aí vai só no antecipado.",
      "Não engana não, é que o pagamento na entrega depende da região e na maioria chega 😊",
      "Na maioria das regiões tem o pagamento na entrega sim, e aí você paga na entrega.",
      "O pagamento na entrega depende da região e na sua chega sim.",
      "Os R$ 129,90 são de quem paga na entrega, e você paga na entrega também.",
      "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.",
      "Você paga na entrega, ao entregador.",
    ],
    NO_COD,
  );
});

describe("3. installment_promise: pix ou 12x no antecipado, dividir o kit", () => {
  passes(
    "installment_promise",
    [
      "É isso mesmo, aí no seu CEP não tem pagamento na entrega, vai só no antecipado, no Pix ou em até 12x no cartão.",
      "Aí no seu CEP a entrega é só no antecipado pelos Correios, com Pix ou cartão em até 12x, por isso não consigo deixar pra pagar na chegada.",
      "Aí na sua região a transportadora ainda não tem pagamento na entrega, vai só no antecipado no Pix ou em até 12x no cartão.",
      "No antecipado você ganha *10% de Desconto:* R$ 116,91, no Pix ou em até 12x no cartão.",
      "Quer que eu deixe seu pedido no antecipado, no pix ou no cartão em até 12x?",
      "Lá no checkout você completa o endereço, escolhe o M e paga no Pix ou no cartão em até 12x, tá?",
      "Que amor dividir com sua mãe e sua irmã, dá pra deixar as 3 no G sim 😊",
    ],
    NO_COD,
  );
  vetoes(
    "installment_promise",
    [
      "Na entrega você paga no Pix ou em até 12x no cartão.",
      "Não tem pagamento na entrega aí, mas na entrega dá pra parcelar em 12x.",
      "Na entrega ou no antecipado, dá pra parcelar em até 12x.",
      "No pix ou em até 12x quando o colete chegar.",
      "Dá pra dividir com sua mãe em 3x.",
      "Dá pra dividir em 3 vezes.",
      "Dá pra dividir com seu cartão.",
    ],
    NO_COD,
  );
});

describe("4. delivery_promise: a garantia de 7 dias não é prazo; o dia não garantido", () => {
  for (const over of [COD, NO_COD]) {
    passes(
      "delivery_promise",
      [
        "É justo ter receio com compra na internet, e dependendo da sua região você só paga quando o colete chegar na sua mão, com *7 Dias de Garantia*!!",
        "Provar antes não dá, o entregador não espera, mas você tem *7 Dias de Garantia* após receber pra devolver se não gostar, risco zero pra você!",
        "E fica tranquila que tem *7 Dias de Garantia*, se não gostar você tem 7 dias após o recebimento pra devolver!!",
        "E se não gostar, você tem *7 Dias de Garantia* após o recebimento pra devolver sem custo nenhum, risco zero pra você!",
        "Você tem 7 dias após o recebimento pra trocar ou devolver 💛",
        "A garantia de 7 dias conta depois que o colete chega, pra você provar com o vestido justinho e ver no espelho 😊",
        "Pra festa da sua filha o que conta é ver o vestido assentado, e a garantia é de 7 dias após o recebimento pra provar com calma",
        "Se o entregador passar aí você pode recusar na porta, e se já tiver recebido é só pedir a devolução em até 7 dias após o recebimento.",
        "E você tem 7 dias após receber pra devolver se não amar, pra deixar no seu nome, Vilma Torres é seu nome completo?",
        "Sobre chegar até sábado eu não consigo garantir dia por aqui, quem escolhe o dia é você no checkout, e lá aparece o que tem pra sua região.",
      ],
      over,
    );
  }
  vetoes("delivery_promise", [
    "Chega em *7 dias* 😊",
    "Ele chega em 7 dias, com *7 Dias de Garantia*!!",
    "Tem *7 Dias de Garantia*, e chega em 7 dias.",
    "Pode trocar em 7 dias, quando ele chega.",
    "A garantia de 7 dias conta e chega em 7 dias.",
    "Em 7 dias é seu, pra provar com calma.",
    "Sobre chegar até sábado eu não consigo garantir dia, mas chega no sábado sim.",
    "Chega até sábado sim, quem escolhe o dia é você no checkout.",
  ]);
});

describe("5. size_claim / unverified_size: o maior tamanho da tabela é fato", () => {
  const before = { ...COD, knownSize: null, herWords: "uso 58 de calça" };
  passes("size_claim", [
    "Por aqui o maior que a gente tem é o XGG mesmo, não tenho como mandar um maior nem fazer sob medida.",
    "O maior da nossa grade é o XGG, que veste numeração maior também.",
    "O maior que a gente tem é o XGG, que veste cintura de 92 a 100 cm, vai até o 52 de calça mais ou menos.",
    "A tabela para no 52 de calça, então com 58 ele ia ficar apertado.",
    "O tamanho certo é pela sua cintura, e vai do P ao XGG, que veste até 100cm de cintura, que é até o 52 de calça.",
  ], before);
  vetoes("size_claim", [
    "O maior é o G.",
    "O seu é o XGG, que vai até o 52 de calça.",
    "Com 52 de calça o seu é o XGG.",
    "Você veste até o 46 de calça, então o maior é o XGG.",
  ], before);
  passes("unverified_size", [
    "A maior que a gente tem é o XGG, que veste cintura até 100 cm 😊",
    "O tamanho segue a calça que você veste, a gente tem do P ao XGG pra cobrir bem todos os corpos.",
  ], before);
  vetoes("unverified_size", [
    "Temos do P ao XGG em estoque pra você.",
    "O maior que a gente tem é o XGG, e tem o seu tamanho disponível.",
    "Tem G sim pra você.",
  ], before);
});

describe("6. invented_testimonial: prova e original são pedido de depoimento", () => {
  it.each(["QUERO VER PROVA DE GENTE DE VERDADE PORRA", "EU JA FALEI PORRA QUERO PROVA DE VERDADE", "mas qual a diferença pro da shopee? vi bem mais barato lá", "qual o insta oficial de vcs? tem site?", "é original?"])(
    "pede: %s",
    (m) => expect(asksForTestimonial(m)).toBe(true),
  );
  it.each(["Dá pra provar antes de pagar?", "Quero o M", "Qual o prazo?"])("não pede: %s", (m) => expect(asksForTestimonial(m)).toBe(false));
  it("o depoimento do config, citado quando ela pede prova, passa; sem pedido, continua vetado", () => {
    const text =
      'Se quiser ver alguns depoimentos, é só acessar nosso site encorpa-fashion.com.br e rolar até a seção de depoimentos 😊\n\nOlha o que uma cliente escreveu lá: "Original finalmente! Comprei em outra loja e veio falsificada. Obrigada pelo atendimento"';
    const known = { knownTestimonials: config.testimonials ?? [] };
    expect(gates(text, { ...known, askedTestimonial: asksForTestimonial("QUERO VER PROVA DE GENTE DE VERDADE") })).not.toContain("invented_testimonial");
    expect(gates(text, { ...known, askedTestimonial: asksForTestimonial("quero o M") })).toContain("invented_testimonial");
    expect(gates('Uma cliente escreveu: "Chegou em um dia e emagreci 5 kg"', { ...known, askedTestimonial: true })).toContain("invented_testimonial");
  });
});

describe("7. cep_insist: avisar que o CEP não existe não é insistir", () => {
  const asked = { ...COD, cepAsks: 1 };
  passes("cep_insist", ["Esse CEP não encontrei, me confirma depois? Qual calça você veste?", "Não achei o seu CEP. Qual calça você veste?"], asked);
  vetoes("cep_insist", ["Me passa seu CEP?", "Esse CEP não encontrei. Me passa seu CEP de novo?", "Qual o seu CEP?"], asked);
});

describe("8. falsos negativos fechados: quadril, reserva, apagar dado", () => {
  vetoes("hip_claim", ["Com 48 de calça o seu é o GG, e ele acompanha bem mesmo quando o quadril é maior que a cintura.", "Ele abraça bem com o quadril largo."]);
  passes("hip_claim", ["Ele não acompanha o quadril, só a cintura.", "Ele modela a cintura mesmo quando o quadril é largo."]);
  const agent = { ...COD, layer: "agent" as const };
  vetoes("order_action_claim", [
    "Fechado, Jessica, o seu M já fica reservado pra você conferir lá.",
    "Me conta seu nome completo pra eu deixar seu pedido no G já reservado pra você?",
    "Fica à vontade, Jessica, dá uma olhadinha com calma que o seu M fica lá te esperando.",
    "Beatriz, confirmado, apaguei tudo que você informou aqui e não vou usar pra mais nada.",
    "Seus dados foram apagados.",
    "Vou excluir seu cadastro.",
  ], agent);
  passes("order_action_claim", [
    "Não consigo reservar tamanho por aqui, o estoque é do checkout.",
    "Eu não tenho como apagar seus dados por aqui: escreve pra contato@encorpa-fashion.com.br que eles cuidam disso.",
    "Fico te esperando aqui, qualquer dúvida me chama.",
    "Seu M fica certinho no checkout.",
  ], agent);
});
