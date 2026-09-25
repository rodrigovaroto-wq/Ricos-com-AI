import { describe, expect, it } from "vitest";
import { checkProposals, maskPii, renderConversation, renderLedger, type LedgerRow } from "../src/dev/hermes-core.js";

const conversa = renderConversation({
  persona: "persona-jussara",
  transcript: [
    { from: "persona", text: "meu cpf é 123.456.789-09, cep 01310-100, fone (11) 98765-4321, email ana@x.com" },
    { from: "valen", text: "Quer que eu siga com seu pedido ou tiro mais alguma dúvida antes?", vetoes: [{ gate: "price_promise", detail: "promises a discount with no number behind it" }] },
  ],
});
const conversas = new Map([["persona-jussara", conversa]]);
const proposta = (over: Record<string, unknown> = {}) => ({
  propostas: [
    {
      alvo: "gate:price_promise",
      o_que: "Parar de ler 'tiro mais alguma dúvida' como desconto",
      por_que: "A pergunta de fechamento virou resposta pronta",
      evidencias: [{ conversa: "persona-jussara", mensagem: 1, trecho: "tiro mais alguma dúvida antes?" }],
      objetivo: "Nenhuma resposta pronta por price_promise em frase sem preço",
      como_medir: "pronta-por-preco",
      mentira_vizinha: "Tiro mais um pouquinho pra você fechar.",
      severidade: "alta",
      ...over,
    },
  ],
});

describe("hermes: o pacote de evidência", () => {
  it("mascara CPF, CEP, telefone e e-mail antes de sair para o modelo", () => {
    expect(maskPii("cpf 123.456.789-09 cep 01310-100 fone (11) 98765-4321 ana@x.com")).toBe(
      "cpf [cpf] cep [cep] fone [telefone] [email]",
    );
    expect(conversa).not.toMatch(/123\.456|01310|98765|ana@x/);
  });
  it("mostra o veto que a resposta levou", () => {
    expect(conversa).toContain("price_promise — promises a discount with no number behind it");
    expect(conversa).toContain("veto num rascunho anterior (o texto vetado não foi gravado; o texto acima passou)");
  });
});

describe("hermes: a validação das propostas", () => {
  it("aceita proposta com trecho que está na conversa", () => {
    const [c] = checkProposals(proposta(), conversas);
    expect(c?.problems).toEqual([]);
    expect(c?.ok).toBe(true);
  });
  it("derruba trecho inventado", () => {
    const [c] = checkProposals(proposta({ evidencias: [{ conversa: "persona-jussara", trecho: "eu tiro um pouquinho pra você" }] }), conversas);
    expect(c?.ok).toBe(false);
    expect(c?.problems.join()).toContain("trecho não está na conversa");
  });
  it("derruba conversa inexistente e alvo desconhecido", () => {
    const [c] = checkProposals(proposta({ alvo: "banco", evidencias: [{ conversa: "persona-x", trecho: "oi" }] }), conversas);
    expect(c?.problems.join()).toMatch(/alvo desconhecido.*conversa inexistente|conversa inexistente.*alvo desconhecido/s);
  });
  it("derruba o que o projeto decidiu não fazer", () => {
    for (const o_que of [
      "Usar RAG para buscar a resposta de objeção",
      "Dar tool-calling ao modelo para gerar o link",
      "Guardar a memória da cliente num vector store",
      "Aplicar automaticamente a melhoria do prompt",
      "Dizer que restam 12 unidades para criar urgência",
    ]) {
      const [c] = checkProposals(proposta({ o_que }), conversas);
      expect(c?.ok, o_que).toBe(false);
      expect(c?.problems.join(), o_que).toContain("decidido não fazer");
    }
  });
  it("citar a mentira como evidência para removê-la é permitido", () => {
    const comMentira = new Map([["persona-jussara", conversa + "\n**Malu 2:** Corre que restam 12 unidades!"]]);
    const [c] = checkProposals(
      proposta({ o_que: "Vetar escassez inventada", evidencias: [{ conversa: "persona-jussara", trecho: "restam 12 unidades" }] }),
      comMentira,
    );
    expect(c?.problems).toEqual([]);
  });
  it("afrouxar gate exige a mentira vizinha", () => {
    const [c] = checkProposals(proposta({ o_que: "Afrouxar o gate de preço", mentira_vizinha: "" }), conversas);
    expect(c?.problems.join()).toContain("mentira vizinha");
  });
  it("lê no máximo cinco propostas", () => {
    const muitas = { propostas: Array.from({ length: 8 }, () => proposta().propostas[0]) };
    expect(checkProposals(muitas, conversas)).toHaveLength(5);
  });
});

describe("hermes: cada trecho citado passa pelos gates de hoje", () => {
  it("anota se o código atual já veta o trecho", async () => {
    const { annotateWithGates, checkProposals } = await import("../src/dev/hermes-core.js");
    const [c] = annotateWithGates(checkProposals(proposta(), conversas), (t) => (t.includes("tiro") ? [] : ["x"]));
    expect(c?.today).toEqual([{ trecho: "tiro mais alguma dúvida antes?", blockedBy: [] }]);
  });
});

/** A memória do Hermes (operador, 2026-09-25): ele lê cada decisão antes de propor. */
describe("hermes: o histórico de decisões", () => {
  const row = (over: Partial<LedgerRow>): LedgerRow => ({
    code: "H-1",
    target: "prompt",
    rationale: "Todo link sai com o preço — a cliente perguntou",
    status: "proposed",
    decision_reason: null,
    execution_ref: null,
    result: null,
    created_at: "2026-09-25T06:19:27Z",
    decided_at: null,
    ...over,
  });

  it("sem decisões, diz que não há — nunca um arquivo vazio que parece erro", () => {
    expect(renderLedger([])).toContain("(nenhuma decisão registrada ainda)");
  });

  it("recusada vem primeiro, com o motivo do operador, que vira o critério", () => {
    const md = renderLedger([
      row({ code: "H-9", status: "published", result: "0 respostas prontas", decided_at: "2026-09-25T10:00:00Z" }),
      row({ code: "H-2", status: "rejected", decision_reason: "link cedo demais perde a venda", decided_at: "2026-09-25T18:00:00Z" }),
    ]);
    expect(md.indexOf("H-2")).toBeLessThan(md.indexOf("H-9"));
    expect(md).toContain("RECUSADA");
    expect(md).toContain("**Motivo do operador:** link cedo demais perde a venda");
    expect(md).toContain("**Resultado medido:** 0 respostas prontas");
    expect(md).toContain("Não proponha de novo o que foi");
  });

  it("mascara dado pessoal que tenha entrado no motivo ou no resultado", () => {
    const md = renderLedger([row({ status: "rejected", decision_reason: "a cliente 11 98765-4321 reclamou" })]);
    expect(md).not.toContain("98765-4321");
    expect(md).toContain("[telefone]");
  });
});
