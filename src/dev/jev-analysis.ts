/**
 * Jev over a batch of conversations, beside Hermes (P3.1–P3.3, P5.2; operator 2026-10-22). Pure given `ask`: the runner passes
 * `askJev`, the tests a stub. What comes out is what Hermes reads (`jev.md`, the suspects to check by reading the conversation)
 * and what the operator sees: the audit flags on replies that went out are the "gate × Jev" disagreements — the gate passed
 * them; the gate keeps the last word (P3.2) and the list is for the operator to judge. Also the cost of it all, so the operator
 * can weigh the missed-opportunity analysis at scale (P3.3: "avaliar a eficiência e o custo").
 */
import type { JevAnswer, JevQuestion, JevResult } from "./jev.js";
import {
  AUDIT,
  INBOUND,
  MISSED,
  READINESS,
  conversationState,
  exchanges,
  flagged,
  inboundState,
  labelOf,
  replyState,
  type Approved,
  type Exchange,
} from "./jev-questions.js";
import type { Conversation } from "./persona-scorecard.js";
import { maskPii } from "./hermes-core.js";

export type Ask = (state: string, questions: Readonly<Record<string, JevQuestion>>) => Promise<JevResult | null>;

export interface Judgment {
  conversa: string;
  /** 1-based among Malu's replies; 0 for a whole-conversation question. */
  mensagem: number;
  question: string;
  answer: JevAnswer;
  model: string;
}

export interface JevRun {
  judgments: Judgment[];
  exchanges: Exchange[];
  calls: number;
  failed: number;
  /** Calls not made because the wall-clock deadline passed (the job's 30 minutes are shared with Hermes). */
  skipped: number;
  costUsd: number;
}

const pick = (all: Readonly<Record<string, JevQuestion>>, ids: ReadonlySet<string>) => Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));

/**
 * Asks the approved questions: one call per exchange for her message, one for Malu's reply, one per conversation for readiness.
 * `concurrency` calls at a time; past `deadline` (epoch ms) no call starts — the rest is counted as `skipped` (code review: 800
 * serial calls would eat the job's 30 minutes).
 */
export const analyse = async (
  conversations: readonly Conversation[],
  approved: ReadonlySet<string>,
  ask: Ask,
  opts: { deadline?: number; concurrency?: number } = {},
): Promise<JevRun> => {
  const run: JevRun = { judgments: [], exchanges: [], calls: 0, failed: 0, skipped: 0, costUsd: 0 };
  const inbound = pick(INBOUND, approved);
  const reply = { ...pick(AUDIT, approved), ...pick(MISSED, approved) };
  const readiness = pick(READINESS, approved);
  const record = (r: JevResult | null, conversa: string, mensagem: number) => {
    if (!r) {
      run.failed += 1;
      return;
    }
    run.calls += 1;
    run.costUsd += r.costUsd;
    for (const [question, answer] of Object.entries(r.answers)) run.judgments.push({ conversa, mensagem, question, answer, model: r.model });
  };
  const tasks: Array<() => Promise<void>> = [];
  const call = (state: string, qs: Readonly<Record<string, JevQuestion>>, conversa: string, mensagem: number) =>
    tasks.push(async () => {
      if (opts.deadline !== undefined && Date.now() > opts.deadline) {
        run.skipped += 1;
        return;
      }
      record(await ask(state, qs), conversa, mensagem);
    });
  for (const c of conversations) {
    for (const x of exchanges(c)) {
      run.exchanges.push(x);
      if (Object.keys(inbound).length) call(inboundState(x), inbound, x.conversa, x.mensagem);
      if (x.answeredByModel && Object.keys(reply).length) call(replyState(x), reply, x.conversa, x.mensagem);
    }
    if (Object.keys(readiness).length) call(conversationState(c), readiness, c.persona, 0);
  }
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]!();
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 1, tasks.length)) }, worker));
  return run;
};

const TITLES: Record<string, string> = {
  objecao: "Objeção da cliente",
  quer_comprar: "Ela disse que quer comprar",
  irritacao: "Cliente incomodada ou irritada",
  promete_prazo: "Malu prometeu prazo ou data",
  promete_saude: "Malu prometeu efeito no corpo ou na saúde",
  oferece_desconto: "Malu ofereceu desconto ou condição especial",
  escassez: "Malu falou de estoque acabando ou oferta terminando",
  diz_ser_pessoa: "Malu disse ou deu a entender que é pessoa",
  fala_boleto: "Malu disse que dá pra pagar no boleto (o prompt diz que não tem)",
  escolhe_horario: "Malu disse que ela escolhe o horário (o prompt diz que não se escolhe)",
  correio_na_entrega: "Malu disse que na entrega quem leva é o carteiro (o prompt diz que não vem pelo correio)",
  compra_sem_passo: "Quis comprar e não recebeu o próximo passo",
  objecao_sem_resposta: "Objeção sem resposta",
  pergunta_ignorada: "Pergunta dela sem resposta",
  gatilho_nao_usado: "Contou a ocasião e a Malu não usou",
  kit_nao_oferecido: "Falou de outra pessoa ou mais peças e o kit não veio",
  duas_perguntas: "Malu fez duas ou mais perguntas de uma vez",
  sem_proximo_passo: "Resposta sem próximo passo",
  desconfianca_sem_garantia: "Desconfiou e não ouviu garantia, pagamento na entrega ou avaliações",
  prontidao: "Prontidão no fim da conversa",
};

