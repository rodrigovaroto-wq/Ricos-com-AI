/**
 * The model eval table (plan v2, phase 4.1): one row per persona, the numbers the rubric
 * asks for — never an Intelligence Index. The operator approves the v33 model with this
 * table in hand (4.3), and Hermes reads the same round for what numbers cannot see.
 *
 *   pnpm dev:eval data/persona-runs/<round>
 *
 * Writes `_eval.md` next to the transcripts. Reads what the runner recorded from the
 * database for each conversation: `turnOutcomes` (outcome and rewrites per turn) and
 * `gateTraces` (every verdict), plus the transcript for the first checkout link.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RunFile {
  persona: string;
  transcript: Array<{ from: string; text?: string; status?: string }>;
  endReason?: string;
  stage?: string | null;
  costBrl?: number | null;
  turnOutcomes?: Array<{ outcome: string; rewrites: number | null }>;
  gateTraces?: Array<{ gate: string; verdict: string }>;
}

export interface EvalRow {
  persona: string;
  replies: number;
  fallbacks: number;
  rewritesPerReply: number;
  topBlocks: string;
  costBrl: number;
  repliesToLink: number | null;
  stage: string;
  end: string;
}

const LINK = /https:\/\/(?:entrega\.logzz\.com\.br\/pay|app\.coinzz\.com\.br\/checkout)\S*/;

export function evalRow(r: RunFile): EvalRow {
  const replies = r.transcript.filter((e) => e.from !== "persona" && e.status !== "welcomed");
  const outcomes = r.turnOutcomes ?? [];
  const blocks = new Map<string, number>();
  for (const t of r.gateTraces ?? []) if (t.verdict === "block") blocks.set(t.gate, (blocks.get(t.gate) ?? 0) + 1);
  const linkAt = replies.findIndex((e) => LINK.test(e.text ?? ""));
  return {
    persona: r.persona.replace(/^persona-/, ""),
    replies: replies.length,
    fallbacks: outcomes.filter((o) => o.outcome === "fallback").length,
    rewritesPerReply: replies.length ? +(outcomes.reduce((s, o) => s + (o.rewrites ?? 0), 0) / replies.length).toFixed(2) : 0,
    topBlocks: [...blocks].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${g} ×${n}`).join(", ") || "—",
    costBrl: +(r.costBrl ?? 0).toFixed(4),
    repliesToLink: linkAt === -1 ? null : linkAt + 1,
    stage: r.stage ?? "—",
    end: r.endReason ?? "—",
  };
}

export function renderEval(title: string, rows: EvalRow[]): string {
  const total = (k: "replies" | "fallbacks") => rows.reduce((s, r) => s + r[k], 0);
  const cost = rows.reduce((s, r) => s + r.costBrl, 0);
  const withLink = rows.filter((r) => r.repliesToLink != null);
  return [
    `# Eval do modelo — ${title}`,
    "",
    `${rows.length} conversas · ${total("replies")} respostas · **respostas prontas ${total("fallbacks")}** ` +
      `(${total("replies") ? ((total("fallbacks") / total("replies")) * 100).toFixed(1) : 0}%) · ` +
      `custo médio por conversa R$ ${rows.length ? (cost / rows.length).toFixed(4) : "0"} · ` +
      `link em ${withLink.length}/${rows.length} conversas` +
      (withLink.length ? `, mediana de ${median(withLink.map((r) => r.repliesToLink!))} respostas até ele` : ""),
    "",
    "| Persona | Respostas | Prontas | Reescritas/resposta | Gates que mais vetaram | Custo (R$) | Respostas até o link | Estágio | Fim |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.persona} | ${r.replies} | ${r.fallbacks} | ${r.rewritesPerReply} | ${r.topBlocks} | ${r.costBrl.toFixed(4)} | ${r.repliesToLink ?? "—"} | ${r.stage} | ${r.end} |`,
    ),
    "",
  ].join("\n");
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

if (process.argv[1]?.endsWith("persona-eval.ts")) {
  const dir = process.argv[2];
  if (!dir) throw new Error("uso: pnpm dev:eval data/persona-runs/<pasta>");
  const rows = readdirSync(dir)
    .filter((f) => /^persona-.+\.json$/.test(f))
    .map((f) => evalRow(JSON.parse(readFileSync(join(dir, f), "utf8")) as RunFile))
    .sort((a, b) => a.persona.localeCompare(b.persona));
  const md = renderEval(dir, rows);
  writeFileSync(join(dir, "_eval.md"), md);
  console.log(md);
}
