/**
 * Jev beside Hermes (plan of 2026-10-22, P2.1–P5.2): the client fails open and keeps the US$ 0.15 ceiling, the questions are asked
 * only when the Portuguese gold set approved them at ≥ 90%, the exchanges number Malu's replies like the Hermes bundle does, and
 * the gold-set rule needs 90% on the "sim" AND on the "não".
 */
import { describe, expect, it } from "vitest";
import { JEV_ENDPOINT, JEV_MAX_USD, JEV_MODEL, JevBudget, askJev, readAnswer, type JevFetch } from "@/dev/jev.js";
import { AUDIT, INBOUND, MISSED, QUESTIONS_VERSION, approvedOf, exchanges, flagged, replyState } from "@/dev/jev-questions.js";
import { analyse, disagreements, renderJev } from "@/dev/jev-analysis.js";
import { BAR, MIN_EACH, approvedFile, scoreQuestion } from "@/dev/jev-gold.js";
import { renderTiming } from "@/dev/timing.js";
import type { Conversation } from "@/dev/persona-scorecard.js";

const ok = (body: unknown): JevFetch => async () => ({ ok: true, status: 200, json: async () => body });

describe("askJev: a chamada direta, versão fixa, falha aberta", () => {
  it("manda modelo fixado, estado e perguntas, com a chave no cabeçalho, e lê as respostas e o custo", async () => {
    const sent: Array<{ url: string; init: Parameters<JevFetch>[1] }> = [];
    const f: JevFetch = async (url, init) => {
      sent.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ model: "jev-1.13.0", answers: { quer_comprar: { type: "noul", noul: 0.97 } }, usage: { input_tokens: 1000, output_tokens: 3 } }) };
    };
    const budget = new JevBudget();
    const r = await askJev("Mensagem da cliente: quero", { quer_comprar: INBOUND.quer_comprar! }, { apiKey: "k", budget, fetch: f });
    expect(sent[0]!.url).toBe(JEV_ENDPOINT);
    expect(sent[0]!.init.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(sent[0]!.init.body)).toMatchObject({ model: JEV_MODEL, state: "Mensagem da cliente: quero" });
    expect(JEV_MODEL).toBe("jev-1.13.0");
    expect(r?.answers.quer_comprar).toEqual({ type: "noul", noul: 0.97 });
    expect(r?.costUsd).toBeCloseTo(0.000042, 9);
    expect([budget.calls, budget.spentUsd]).toEqual([1, r!.costUsd]);
  });

  it("sem chave, HTTP de erro, exceção ou corpo estranho: null ou resposta descartada, nunca lança", async () => {
    const budget = new JevBudget();
    const q = { x: AUDIT.escassez! };
    expect(await askJev("s", q, { apiKey: undefined, budget, fetch: ok({}) })).toBeNull();
    expect(await askJev("s", q, { apiKey: "k", budget, fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) })).toBeNull();
    expect(await askJev("s", q, { apiKey: "k", budget, fetch: async () => { throw new Error("timeout"); } })).toBeNull();
    expect((await askJev("s", q, { apiKey: "k", budget, fetch: ok({ answers: { x: { noul: 7 } } }) }))?.answers).toEqual({});
  });

  it("o teto da rodada (US$ 0,15): passou dele, nenhuma chamada sai", async () => {
    expect(JEV_MAX_USD).toBe(0.15);
    const budget = new JevBudget();
    budget.spentUsd = 0.15;
    let calls = 0;
    const r = await askJev("s", { x: AUDIT.escassez! }, { apiKey: "k", budget, fetch: async () => (calls++, { ok: true, status: 200, json: async () => ({}) }) });
    expect([r, calls, budget.refused]).toEqual([null, 0, 1]);
  });

  it("readAnswer só aceita o tipo perguntado", () => {
    expect(readAnswer(INBOUND.objecao!, { choice: "preco", confidence: 1, probabilities: { preco: 1 } })).toMatchObject({ choice: "preco" });
    expect(readAnswer(INBOUND.objecao!, { choice: "inventada", confidence: 1, probabilities: {} })).toBeNull();
    expect(readAnswer(INBOUND.irritacao!, { score: 3, confidence: 1, probabilities: {} })).toBeNull();
    expect(readAnswer(INBOUND.irritacao!, { score: 1.4, confidence: 0.4, probabilities: {} })).toMatchObject({ score: 1.4 });
  });
});

