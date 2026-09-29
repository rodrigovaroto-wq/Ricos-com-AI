import { describe, expect, it } from "vitest";
import {
  annotateWithGates,
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
      classe: "resposta_pronta",
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
      problems: ["conversa inexistente: meu nome é Ana Souza", "alvo desconhecido: rua das Flores 12", 'trecho não está na conversa Ana mora na rua das Flores: "x"'],
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
    expect(run).toMatch(/ok\.map\(\(c, i\) =>[\s\S]*evidence: \{ \.\.\.storedEvidence\(c\), source \}/);
  });

  it("o banco grava só as chaves de uma proposta, com o trecho original", async () => {
    const { proposalFields } = await import("../src/dev/hermes-core.js");
    const p = proposalFields({ ...proposta().propostas[0], extra: "meu nome é Ana" } as never);
    expect(JSON.stringify(p)).not.toContain("Ana");
    expect(p.evidencias[0]?.trecho).toBe("tiro mais alguma dúvida antes?");
    expect(p.como_medir).toBe("pronta-por-preco");
  });

  it("não altera a entrada — o banco grava o trecho original", () => {
    withoutQuotes(checked);
    expect(checked[0]?.proposal.evidencias[0]?.trecho).toBe("tiro mais alguma dúvida antes?");
  });
});

describe("hermes: mentira aponta a regra que contradiz (item 5 da conclusão)", () => {
  const prompt = "Nunca prometa entrega em data exata: o prazo é de 1 a 3 dias úteis.";
  const mentira = (over: Record<string, unknown> = {}) =>
    proposta({ classe: "mentira", o_que: "Vetar prazo exato", mentira_vizinha: "", fato_contradito: "o prazo é de 1 a 3 dias úteis", ...over });

  it("aceita mentira com o fato copiado do prompt", () => {
    expect(checkProposals(mentira(), conversas, prompt)[0]?.problems).toEqual([]);
  });
  it("derruba mentira sem fato, e fato que não está no prompt", () => {
    expect(checkProposals(mentira({ fato_contradito: "" }), conversas, prompt)[0]?.problems).toContain("mentira sem o fato contradito");
    expect(checkProposals(mentira({ fato_contradito: "entrega sempre amanhã" }), conversas, prompt)[0]?.problems.join()).toContain("fato contradito não está no prompt");
  });
  it("derruba classe fora da lista", () => {
    expect(checkProposals(proposta({ classe: "outra" }), conversas)[0]?.problems).toContain("classe inválida");
  });
  it("proposta que não é mentira não precisa de fato", () => {
    expect(checkProposals(proposta(), conversas, prompt)[0]?.ok).toBe(true);
  });
});

describe("hermes: afrouxar gate, nas palavras que o modelo usa", () => {
  it.each(["Remover o veto de preço nessa frase", "Desativar o gate de prazo", "Relaxar o gate", "Isentar a pergunta de fechamento", "Parar de vetar a frase de troca", "Não vetar a pergunta"])(
    "%s exige a mentira vizinha",
    (o_que) => {
      expect(checkProposals(proposta({ o_que, mentira_vizinha: "" }), conversas)[0]?.problems.join()).toContain("mentira vizinha");
    },
  );
  it.each(["Flexibilizar o gate de tamanho", "Tolerar a frase de troca", "Abrandar o veto de prazo", "Isentar a pergunta de fechamento", "o gate não deve bloquear parcelamento", "o gate não deve mais vetar frete grátis", "deixar de vetar troca grátis"])("%s também é afrouxar", async (t) => {
    const { asksToLoosen } = await import("../src/dev/hermes-core.js");
    expect(asksToLoosen(t)).toBe(true);
  });
  it.each(["Vetar frete isento no antecipado", "O gate não deve aceitar desconto sem número", "Não permitir prazo exato", "Vetar escassez inventada"])(
    "negação: %s endurece, não afrouxa",
    async (t) => {
      const { asksToLoosen } = await import("../src/dev/hermes-core.js");
      expect(asksToLoosen(t)).toBe(false);
    },
  );

  it("negação: endurecer o gate não exige mentira vizinha", () => {
    expect(checkProposals(proposta({ o_que: "Vetar escassez inventada", objetivo: "Nenhuma escassez sai", mentira_vizinha: "" }), conversas)[0]?.ok).toBe(true);
  });
});

describe("hermes: descarta a mentira que os gates de hoje já vetam (item 6)", () => {
  const c = (classe: string, blocked: string[][]): Checked => ({
    ok: true,
    problems: [],
    proposal: { ...proposta().propostas[0], classe } as Checked["proposal"],
    today: blocked.map((b) => ({ trecho: "x", blockedBy: b })),
  });
  it("mentira com todo trecho vetado hoje sai das propostas, com o motivo", async () => {
    const { discardAlreadyVetoed, ALREADY_VETOED } = await import("../src/dev/hermes-core.js");
    const [out] = discardAlreadyVetoed([c("mentira", [["delivery_promise"], ["price_promise"]])]);
    expect(out?.ok).toBe(false);
    expect(out?.problems).toEqual([ALREADY_VETOED]);
  });
  it("basta um trecho que passa para a mentira continuar", async () => {
    const { discardAlreadyVetoed } = await import("../src/dev/hermes-core.js");
    expect(discardAlreadyVetoed([c("mentira", [["delivery_promise"], []])])[0]?.ok).toBe(true);
  });
  it("frase honesta vetada (resposta pronta) nunca é descartada por estar vetada", async () => {
    const { discardAlreadyVetoed } = await import("../src/dev/hermes-core.js");
    expect(discardAlreadyVetoed([c("resposta_pronta", [["price_promise"]])])[0]?.ok).toBe(true);
  });
});

