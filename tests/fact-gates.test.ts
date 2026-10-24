import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

/**
 * E1.5 — the product facts that cause returns. Two lies passed every gate in production
 * (2026-10-07/08): the vest "modela cintura e quadril" (it covers abdomen and back, never the hip),
 * and "toca sim" to "ele toca campainha?" (how the courier behaves, the agent does not know).
 * Each gate is probed both ways (memory `negation-blindness`): the denied claim passes, and a
 * negative that does not deny the claim does not excuse it.
 */
const verdict = (gate: string, text: string) =>
  runGates(text, ctx()).traces.find((t) => t.gate === gate)?.verdict;

describe("hip_claim: o colete não modela quadril nem bumbum", () => {
  it("veta a frase de produção e as variações", () => {
    for (const frase of [
      "Com 42 o seu é o G… e ele acompanha bem essa diferença porque modela cintura e quadril juntinhos",
      "Ele modela o quadril também.",
      "Ele pega o quadril e a barriga.",
      "O colete acompanha o quadril direitinho.",
      "Ele levanta o bumbum.",
      "Ele empina o bumbum e afina a cintura.",
      "Pega bem na cintura e no quadril.",
      "O bumbum fica empinado.",
      // Decision: "acompanha o quadril" asserts the vest reaches the hip, which it does not.
      "O tecido elástico acompanha o quadril sem marcar.",
      // A negative that does not deny the claim.
      "Não se preocupe, ele modela o quadril.",
      "Não, ele pega o quadril sim.",
      "Ele não só modela a cintura e o quadril, também segura a postura.",
      "Sem apertar, ele levanta o bumbum.",
    ]) {
      expect(verdict("hip_claim", frase), frase).toBe("block");
    }
  });

  it("deixa passar a negação e a menção honesta", () => {
    for (const frase of [
      "Ele não modela o quadril, só cintura e costas.",
      "Ele não pega o quadril nem o bumbum.",
      "Quadril ele não modela, só cintura e costas.",
      "Pra medida do quadril, olha a cintura.",
      "Ele pega o abdômen e as costas por completo, o quadril fica de fora.",
      "Não modela quadril nem bumbum.",
      "Ele modela a cintura e deixa o quadril livre.",
      "Ele nunca vai até o quadril.",
      "Ele não deixa o bumbum empinado: é pra cintura.",
      "Você quer saber se ele modela o quadril?",
    ]) {
      expect(verdict("hip_claim", frase), frase).toBe("pass");
    }
  });
});

describe("courier_claim: como o entregador age, a agente não sabe", () => {
  it("veta a frase de produção e as variações", () => {
    for (const frase of [
      "Aceita pix sim, e toca sim",
      "Toca, sim!",
      "Sim, toca.",
      "Ele toca a campainha, pode ficar tranquila.",
      "O entregador liga antes de chegar.",
      "Ele avisa antes de chegar.",
      "Ele te liga antes, fica tranquila.",
      "A entrega é de manhã.",
      "Ele passa à tarde.",
      "Chega entre 8 e 18h.",
      "O entregador avisa sim, tá?",
      // A negative that does not deny the claim.
      "Não sei, mas ele toca a campainha.",
      "Não precisa ficar na porta esperando que ele toca o interfone.",
      "Não se preocupe, o entregador liga antes.",
      "Toca sim, quer o link?",
    ]) {
      expect(verdict("courier_claim", frase), frase).toBe("block");
    }
  });

  it("deixa passar o que ela sabe e a negação", () => {
    for (const frase of [
      "Como o entregador age eu não sei, mas a entrega é no seu endereço.",
      "Não sei se ele toca a campainha.",
      "Não consigo te garantir se ele liga antes.",
      "A entrega é no seu endereço.",
      "No checkout você escolhe o dia.",
      "Se ninguém estiver em casa, o entregador leva o pedido de volta.",
      "Me avisa antes se quiser trocar o tamanho.",
      "A gente te avisa antes da entrega.",
      "Chega em 3 a 5 dias úteis.",
      "Chega entre 3 e 5 dias.",
      "Ele não liga antes, então escolhe um dia que você está em casa.",
      "Você perguntou se ele toca a campainha?",
      "A mensagem chega de manhã?",
      "Se ele toca a campainha ou liga antes, isso eu não sei.",
    ]) {
      expect(verdict("courier_claim", frase), frase).toBe("pass");
    }
  });
});

describe("weight_loss_claim: afinar de vez é promessa de corpo", () => {
  it("veta o afinar permanente", () => {
    for (const frase of [
      "Ele afina a cintura de vez.",
      "Com ele você vai afinar.",
      "Afina definitivamente.",
      "Afina a cintura pra sempre.",
    ]) {
      expect(verdict("weight_loss_claim", frase), frase).toBe("block");
    }
  });

  it("deixa passar o afinar enquanto veste e a negação", () => {
    for (const frase of [
      "Ele afina a cintura enquanto você está com ele.",
      "Ele não afina de vez: modela enquanto está vestido.",
      "Afina na hora, e de vez em quando ela ajusta as alças.",
      "Você não vai afinar com ele, ele modela enquanto veste.",
    ]) {
      expect(verdict("weight_loss_claim", frase), frase).toBe("pass");
    }
  });
});