const conv: Conversation = {
  persona: "conversa-abc",
  transcript: [
    { from: "persona", text: "oi" },
    { from: "valen", status: "welcomed", text: "Olá, sou a Malu" },
    { from: "valen", text: "Qual o número da calça?" },
    { from: "persona", text: "44, quero pro casamento" },
    { from: "valen", text: "Então o seu é o G. Me passa o CEP?" },
    { from: "persona", text: "pode mandar o link" },
    { from: "valen", status: "fallback", text: "Deixa eu confirmar" },
  ],
};

describe("exchanges: as trocas, numeradas como no pacote do Hermes", () => {
  it("cada mensagem dela com a resposta seguinte; a recepção não conta; a resposta pronta não é do modelo", () => {
    const xs = exchanges(conv);
    expect(xs.map((x) => [x.mensagem, x.cliente, x.answeredByModel])).toEqual([
      [1, "oi", true],
      [2, "44, quero pro casamento", true],
      [3, "pode mandar o link", false],
    ]);
    expect(xs[1]!.maluAntes).toBe("Qual o número da calça?");
    expect(replyState(xs[1]!)).toContain("Resposta da Malu:\nEntão o seu é o G. Me passa o CEP?");
  });
});

describe("só as perguntas aprovadas pelo teste em português", () => {
  const approved = { model: JEV_MODEL, questionsVersion: QUESTIONS_VERSION, measuredAt: "x", approved: { quer_comprar: { threshold: 0.5, accuracy: 0.95, n: 150 } } };
  it("aprovada para este modelo e esta versão das instruções: entra; o resto não", () => {
    expect(Object.keys(approvedOf(INBOUND, approved, JEV_MODEL))).toEqual(["quer_comprar"]);
    expect(approvedOf(AUDIT, approved, JEV_MODEL)).toEqual({});
  });
  it("outro modelo, outra versão ou nada aprovado: nenhuma pergunta", () => {
    expect(approvedOf(INBOUND, approved, "jev-1.14.0")).toEqual({});
    expect(approvedOf(INBOUND, { ...approved, questionsVersion: QUESTIONS_VERSION + 1 }, JEV_MODEL)).toEqual({});
    expect(approvedOf(INBOUND, null, JEV_MODEL)).toEqual({});
  });
});

describe("analyse e renderJev: suspeitas para o Hermes conferir, divergências para o operador", () => {
  const ask = async (_state: string, questions: Record<string, unknown>) => ({
    model: JEV_MODEL,
    inputTokens: 100,
    costUsd: 0.0000042,
    answers: Object.fromEntries(
      Object.keys(questions).map((q) => [q, q === "objecao" ? { type: "choice" as const, choice: "nenhuma", confidence: 1, probabilities: {} } : q === "prontidao" ? { type: "score" as const, score: 2, confidence: 1, probabilities: {} } : { type: "noul" as const, noul: q === "gatilho_nao_usado" || q === "promete_prazo" ? 0.9 : 0.1 }]),
    ),
  });
  it("pergunta só o aprovado; a resposta pronta fica fora da auditoria; prontidão uma vez por conversa", async () => {
    const run = await analyse([conv], new Set(["quer_comprar", "promete_prazo", "gatilho_nao_usado", "prontidao"]), ask);
    // 3 trocas × entrada + 2 respostas do modelo + 1 prontidão
    expect(run.calls).toBe(6);
    expect(run.judgments.filter((j) => j.question === "promete_prazo")).toHaveLength(2);
    expect(run.judgments.some((j) => j.question === "objecao")).toBe(false);
    const md = renderJev(run, null, { conversations: 1 });
    expect(md).toContain("**Tudo aqui é suspeita a\nconferir lendo a conversa**");
    expect(md).toContain("**o gate tem a palavra final**");
    expect(md).toContain("Contou a ocasião e a Malu não usou** (`gatilho_nao_usado`): 2 de 2");
    expect(md).toContain("Prontidão no fim (JEV, pergunta ainda não medida no conjunto de ouro): fria 0 · morna 0 · quente 1");
    expect(disagreements(run, null).map((j) => j.question)).toEqual(["promete_prazo", "promete_prazo"]);
  });
  it("Jev fora do ar: conta as falhas e segue", async () => {
    const run = await analyse([conv], new Set(["quer_comprar"]), async () => null);
    expect([run.calls, run.failed, run.judgments.length]).toEqual([0, 3, 0]);
  });
});

