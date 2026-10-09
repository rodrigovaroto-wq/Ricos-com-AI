import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookupRegion } from "@/agent/availability.js";
import { ackHelpText, PAYMENT_RECEIPT_ASK, paymentRoute, paymentSupportLine } from "@/agent/followups.js";
import { confirmsAddress, parseCep } from "@/agent/address.js";
import { isBareAck } from "@/agent/interpret.js";
import { refusedDatum } from "@/agent/identity.js";
import { linkMessage } from "@/agent/retry.js";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * L2, second round of operator decisions (2026-10-09, grafo §67): every CEP spelling, the CEP that does
 * not exist, the payment check's texts, "ok" as yes, data refusals, and the image a customer sends.
 */
describe("CEP em qualquer forma de escrita", () => {
  it("lê hífen, ponto, espaço e as combinações", () => {
    for (const t of ["04710090", "04710-090", "04710 090", "04.710-090", "04.710.090", "04 710 090", "04710.090", "04710 - 090", "meu cep é 04.710-090", "cep: 04710–090", "CEP 04 710-090 obrigada"]) {
      expect(parseCep(t), t).toBe("04710-090");
    }
  });
  it("negação: telefone, CPF e números de outro tamanho não são CEP", () => {
    for (const t of ["11 99491-5983", "(11) 99491-5983", "551.381.468-40", "55138146840", "3456-7890", "R$ 116,91", "1234567", "004710090", "00000-000"]) {
      expect(parseCep(t), t).toBeNull();
    }
  });
});

describe("CEP que não existe", () => {
  const coinzzOk = { data: { local_operation_cash_on_delivery: { delivery_days_available: [] } } };
  it("o ViaCEP sem o CEP é 'não encontrado'; falha de rede ou da Coinzz é 'não consultado'", async () => {
    expect((await lookupRegion(async (url) => (url.includes("viacep") ? { erro: true } : coinzzOk), "99999-999")).kind).toBe("not_found");
    expect((await lookupRegion(async (url) => (url.includes("viacep") ? { erro: "true" } : coinzzOk), "99999-999")).kind).toBe("not_found");
    expect((await lookupRegion(async () => null, "04710-090")).kind).toBe("failed");
    expect((await lookupRegion(async (url) => (url.includes("viacep") ? { localidade: "São Paulo", uf: "SP" } : null), "04710-090")).kind).toBe("failed");
    expect((await lookupRegion(async (url) => (url.includes("viacep") ? { localidade: "São Paulo", uf: "SP" } : coinzzOk), "04710-090")).kind).toBe("found");
  });
  it("a função de produção diz que não conseguiu consultar porque o CEP não existe, e pede pra conferir", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain('lookup.kind === "not_found"');
    expect(turn).toContain("não conseguiu consultar porque esse CEP não existe");
    expect(turn).toContain("cepKnown: Boolean(addressDraft.cep) && !cepNotFound,");
  });
});

describe("pagamento: pendente aos 5 min, comprovante, depois o e-mail do suporte", () => {
  it("aos 5 min diz que está pendente e pede o comprovante", () => {
    expect(PAYMENT_RECEIPT_ASK).toBe("Conferi aqui e o status do seu pagamento ainda está pendente. Consegue me mandar o comprovante do pagamento pra eu verificar? 💛");
  });
  it("o comprovante depois do pedido gera mais uma verificação, não uma pessoa", () => {
    const base = { saidPaid: false, asksStatus: false, receipt: true, linkSent: true, paid: false, checking: false, receiptAsked: true };
    expect(paymentRoute(base)).toBe("receipt_check");
  });
  it("sem o pagamento depois do comprovante: o e-mail do suporte vem do config", () => {
    expect(paymentSupportLine("contato@encorpa-fashion.com.br")).toContain("contato@encorpa-fashion.com.br");
    for (const line of [PAYMENT_RECEIPT_ASK, paymentSupportLine("contato@encorpa-fashion.com.br")]) {
      expect(runGates(line, ctx({ layer: "auto", paymentPath: "prepay" })).traces.filter((t) => t.verdict === "block"), line).toEqual([]);
    }
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain("const support = CONFIG.support?.email ?? null;");
    expect(turn).not.toContain('if (payment === "receipt_handoff")');
  });
});