describe("/code-review da E1 — negação de outro verbo e lista com vírgula", () => {
  const vetoed = (text: string) => runGates(text, ctx({ config })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  // The comma list ("modela a cintura, o quadril e a barriga") stays a residual: the comma also ends the honest
  // "Ele modela a barriga, o quadril não", which a comma-aware GAP vetoed (second review, grafo §74).
  it.each(["Ele não aperta e modela o quadril"])(
    "veta: %s",
    (frase) => expect(vetoed(frase)).toContain("hip_claim"),
  );
  it.each(["Ele não pega o quadril e nem o bumbum.", "Não garanto que ele toca a campainha.", "Ele modela a cintura e a barriga, o quadril não.", "Ele modela a barriga, o quadril não.", "Ele pega a cintura, o quadril fica de fora", "Não acho que ele modela o quadril", "Não diria que ele pega o quadril"])(
    "passa: %s",
    (frase) => expect(vetoed(frase).filter((g) => g === "hip_claim" || g === "courier_claim")).toEqual([]),
  );
});

describe("operational_claim: boleto, horário da entrega e o correio no pagamento na entrega (2026-10-24)", () => {
  it("veta as três mentiras e as variações", () => {
    for (const frase of [
      "Você pode pagar no boleto, sem problema.",
      "Aceitamos boleto também!",
      "Dá pra pagar no pix, no cartão ou no boleto.",
      "Fica no boleto bancário e você paga na agência.",
      "Você escolhe o dia e o horário no checkout.",
      "O horário você escolhe no checkout 😊",
      "Dá pra marcar o horário da entrega direto no link.",
      "Chega no horário que você preferir.",
      "Você escolhe se quer receber de manhã ou à tarde.",
      "Quem leva é o carteiro, e você paga na hora.",
      "No pagamento na entrega, o pedido vem pelos Correios.",
      "Os Correios levam até aí e você paga ao entregador.",
      "Na entrega ou no boleto, chega em 1 a 3 dias.",
      "Quem leva é o carteiro e você paga no Pix ou no cartão na hora.",
      "No pagamento na entrega quem leva são os Correios e você paga no pix.",
      "Os Correios entregam e você paga na porta.",
      "Você paga no ato da entrega e quem leva são os Correios.",
    ]) {
      expect(verdict("operational_claim", frase), frase).toBe("block");
    }
  });

  it("deixa passar a verdade, a negação e a pergunta", () => {
    for (const frase of [
      "No antecipado é só pix ou cartão: boleto não tem.",
      "Não temos boleto, só pix ou cartão.",
      "Sem boleto, tá? O antecipado é no pix ou no cartão.",
      "Você pretende pagar no boleto? Aqui é só pix ou cartão.",
      "Você escolhe o dia no checkout; o horário não dá pra escolher, chega ao longo do dia.",
      "O horário não se escolhe, mas o dia sim.",
      "Você não escolhe o horário da entrega.",
      "O horário você não escolhe, só o dia.",
      "No antecipado o envio é pelos Correios, com código de rastreio.",
      "No antecipado chega pelos Correios ou transportadora.",
      "No pagamento na entrega quem leva é a entrega da Logzz, não os Correios.",
      "Não é o carteiro que leva, é a entrega da Logzz.",
      "Você escolhe o melhor dia no checkout.",
      "Nada de boleto que demora: é pix ou cartão.",
      "Coloco na carteira e já te mando o link.",
      "A marca sai quando o turno termina.",
      "Aí não tem pagamento na entrega, mas posso te mandar pelos Correios 💛",
      "Na sua região não chega com pagamento na entrega, então vai pelos Correios.",
      "Boleto infelizmente não tem, só pix ou cartão.",
      "Boleto a gente não aceita, só pix ou cartão.",
      "Boleto ainda não, só pix ou cartão.",
      "Não tem como pagar por boleto.",
      "A gente não tem a opção de boleto, só pix ou cartão.",
      "Fique tranquila, o carteiro não leva: é o entregador.",
      "Ele define a cintura e dá pra usar da manhã até a noite.",
      "Você escolhe o tamanho hoje à noite e eu te mando o link.",
      "Obrigada por escolher a gente e boa noite!",
    ]) {
      expect(verdict("operational_claim", frase), frase).toBe("pass");
    }
  });
});

describe("personAskExample: o pedido de pessoa leva o e-mail do suporte (A4, 2026-10-24)", () => {
  it("com e-mail no config a linha o cita; sem, sai a de antes; as duas passam a cadeia", async () => {
    const { personAskExample } = await import("@/agent/retry.js");
    const com = personAskExample({ email: "contato@encorpa-fashion.com.br" });
    const sem = personAskExample({});
    expect(com).toContain("escrever pra contato@encorpa-fashion.com.br");
    expect(sem).not.toMatch(/escrever|@/);
    for (const linha of [com, sem]) expect(runGates(linha, ctx({ config })).traces.filter((t) => t.verdict === "block"), linha).toEqual([]);
  });
});