describe("a régua dos 90% (P2.4)", () => {
  const noul = (p: number) => ({ type: "noul" as const, noul: p });
  const pairs = (yesRight: number, yesN: number, noRight: number, noN: number) => [
    ...Array.from({ length: yesN }, (_, i) => ({ label: true, answer: noul(i < yesRight ? 0.9 : 0.1) })),
    ...Array.from({ length: noN }, (_, i) => ({ label: false, answer: noul(i < noRight ? 0.1 : 0.9) })),
  ];
  it("90% no sim e 90% no não, com 10 de cada: aprovada", () => {
    expect(BAR).toBe(0.9);
    expect(MIN_EACH).toBe(10);
    expect(scoreQuestion("q", pairs(9, 10, 90, 100)).verdict).toBe("aprovada");
  });
  it("sempre 'não' passa no acerto geral mas é reprovada pelo lado do sim", () => {
    const s = scoreQuestion("q", pairs(0, 10, 140, 140));
    expect(s.right / s.n).toBeGreaterThan(0.9);
    expect(s.verdict).toBe("reprovada");
  });
  it("menos de 10 casos de sim: sem amostra, não aprovada", () => {
    expect(scoreQuestion("q", pairs(5, 5, 100, 100)).verdict).toBe("sem amostra");
  });
  it("escolha: 90% no geral com 30 itens", () => {
    const choice = (c: string) => ({ type: "choice" as const, choice: c, confidence: 1, probabilities: {} });
    const xs = Array.from({ length: 30 }, (_, i) => ({ label: "preco", answer: choice(i < 27 ? "preco" : "pensar") }));
    expect(scoreQuestion("objecao", xs).verdict).toBe("aprovada");
    expect(scoreQuestion("objecao", xs.slice(0, 29).concat([{ label: "preco", answer: choice("pensar") }]).map((p, i) => (i === 0 ? { ...p, answer: choice("pensar") } : p))).verdict).toBe("reprovada");
  });
  it("o arquivo de aprovadas leva só as aprovadas, com o modelo e a versão", () => {
    const f = approvedFile([{ question: "a", n: 150, right: 140, verdict: "aprovada" }, { question: "b", n: 150, right: 100, verdict: "reprovada" }], JEV_MODEL, "t");
    expect(Object.keys(f.approved)).toEqual(["a"]);
    expect([f.model, f.questionsVersion]).toEqual([JEV_MODEL, QUESTIONS_VERSION]);
  });
  it("as três famílias juntas têm 18 perguntas, todas com instrução em português", () => {
    const all = { ...INBOUND, ...AUDIT, ...MISSED };
    expect(Object.keys(all)).toHaveLength(18);
    for (const q of Object.values(all)) expect(q.instructions).toMatch(/\b(?:cliente|Malu)\b/);
    expect(flagged({ type: "score", score: 0.4, confidence: 1, probabilities: {} })).toBe(false);
  });
});

describe("renderTiming: números das views, nunca do modelo", () => {
  it("monta as quatro seções e a última palavra mais frequente", () => {
    const md = renderTiming({
      latency: [{ day: "2026-10-22", replies: 10, p50_seconds: 28, p90_seconds: 61 }],
      ruler: [{ kind: "silence_1", sent: 40, answered_24h: 6 }],
      byHour: [{ hour: 19, sent: 10, answered_24h: 4 }, { hour: 9, sent: 2, answered_24h: 2 }],
      lastWord: [{ body: "Qual o número da calça?" }, { body: "Qual o número da calça?" }, { body: "Me passa o CEP?" }],
    });
    expect(md).toContain("- 2026-10-22: mediana 28 s · 90% em até 61 s (10 respostas)");
    expect(md).toContain("- 1º lembrete de silêncio: 6 de 40 (15%)");
    expect(md).toContain("- 19h: 4 de 10 (40%)");
    expect(md).not.toContain("- 9h:");
    expect(md).toContain('- 2× "Qual o número da calça?"');
  });
});

