/**
 * Archives a real test round into the repository, then (only with --delete) deletes the test numbers so the next
 * round starts from zero (operator, 2026-10-13). The analysis is written by hand into the generated Markdown.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… NODE_USE_ENV_PROXY=1 pnpm dev:arquivar-teste --round=2026-10-20-r1 \
 *     --tester="Rodrigo:5511999999999" --tester="Sócio:55119…" --tester="Mãe:55119…" [--script=<arquivo.md>] [--delete]
 *
 * Writes docs/agente-ia/10-auditoria/testes-reais/<round>.md and <round>.json. --delete runs only after both files are
 * written and read back, and deletes each lead by id (cascade: conversations, messages, outcomes, traces, calls,
 * followups, orders). Reads and deletes go through the management API (`database/query`), the same credential as
 * `pnpm deploy:turn`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { maskRows, phoneTail, renderRound, type TesterRows } from "./archive-test-core.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const round = flag("round");
const testers = args.filter((a) => a.startsWith("--tester=")).map((a) => {
  const [label, phone] = a.slice("--tester=".length).split(":");
  return { label: label!, phone: (phone ?? "").replace(/\D/g, "") };
});
const scriptFile = flag("script");
const remove = args.includes("--delete");
if (!round || !/^[\w.-]+$/.test(round) || testers.length === 0 || testers.some((t) => !t.label || t.phone.length < 10))
  throw new Error('uso: --round=<nome> --tester="Rótulo:55DDDNÚMERO" (repetível) [--script=arquivo.md] [--delete]');

const REF = process.env.SUPABASE_PROJECT_REF ?? "hbmkgakzrqmdlsvszjeo";
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
const sql = async <T>(query: string, parameters: unknown[] = []): Promise<T[]> => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers, body: JSON.stringify({ query, parameters }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`database/query: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T[];
};

const rowsOf = async (label: string, phone: string): Promise<TesterRows | null> => {
  const [lead] = await sql<TesterRows["lead"]>("select * from leads where phone = $1", [phone]);
  if (!lead) return null;
  const byLead = (table: string, cols: string) =>
    sql<never>(`select ${cols} from ${table} where conversation_id in (select id from conversations where lead_id = $1) order by created_at`, [lead.id]);
  return {
    label,
    phone,
    lead,
    conversations: await sql("select id, stage, created_at from conversations where lead_id = $1 order by created_at", [lead.id]),
    messages: await byLead("messages", "conversation_id, direction, body, created_at"),
    outcomes: await byLead("turn_outcomes", "conversation_id, outcome, reason, rewrites, cost_brl, duration_ms, agent_version, created_at"),
    vetoes: await byLead("gate_traces", "conversation_id, gate, verdict, detail, created_at"),
    followups: await sql("select conversation_id, kind, status, run_at, sent_at from followups where conversation_id in (select id from conversations where lead_id = $1) order by run_at", [lead.id]),
    orders: await sql("select status, payment_method, size, units, amount_brl, created_at from orders where lead_id = $1 order by created_at", [lead.id]),
  };
};

const found: TesterRows[] = [];
for (const t of testers) {
  const rows = await rowsOf(t.label, t.phone);
  if (rows) found.push(rows);
  else console.log(`sem lead para ${t.label} (${phoneTail(t.phone)}) — nada a arquivar`);
}
if (found.length === 0) throw new Error("nenhum lead encontrado: nada arquivado, nada apagado");

const dir = "docs/agente-ia/10-auditoria/testes-reais";
mkdirSync(dir, { recursive: true });
const md = `${dir}/${round}.md`;
const json = `${dir}/${round}.json`;
// With --delete the round was archived and analysed before: the file is checked, never rewritten (the analysis is in it).
if (!remove) {
  if (existsSync(md)) throw new Error(`${md} já existe: escolha outro --round (a análise escrita nele não pode ser sobrescrita)`);
  const scripts = scriptFile ? readFileSync(scriptFile, "utf8") : null;
  writeFileSync(md, renderRound(round, found, scripts));
  // The raw rows, without identity: the lead's identity, address, name and phone stay out, and the free text is masked
  // as in the Markdown (a checkout link in a message carries her name and CPF).
  writeFileSync(json, JSON.stringify(found.map(maskRows), null, 2) + "\n");
} else if (!existsSync(md) || !existsSync(json)) {
  throw new Error(`${md} não existe: arquive (sem --delete) e escreva a análise antes de apagar`);
}
const back = readFileSync(md, "utf8");
if (!found.every((r) => back.includes(phoneTail(r.phone)))) throw new Error(`${md} não confere na releitura: nada apagado`);
console.log(`${remove ? "conferido" : "arquivado"}: ${md} e ${json} (${found.length} testador(es))`);

if (!remove) {
  console.log("sem --delete: os números continuam no banco. Rode de novo com --delete depois de commitar a análise.");
} else {
  for (const r of found) {
    const gone = await sql<{ id: string }>("delete from leads where id = $1 and phone = $2 returning id", [r.lead.id, r.phone]);
    console.log(`${r.label} (${phoneTail(r.phone)}): ${gone.length ? "apagado" : "NÃO apagado"}`);
  }
}