describe("hermes: lê onde o problema está, com controle (item 3)", () => {
  const row = (id: string, s: Partial<import("../src/dev/hermes-core.js").SampleRow> = {}) => ({
    conversation_id: id, created_at: `2026-09-29T12:00:${id.padStart(2, "0")}Z`, fallbacks: 0, handoffs: 0, opt_outs: 0, blocks: 0, cost_brl: 0, ...s,
  });
  it("sinal primeiro — opt-out, resposta pronta, handoff, veto — e o controle nunca é zero", async () => {
    const { pickSample } = await import("../src/dev/hermes-core.js");
    const rows = [row("1"), row("2", { blocks: 2 }), row("3", { handoffs: 1 }), row("4", { fallbacks: 1 }), row("5", { opt_outs: 1 }), row("6"), row("7", { blocks: 1 })];
    expect(pickSample(rows, 5, 1)).toEqual(["5", "4", "3", "2", "6"]);
  });
  it("com pouco sinal, completa com as conversas sem sinal", async () => {
    const { pickSample } = await import("../src/dev/hermes-core.js");
    expect(pickSample([row("1"), row("2"), row("3", { fallbacks: 1 })], 50)).toEqual(["3", "2", "1"]);
  });
  it("tudo com sinal: ainda sobra lugar para o controle", async () => {
    const { pickSample } = await import("../src/dev/hermes-core.js");
    const rows = [...Array.from({ length: 10 }, (_, i) => row(String(i + 10), { blocks: 1 })), row("1")];
    const got = pickSample(rows, 5, 1);
    expect(got).toHaveLength(5);
    expect(got).toContain("1");
  });
});

describe("hermes: o efeito medido de uma proposta publicada (item 2)", () => {
  const conv = (fallback: boolean) => ({
    persona: "c",
    transcript: [{ from: "persona", text: "oi" }, { from: "valen", text: "Oi!", ...(fallback ? { status: "fallback" } : {}) }],
  });
  it("lê a checagem nomeada antes e depois, com o N, e diz que não é veredito", async () => {
    const { measureEffect } = await import("../src/dev/hermes-core.js");
    const r = measureEffect("pronta-por-preco ou respostas-prontas", [conv(true), conv(true)], [conv(false)]);
    expect(r).toMatch(/^respostas-prontas: antes 2 \(meta 0, não atingida\) em 2 conversas; depois 0 \(meta 0, atingida\) em 1 conversas/);
    expect(r).toContain("não veredito");
  });
  it("sem checagem nomeada, diz que é à mão; sem conversa depois, diz que ainda não há", async () => {
    const { measureEffect } = await import("../src/dev/hermes-core.js");
    expect(measureEffect("contar à mão", [], [])).toContain("medir à mão");
    expect(measureEffect("respostas-prontas", [conv(true)], [])).toContain("ainda sem conversa depois");
  });
  it("a leitura nova não apaga o link do deploy, e substitui a leitura anterior", async () => {
    const { withMeasure } = await import("../src/dev/hermes-core.js");
    const first = withMeasure("publicada: https://github.com/o/r/actions/runs/1", "respostas-prontas: antes 2; depois 0");
    expect(first).toBe("publicada: https://github.com/o/r/actions/runs/1 · medida: respostas-prontas: antes 2; depois 0");
    expect(withMeasure(first, "respostas-prontas: antes 2; depois 1")).toBe("publicada: https://github.com/o/r/actions/runs/1 · medida: respostas-prontas: antes 2; depois 1");
    expect(withMeasure(null, "x")).toBe("medida: x");
  });

  it("o id mais longo ganha: pronta-por-preco não é lido como outro", async () => {
    const { checkIdOf } = await import("../src/dev/hermes-core.js");
    expect(checkIdOf("medir por pronta-por-preco")).toBe("pronta-por-preco");
  });
});

describe("hermes: nenhum segredo sai no documento", () => {
  it("troca token do GitHub, do Supabase, JWT e chave de API", async () => {
    const { scrubSecrets } = await import("../src/dev/hermes-core.js");
    const out = scrubSecrets(`a ghs_${"a".repeat(36)} b sbp_${"b".repeat(40)} c eyJhbGciOiJIUzI1.eyJyb2xlIjoic2Vydmlj.c2lnbmF0dXJlX2hlcmU d sk-${"c".repeat(30)}`);
    expect(out).not.toMatch(/ghs_|sbp_|eyJ|sk-/);
  });
  it("negação: texto comum com 'sk' ou 'eyJ' curto passa intacto", async () => {
    const { scrubSecrets } = await import("../src/dev/hermes-core.js");
    expect(scrubSecrets("risk-free e o eyJ curto")).toBe("risk-free e o eyJ curto");
  });
});

describe("hermes: o e-mail mostra o trecho e o veredito de hoje", () => {
  it("o que o banco guarda de uma proposta válida leva os gates de hoje em cada trecho", async () => {
    const { storedEvidence } = await import("../src/dev/hermes-core.js");
    const [c] = annotateWithGates(checkProposals(proposta(), conversas), () => ["price_promise"]);
    expect(storedEvidence(c!).evidencias[0]).toEqual({ conversa: "persona-jussara", mensagem: 1, trecho: "tiro mais alguma dúvida antes?", hoje: ["price_promise"] });
  });
});