describe("o conjunto de ouro (hermes/jev-ouro.json)", () => {
  it("toda pergunta de sim/não tem pelo menos 10 casos de sim e de não; todo item rotula as 18", async () => {
    const { readFileSync } = await import("node:fs");
    const gold = JSON.parse(readFileSync("hermes/jev-ouro.json", "utf8")) as Array<{ id: string; labels: Record<string, unknown> }>;
    const ids = Object.keys({ ...INBOUND, ...AUDIT, ...MISSED });
    expect(gold.length).toBeGreaterThanOrEqual(150);
    for (const g of gold) expect(Object.keys(g.labels).sort(), g.id).toEqual([...ids].sort());
    for (const q of ids.filter((q) => typeof gold[0]!.labels[q] === "boolean")) {
      expect(gold.filter((g) => g.labels[q] === true).length, q).toBeGreaterThanOrEqual(MIN_EACH);
      expect(gold.filter((g) => g.labels[q] === false).length, q).toBeGreaterThanOrEqual(MIN_EACH);
    }
  });
  it("só texto sintético: nenhum telefone, CPF ou e-mail", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync("hermes/jev-ouro.json", "utf8");
    expect(raw).not.toMatch(/\b\d{10,13}\b/);
    expect(raw).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
    expect(raw.replace(/contato@encorpa-fashion\.com\.br/g, "")).not.toMatch(/[\w.]+@[\w-]+\.\w+/);
  });
});

describe("dado pessoal (revisão de segurança de 2026-10-22)", () => {
  const link = "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?name=Ana+Souza&phone=11987654321&document=52998224725";
  const c: Conversation = {
    persona: "conversa-pii",
    transcript: [
      { from: "persona", text: "meu cep é 01310-100, quero comprar" },
      { from: "valen", text: `Aqui o link: ${link}` },
    ],
  };
  it("ao JEV vai o texto original sem a query do link (nome, telefone e CPF do checkout)", async () => {
    const { forJev } = await import("@/dev/jev-questions.js");
    expect(forJev(`Aqui: ${link} 💛`)).toBe("Aqui: https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0 💛");
    const x = exchanges(c)[0]!;
    expect(replyState(x)).not.toMatch(/11987654321|52998224725|Ana\+Souza/);
    expect(x.cliente).toContain("01310-100");
  });
  it("jev.md e timing.md, que o modelo do Hermes lê, saem mascarados", async () => {
    const ask = async (_s: string, qs: Record<string, unknown>) => ({ model: JEV_MODEL, inputTokens: 1, costUsd: 0, answers: Object.fromEntries(Object.keys(qs).map((q) => [q, { type: "noul" as const, noul: 0.9 }])) });
    const md = renderJev(await analyse([c], new Set(["quer_comprar", "compra_sem_passo"]), ask), null, { conversations: 1 });
    expect(md).toContain("[cep]");
    expect(md).not.toContain("01310-100");
    const t = renderTiming({ latency: [], ruler: [], byHour: [], lastWord: [{ body: `Aqui o link: ${link}` }] });
    expect(t).not.toMatch(/11987654321|52998224725|Ana\+Souza/);
  });
  it("probabilidades: só números das chaves perguntadas; versão só no formato jev-*", async () => {
    expect(readAnswer(INBOUND.objecao!, { choice: "preco", confidence: 1, probabilities: { preco: 0.9, pensar: "x", hack: 1 } })).toEqual({
      type: "choice", choice: "preco", confidence: 1, probabilities: { preco: 0.9 },
    });
    const r = await askJev("s", { q: AUDIT.escassez! }, { apiKey: "k", budget: new JevBudget(), fetch: ok({ model: "<script>", answers: { q: { noul: 0.2 } } }) });
    expect(r?.model).toBe(JEV_MODEL);
  });
});