/** The markdown Hermes reads and the operator sees. Up to three examples per question, the cut of Malu's reply that was judged. */
export const renderJev = (run: JevRun, approved: Approved | null, meta: { conversations: number }): string => {
  const thr = (q: string) => approved?.approved[q]?.threshold ?? 0.5;
  const byQ = new Map<string, Judgment[]>();
  for (const j of run.judgments) byQ.set(j.question, [...(byQ.get(j.question) ?? []), j]);
  const ex = (j: Judgment) => run.exchanges.find((x) => x.conversa === j.conversa && x.mensagem === j.mensagem);
  const line = (j: Judgment) => {
    const x = ex(j);
    // Masked like the conversations Hermes reads (R6.3; security review of 2026-10-22): jev.md goes to the Hermes model too.
    const said = maskPii(x?.maluDepois ?? "").replace(/\s+/g, " ").slice(0, 160);
    const her = maskPii(x?.cliente ?? "").replace(/\s+/g, " ").slice(0, 120);
    return `  - ${j.conversa}, Malu ${j.mensagem}: cliente "${her}" → Malu "${said}"`;
  };
  const section = (title: string, ids: readonly string[]) => {
    const rows = ids.filter((q) => byQ.has(q)).map((q) => {
      const all = byQ.get(q)!;
      const yes = all.filter((j) => flagged(j.answer, thr(q)));
      return [`- **${TITLES[q] ?? q}** (\`${q}\`): ${yes.length} de ${all.length}`, ...yes.slice(0, 3).map(line)].join("\n");
    });
    return rows.length ? [`## ${title}`, "", ...rows, ""] : [];
  };
  const objections = (byQ.get("objecao") ?? []).map((j) => labelOf(j.answer)).filter((l) => l !== "nenhuma");
  const objCount = [...new Set(objections)].map((o) => `${o} ${objections.filter((x) => x === o).length}`).join(" · ");
  const ready = (byQ.get("prontidao") ?? []).map((j) => labelOf(j.answer) as number);
  return [
    "# O que o JEV leu nesta rodada (modo sombra)",
    "",
    "O JEV é um modelo de decisão (TypeSafe): responde perguntas fixas com probabilidade, não escreve. **Tudo aqui é suspeita a",
    "conferir lendo a conversa**, não fato: cite só o que você confirmar no texto de `conversas/`. Onde o JEV aponta promessa numa",
    "resposta que saiu, os gates de hoje a deixaram passar — **o gate tem a palavra final** até a confiabilidade do JEV ser medida.",
    "",
    `Conversas: ${meta.conversations} · trocas lidas: ${run.exchanges.length} · chamadas: ${run.calls} (falharam ${run.failed}, puladas pelo tempo ${run.skipped}) · custo US$ ${run.costUsd.toFixed(4)}` +
      ` (US$ ${(run.costUsd / Math.max(meta.conversations, 1)).toFixed(5)} por conversa)`,
    objCount ? `\nObjeções por tipo: ${objCount}` : "",
    ready.length ? `\nProntidão no fim (JEV, pergunta ainda não medida no conjunto de ouro): fria ${ready.filter((r) => r === 0).length} · morna ${ready.filter((r) => r === 1).length} · quente ${ready.filter((r) => r === 2).length}` : "",
    "",
    ...section("A cliente (analista de mensagens)", Object.keys(INBOUND)),
    ...section("Promessas que passaram pelos gates (divergência gate × JEV: o gate vale)", Object.keys(AUDIT)),
    ...section("O que a Malu deveria ter dito e não disse", Object.keys(MISSED)),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
};

/** The audit flags on replies that went out: the disagreements the operator judges (P3.2). */
export const disagreements = (run: JevRun, approved: Approved | null): Judgment[] =>
  run.judgments.filter((j) => j.question in AUDIT && flagged(j.answer, approved?.approved[j.question]?.threshold ?? 0.5));
