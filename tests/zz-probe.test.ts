import { it } from "vitest";
import { asksPaymentStatus, isBareAck, isPaymentReceipt, nudgesCheck, saysPaid } from "@/agent/interpret.js";
import { config, ctx } from "./fixtures.js";
import { runGates } from "@/agent/guardrails.js";
import * as F from "@/agent/followups.js";
it("probe", () => {
  const s = ["paguei", "ainda não paguei", "não paguei ainda", "paguei?", "vou pagar", "já paguei o boleto da luz", "eu nao fiz o pix", "nem fiz o pix", "fiz o pix ontem pra loja", "ja pago na entrega né", "ta pago?", "pago na entrega", "já está pago", "quero pagar no pix, já pago", "pix feito", "o pix não foi feito", "pagamento não foi concluído", "nao consegui, paguei nao", "paguei não", "esqueci, ainda vou fazer o pix, paguei nada"];
  for (const x of s) console.log("saysPaid", JSON.stringify(x), saysPaid(x));
  const a = ["como faço o pagamento?", "aceita pix?", "posso pagar no pix?", "qual o valor do pix?", "o pagamento é na entrega?", "deu certo meu pagamento?"];
  for (const x of a) console.log("asksPaymentStatus", JSON.stringify(x), asksPaymentStatus(x));
  const n = ["e ai", "eai", "deu certo", "não deu certo", "não caiu", "caiu o preço?", "e aí, tem o tamanho G?", "caiu", "nao confirmou", "e então, quanto é?"];
  for (const x of n) console.log("nudges", JSON.stringify(x), nudgesCheck(x));
  const r = ["comprovante", "não tenho comprovante", "vou mandar o comprovante", "ainda vou te mandar o comprovante", "consigo o comprovante depois", "comprovante?", "nao achei o comprovante", "[a cliente mandou uma imagem sem texto]", "[a cliente mandou uma figurinha]", "perdi o comprovante"];
  for (const x of r) console.log("receipt", JSON.stringify(x), isPaymentReceipt(x));
  const k = [["ok"], ["ok não"], ["👍"], ["ta bom"], ["ok", "mas e o frete"], ["bom"], ["certo"], ["ta"], ["ok obrigada"], ["Ok, entendi"], ["show"], ["hum"], ["beleza, ta bom"]];
  for (const x of k) console.log("ack", JSON.stringify(x), isBareAck(x));
  const lines = [F.PAYMENT_CHECK_REPLY, F.PAYMENT_STILL_CHECKING, F.PAYMENT_CONFIRMED_REPLY, F.PAYMENT_RECEIPT_ASK, F.PAYMENT_RECEIPT_HANDOFF, "Precisa de alguma ajuda com o CEP?", "Precisa de alguma ajuda pra achar o seu tamanho?", "Precisa de alguma ajuda com o CPF?", "Precisa de alguma ajuda com o e-mail?", "Vi que seu pedido ainda não foi finalizado, travou em alguma etapa?"];
  for (const l of lines) for (const p of ["cod", "prepay"] as const) for (const cu of [false, true]) {
    const g = runGates(l, ctx({ paymentPath: p, codUnavailable: cu }));
    const b = g.traces.filter((t) => t.verdict === "block");
    if (b.length) console.log("BLOCK", p, cu, l, b.map((t) => t.gate + ":" + t.detail));
  }
  console.log("paidFacts", F.paymentFacts([{ status: "Aguardando pagamento", payment_method: "prepay" }]), F.paymentFacts([{ status: null, payment_method: "prepay" }]), F.paymentFacts([{ status: "Pedido criado", payment_method: "prepay" }]), F.paymentFacts([{ status: "Aguardando envio", payment_method: "prepay" }]));
  console.log("open", F.checkoutStillOpen([""]), F.checkoutStillOpen(["Aguardando pagamento"]), F.checkoutStillOpen(["Pedido criado"]));
});