describe("revisão de código de 2026-10-22", () => {
  it("passado o prazo, nenhuma chamada começa: contadas como puladas", async () => {
    let calls = 0;
    const run = await analyse([conv], new Set(["quer_comprar"]), async () => (calls++, null), { deadline: Date.now() - 1 });
    expect([calls, run.skipped]).toEqual([0, 3]);
  });
  it("chamadas em paralelo, todas registradas", async () => {
    let live = 0;
    let peak = 0;
    const ask = async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { model: JEV_MODEL, inputTokens: 1, costUsd: 0, answers: { quer_comprar: { type: "noul" as const, noul: 0.1 } } };
    };
    const run = await analyse([conv, { ...conv, persona: "conversa-def" }], new Set(["quer_comprar"]), ask, { concurrency: 4 });
    expect(run.calls).toBe(6);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it("mensagem dela respondida só pela recepção não vira troca com o número de outra resposta", () => {
    const c: Conversation = { persona: "x", transcript: [{ from: "persona", text: "oi" }, { from: "valen", status: "welcomed", text: "Olá" }, { from: "persona", text: "tem G?" }, { from: "valen", text: "Tem sim!" }] };
    expect(exchanges(c).map((x) => [x.mensagem, x.cliente])).toEqual([[1, "tem G?"]]);
  });
});

describe("as mentiras de detalhe operacional (operador, 2026-10-23)", () => {
  it("três perguntas literais na auditoria, cada uma com 12 casos de sim no ouro", async () => {
    for (const q of ["fala_boleto", "escolhe_horario", "correio_na_entrega"]) expect(AUDIT[q]?.type).toBe("noul");
    const { readFileSync } = await import("node:fs");
    const gold = JSON.parse(readFileSync("hermes/jev-ouro.json", "utf8")) as Array<{ labels: Record<string, unknown> }>;
    for (const q of ["fala_boleto", "escolhe_horario", "correio_na_entrega"]) expect(gold.filter((g) => g.labels[q] === true).length, q).toBe(12);
  });
  it("a versão das perguntas subiu: as aprovadas da versão 1 não valem até a nova medida", () => {
    expect(QUESTIONS_VERSION).toBe(6);
    expect(approvedOf(AUDIT, { model: JEV_MODEL, questionsVersion: 1, measuredAt: "x", approved: { escassez: { threshold: 0.5, accuracy: 1, n: 230 } } }, JEV_MODEL)).toEqual({});
  });
});

describe("as dez reescritas, objetivas e claras (operador, 2026-10-23, versões 3 a 6)", () => {
  const all = { ...INBOUND, ...AUDIT, ...MISSED };
  it("pergunta de duas condições diz que a condição ausente é não", () => {
    for (const q of ["compra_sem_passo", "objecao_sem_resposta", "kit_nao_oferecido", "desconfianca_sem_garantia"]) {
      expect(all[q]!.instructions, q).toContain("Só é sim se as duas forem verdade.");
      expect(all[q]!.instructions, q).toMatch(/Se a cliente [^.]*, a resposta é não/);
    }
  });
  it("falar em primeira pessoa não é dizer que é humana; contar vida de pessoa é", () => {
    expect(AUDIT.diz_ser_pessoa!.instructions).toContain("Só falar em primeira pessoa, dizer \"Malu\" ou ser simpática NÃO é sim.");
  });
  it("objeção e irritação guardam as opções que o ouro rotulou", () => {
    const objecao = INBOUND.objecao!;
    const irritacao = INBOUND.irritacao!;
    expect(objecao.type === "choice" && Object.keys(objecao.criteria)).toEqual(["preco", "confianca", "prazo", "tamanho", "pensar", "pagamento", "nenhuma"]);
    expect(irritacao.type === "score" && irritacao.criteria.length).toBe(3);
  });
});

describe("a decisão do operador sobre as duas que ficaram abaixo da barra (2026-10-23)", () => {
  it("objeção aprovada pelo operador entra nas aprovadas mesmo reprovada; sem amostra, não", async () => {
    const { approvedFile, renderGold } = await import("@/dev/jev-gold.js");
    const s = { question: "objecao", n: 276, right: 236, verdict: "reprovada" as const };
    expect(Object.keys(approvedFile([s], JEV_MODEL, "x").approved)).toEqual(["objecao"]);
    expect(Object.keys(approvedFile([{ ...s, verdict: "sem amostra" }], JEV_MODEL, "x").approved)).toEqual([]);
    expect(Object.keys(approvedFile([{ ...s, question: "irritacao" }], JEV_MODEL, "x").approved)).toEqual([]);
    expect(renderGold([s], { model: JEV_MODEL, items: 276, costUsd: 0 })).toContain("aprovada pelo operador");
  });
  it("pergunta ignorada recusada: não é mais perguntada", () => {
    expect("pergunta_ignorada" in MISSED).toBe(false);
  });
});

