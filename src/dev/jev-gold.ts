/**
 * The Portuguese gold set and its scoring (P2.4, operator 2026-10-22: a question is used only if Jev gets ≥ 90% right). Pure.
 *
 * How "90%" is read: a yes/no question passes when it is right on ≥ 90% of the YES cases AND on ≥ 90% of the NO cases, with at
 * least 10 of each — overall accuracy alone would pass a question that always says "não" when "sim" is rare (a question that never
 * flags a lie would score 95% on a set with 5% of lies). The objection (choice) and the irritation (score) pass at ≥ 90% overall
 * on ≥ 30 items. A question without enough cases of each kind is "sem amostra" and is NOT approved.
 */
import type { JevAnswer } from "./jev.js";
import { AUDIT, INBOUND, MISSED, QUESTIONS_VERSION, labelOf, type Approved, type Exchange } from "./jev-questions.js";

export interface GoldItem extends Omit<Exchange, "mensagem"> {
  id: string;
  fonte: "resposta" | "rascunho_vetado";
  labels: Record<string, boolean | string | number>;
}

export const BAR = 0.9;
export const MIN_EACH = 10;
export const MIN_ITEMS = 30;

export interface QuestionScore {
  question: string;
  n: number;
  right: number;
  /** yes/no only: the cases and hits on each side. */
  yes?: { n: number; right: number };
  no?: { n: number; right: number };
  verdict: "aprovada" | "reprovada" | "sem amostra";
}

export const scoreQuestion = (question: string, pairs: ReadonlyArray<{ label: boolean | string | number; answer: JevAnswer | undefined }>, threshold = 0.5): QuestionScore => {
  const judged = pairs.filter((p) => p.answer !== undefined);
  const hit = (p: (typeof judged)[number]) => labelOf(p.answer!, threshold) === p.label;
  const right = judged.filter(hit).length;
  const kind = judged[0]?.answer?.type;
  if (kind === "noul" || (kind === undefined && typeof pairs[0]?.label === "boolean")) {
    const side = (v: boolean) => {
      const xs = judged.filter((p) => p.label === v);
      return { n: xs.length, right: xs.filter(hit).length };
    };
    const yes = side(true);
    const no = side(false);
    const verdict =
      yes.n < MIN_EACH || no.n < MIN_EACH ? "sem amostra" : yes.right / yes.n >= BAR && no.right / no.n >= BAR ? "aprovada" : "reprovada";
    return { question, n: judged.length, right, yes, no, verdict };
  }
  return { question, n: judged.length, right, verdict: judged.length < MIN_ITEMS ? "sem amostra" : right / judged.length >= BAR ? "aprovada" : "reprovada" };
};

/** Every question of the families measured on the gold set; `answers[itemId][question]` is what Jev said. */
export const scoreGold = (items: readonly GoldItem[], answers: Readonly<Record<string, Readonly<Record<string, JevAnswer>>>>): QuestionScore[] =>
  [...Object.keys(INBOUND), ...Object.keys(AUDIT), ...Object.keys(MISSED)].map((q) =>
    scoreQuestion(q, items.filter((i) => q in i.labels).map((i) => ({ label: i.labels[q]!, answer: answers[i.id]?.[q] }))),
  );

/**
 * Questions the operator approved below the bar, with the measure they saw: they stay approved while the gold set measures them
 * (never when "sem amostra"), and the report says so. `objecao`: 86% after the labels followed one rule (operator, 2026-10-23).
 */
export const OPERATOR_APPROVED: Readonly<Record<string, string>> = { objecao: "operador, 2026-10-23, com 86%" };

const passes = (s: QuestionScore) => s.verdict === "aprovada" || (s.verdict === "reprovada" && s.question in OPERATOR_APPROVED);

export const approvedFile = (scores: readonly QuestionScore[], model: string, at: string): Approved => ({
  model,
  questionsVersion: QUESTIONS_VERSION,
  measuredAt: at,
  approved: Object.fromEntries(scores.filter(passes).map((s) => [s.question, { threshold: 0.5, accuracy: s.n ? s.right / s.n : 0, n: s.n }])),
});

export const renderGold = (scores: readonly QuestionScore[], meta: { model: string; items: number; costUsd: number }): string => {
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
  return [
    `# JEV em português — conjunto de ouro (${meta.items} itens, ${meta.model}, US$ ${meta.costUsd.toFixed(4)})`,
    "",
    "Barra (operador, P2.4): 90%. Pergunta de sim/não: 90% nos casos \"sim\" E 90% nos casos \"não\", com pelo menos 10 de cada.",
    "",
    "| Pergunta | Itens | Acerto | Acerto no \"sim\" | Acerto no \"não\" | Veredito |",
    "|---|---|---|---|---|---|",
    ...scores.map((s) => `| \`${s.question}\` | ${s.n} | ${pct(s.right, s.n)} | ${s.yes ? `${pct(s.yes.right, s.yes.n)} (${s.yes.n})` : "—"} | ${s.no ? `${pct(s.no.right, s.no.n)} (${s.no.n})` : "—"} | ${s.verdict === "reprovada" && s.question in OPERATOR_APPROVED ? `aprovada pelo operador (${OPERATOR_APPROVED[s.question]})` : s.verdict} |`),
  ].join("\n");
};
