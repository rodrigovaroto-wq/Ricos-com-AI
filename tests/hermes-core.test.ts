import { describe, expect, it } from "vitest";
import {
  checkProposals,
  maskPii,
  renderConversation,
  renderLedger,
  rowsToConversations,
  withoutQuotes,
  type Checked,
  type LedgerRow,
  type SupabaseRows,
} from "../src/dev/hermes-core.js";
import { scoreRun } from "../src/dev/persona-scorecard.js";

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

/**
 * The production source (`--source=supabase`). Until 2026-09-29 the rows were mapped inline
 * in `hermes-run.ts` with no status, so the scorecard read 0 canned replies and 0 handoffs
 * on real data whatever happened, counted the welcome as Malu's reply 1, and priced every
 * conversation at zero. No test touched that path.
 */
describe("hermes: a fonte de produção", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 8, 29, 12, 0, s)).toISOString();
  const rows = (over: Partial<SupabaseRows> = {}): SupabaseRows => ({
    conversations: [{ id: "c1aaaaaaaa", lead_id: "l1", welcomed_at: t(1), cost_brl: "0.0123", leads: { phone: "5511987654321" } }],
    messages: [
      { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "oi", created_at: t(0) },
      { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Oi! Já te respondo.", created_at: t(2) },
      { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "tem desconto?", created_at: t(10) },
      { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Deixa eu confirmar isso direitinho e já te respondo, tá?", created_at: t(20) },
      { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "quero falar com uma pessoa", created_at: t(30) },
      { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Vou chamar alguém da equipe.", created_at: t(40) },
    ],
    traces: [1, 2, 3].map((n) => ({ conversation_id: "c1aaaaaaaa", gate: "price_promise", detail: "sem número", created_at: t(10 + n) })),
    outcomes: [
      { conversation_id: "c1aaaaaaaa", outcome: "fallback", created_at: t(21) },
      { conversation_id: "c1aaaaaaaa", outcome: "handoff", created_at: t(41) },
    ],
    ...over,
  });

  it("marca a boas-vindas, a resposta pronta e o handoff pelo desfecho gravado", () => {
    const { conversations } = rowsToConversations(rows());
    expect(conversations[0]?.transcript.filter((e) => e.from !== "persona").map((e) => e.status)).toEqual(["welcomed", "fallback", "handoff"]);
  });

  it("o placar de produção conta a resposta pronta e o handoff, e não conta a boas-vindas como resposta", () => {
    const { metrics, checks } = scoreRun(rowsToConversations(rows()).conversations);
    expect(metrics.fallbacks).toBe(1);
    expect(metrics.handoffs).toBe(1);
    expect(metrics.replies).toBe(2);
    expect(checks.find((c) => c.id === "pronta-por-preco")?.value).toBe(1);
    expect(metrics.agentCostBrl).toBe(0.0123);
  });

  it("o veto fica na resposta que saiu depois dele", () => {
    const reply = rowsToConversations(rows()).conversations[0]?.transcript.find((e) => e.status === "fallback");
    expect(reply?.vetoes).toHaveLength(3);
  });

  it("resposta sem desfecho gravado (toque da régua, conversa anterior à v33) fica sem status — nunca vira fallback", () => {
    const { conversations } = rowsToConversations(rows({ outcomes: [], conversations: [{ ...rows().conversations[0]!, welcomed_at: null }] }));
    expect(conversations[0]?.transcript.filter((e) => e.from !== "persona").map((e) => e.status)).toEqual([undefined, undefined, undefined]);
  });

  it("um desfecho sem mensagem (deferred, stopped) não rouba o status da resposta anterior", () => {
    const { conversations } = rowsToConversations(
      rows({
        outcomes: [
          { conversation_id: "c1aaaaaaaa", outcome: "send", created_at: t(21) },
          { conversation_id: "c1aaaaaaaa", outcome: "deferred", created_at: t(25) },
          { conversation_id: "c1aaaaaaaa", outcome: "stopped", created_at: t(45) },
          { conversation_id: "c1aaaaaaaa", outcome: "handoff", created_at: t(46) },
        ],
      }),
    );
    expect(conversations[0]?.transcript.find((e) => e.text?.startsWith("Deixa eu"))?.status).toBe("replied");
    expect(conversations[0]?.transcript.find((e) => e.text?.startsWith("Vou chamar"))?.status).toBeUndefined();
  });

  it("um handoff sem mensagem (recibo vetado, espera que falhou) não rouba o toque da régua de antes da cliente voltar", () => {
    const { conversations } = rowsToConversations(
      rows({
        messages: [
          { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "oi", created_at: t(0) },
          { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Oi! Qual seu tamanho?", created_at: t(2) },
          { conversation_id: "c1aaaaaaaa", direction: "outbound", body: "Ainda por aí?", created_at: t(20) },
          { conversation_id: "c1aaaaaaaa", direction: "inbound", body: "quero falar com gente", created_at: t(30) },
        ],
        traces: [],
        outcomes: [
          { conversation_id: "c1aaaaaaaa", outcome: "send", created_at: t(3) },
          { conversation_id: "c1aaaaaaaa", outcome: "handoff", created_at: t(40) },
        ],
        conversations: [{ ...rows().conversations[0]!, welcomed_at: null }],
      }),
    );
    expect(conversations[0]?.transcript.find((e) => e.text === "Ainda por aí?")?.status).toBeUndefined();
  });

  it("deixa de fora a conversa sintética das personas (prefixo 5500099) e conta só os leads reais", () => {
    const sint = { id: "c2bbbbbbbb", lead_id: "l2", welcomed_at: null, cost_brl: 0, leads: { phone: "5500099123456" } };
    const { conversations, leads } = rowsToConversations(rows({ conversations: [...rows().conversations, sint] }));
    expect(conversations.map((c) => c.persona)).toEqual(["conversa-c1aaaaaa"]);
    expect(leads).toBe(1);
  });
});

/** LGPD (R6.3): the proposals document of a production run goes to git, which never expires. */
describe("hermes: o documento de produção não leva citação de cliente", () => {
  const checked: Checked[] = [
    {
      ok: true,
      problems: [],
      proposal: { ...proposta().propostas[0]!, por_que: 'ela disse "moro na rua X 123" e travou' } as Checked["proposal"],
      today: [{ trecho: "tiro mais alguma dúvida antes?", blockedBy: [] }],
    },
    { ok: false, problems: ['trecho não está na conversa conversa-1: "meu cpf é 123"'], proposal: proposta().propostas[0] as Checked["proposal"] },
  ];

  it("troca cada trecho e cada texto entre aspas por um marcador", () => {
    const out = JSON.stringify(withoutQuotes(checked));
    expect(out).not.toContain("tiro mais alguma dúvida");
    expect(out).not.toContain("rua X 123");
    expect(out).not.toContain("meu cpf");
    expect(out).toContain("hermes_proposals");
  });

  it("mantém o que o operador precisa ler: alvo, conversa, veredito de hoje", () => {
    const [c] = withoutQuotes(checked);
    expect(c?.proposal.alvo).toBe("gate:price_promise");
    expect(c?.proposal.evidencias[0]?.conversa).toBe("persona-jussara");
    expect(c?.today?.[0]?.blockedBy).toEqual([]);
  });

  it("proposta malformada (rejeitada) não carrega texto por chave desconhecida, evidência em texto ou conversa inventada", () => {
    const torta = {
      ok: false,
      problems: ["conversa inexistente: meu nome é Ana Souza", "alvo desconhecido: rua das Flores 12"],
      proposal: {
        ...proposta().propostas[0],
        contexto: { fala: "meu nome é Ana Souza" },
        evidencias: ["quero pagar na entrega", { conversa: "Ana da rua das Flores", trecho: "x" }],
      },
    } as unknown as Checked;
    const out = JSON.stringify(withoutQuotes([torta]));
    expect(out).not.toMatch(/Ana|Flores|pagar na entrega/);
    expect(out).toContain("conversa inexistente");
  });

  it("o runner publica a cópia redigida na fonte de produção, e grava o original no banco", async () => {
    const { readFileSync } = await import("node:fs");
    const run = readFileSync("src/dev/hermes-run.ts", "utf8");
    expect(run).toContain('const production = source === "supabase";');
    expect(run).toContain("const published = production ? withoutQuotes(checked) : checked;");
    expect(run).toContain("renderProposals(title, resumo, published)");
    expect(run).toContain("JSON.stringify({ resumo, checked: published, usage, costUsd }");
    expect(run).toMatch(/ok\.map\(\(\{ proposal: p \}, i\) =>[\s\S]*evidence: \{ \.\.\.p, source \}/);
  });

  it("não altera a entrada — o banco grava o trecho original", () => {
    withoutQuotes(checked);
    expect(checked[0]?.proposal.evidencias[0]?.trecho).toBe("tiro mais alguma dúvida antes?");
  });
});
