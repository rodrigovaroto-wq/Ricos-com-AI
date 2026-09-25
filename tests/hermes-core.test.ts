import { describe, expect, it } from "vitest";
import { checkProposals, maskPii, renderConversation } from "../src/dev/hermes-core.js";

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
    expect(conversa).toContain("veto: price_promise — promises a discount with no number behind it");
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