describe("confirmação a uma pergunta de sim ou não é 'sim'; o nome pode ser pedido de novo", () => {
  it("ok, tá bom, tudo bem, tranquilo, beleza, claro, pode, fechado são sim", () => {
    for (const t of ["ok", "Ok!", "tá bom", "ta bom", "tudo bem", "tranquilo", "beleza", "blz", "claro", "com certeza", "pode", "fechado", "combinado", "show", "bora", "uhum", "aham", "isso", "sim"]) {
      expect(confirmsAddress(t), t).toBe(true);
    }
  });
  it("negação: não, tanto faz e dúvida não são sim", () => {
    for (const t of ["não", "nao tá bom", "tudo bem não", "ok mas não quero", "tanto faz", "sei lá", "hmm"]) expect(confirmsAddress(t), t).toBe(false);
  });
  it("'tranquilo' e 'tudo bem' também são só confirmação", () => {
    expect(isBareAck(["tranquilo"])).toBe(true);
    expect(isBareAck(["tudo bem"])).toBe(true);
  });
  it("o nome é pedido de novo aos 10 minutos", () => {
    expect(ackHelpText("name")).toBe("Me passa seu nome completo, por favor? É pra deixar o pedido no seu nome 💛");
  });
});

describe("recusa de dado: sem problema, segue, e o link diz o que preencher", () => {
  const ask = (q: string, a: string) => [{ direction: "outbound", body: q }, { direction: "inbound", body: a }];
  it("nome e CPF recusados em palavras contam uma vez", () => {
    expect(refusedDatum(ask("Me passa seu nome completo, por favor?", "prefiro não passar"), "name")).toBe(1);
    expect(refusedDatum(ask("Para a emissão da nota fiscal, me passa seu CPF por favor?", "não vou passar meu cpf"), "document")).toBe(1);
    expect(refusedDatum(ask("Para a emissão da nota fiscal, me passa seu CPF por favor?", "não"), "document")).toBe(1);
  });
  it("negação: dar o dado, perguntar ou adiar não é recusa", () => {
    expect(refusedDatum(ask("Para a emissão da nota fiscal, me passa seu CPF por favor?", "551.381.468-40"), "document")).toBe(0);
    expect(refusedDatum(ask("Para a emissão da nota fiscal, me passa seu CPF por favor?", "pra que precisa do cpf?"), "document")).toBe(0);
    expect(refusedDatum(ask("Me passa seu nome completo, por favor?", "Leila da Silva"), "name")).toBe(0);
    expect(refusedDatum(ask("Me passa seu nome completo, por favor?", "depois te passo"), "name")).toBe(0);
  });
  it("a mensagem do link abre com 'Sem problema!' e diz o que falta preencher", () => {
    const m = linkMessage("https://x/checkout", "prepay", "G", "Encorpa", 1, ["e-mail", "CPF"], true);
    expect(m.startsWith("Sem problema! É só clicar no link do checkout a seguir")).toBe(true);
    expect(m).toContain("No checkout você vai preencher também o seu e-mail e o seu CPF, tá?");
    expect(m.indexOf("preencher também")).toBeLessThan(m.indexOf("https://x/checkout"));
    // Negation: nothing missing, the operator's text as before.
    expect(linkMessage("https://x/checkout", "cod", "G", "Encorpa").startsWith("Perfeito! É só clicar")).toBe(true);
    expect(linkMessage("https://x/checkout", "cod", "G", "Encorpa")).not.toContain("preencher também");
  });
});
