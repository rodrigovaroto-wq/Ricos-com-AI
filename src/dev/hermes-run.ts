/**
 * Runs Hermes, the offline supervisor (R5.7, R6.2, R11.2, R11.6), over a batch of
 * conversations and turns what it proposes into rows for the operator to decide.
 *
 *   pnpm hermes --source=personas:data/persona-runs/<dir>     # synthetic, for testing
 *   pnpm hermes --source=supabase --write-db                  # production, every 50 leads
 *
 * Options: --model=<id> (default muse-spark-1.3; the -contributor variant is refused on
 * the supabase source, because Meta trains on it and these are real customers) ·
 * --limit=N (supabase: last N conversations, default 50) · --write-db (insert into
 * hermes_runs and hermes_proposals) · --only-if-due (supabase: exit quietly unless
 * `hermes_backlog.due`).
 *
 * Environment: HERMES_BIN (default `hermes`), MODEL_API_KEY or META_API_KEY, and for the
 * supabase source SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. In the Claude Code cloud
 * container the proxy injects the Meta and Supabase keys; pass NODE_USE_ENV_PROXY=1.
 *
 * THE BARRIER (R11.6). Hermes runs with the `file`, `skills` and `todo` toolsets only —
 * no terminal, no web — in a throwaway copy of the evidence, with no Supabase key in its
 * environment. It can only write `propostas.json` there. This script validates every
 * proposal (quotes must be verbatim, nothing on the "do not" list) and writes the
 * survivors with status 'proposed'. Nothing Hermes writes reaches production: accepting a
 * proposal is opening a registry entry, by a person.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runGates } from "../agent/guardrails.js";
import { ctx as fixtureCtx } from "../../tests/fixtures.js";
import { annotateWithGates, checkProposals, renderConversation, renderLedger, renderProposals, type LedgerRow } from "./hermes-core.js";
import { costBrl, PRICES } from "../llm/pricing.js";
import { renderScorecard, scoreRun, type Conversation } from "./persona-scorecard.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const source = flag("source") ?? "";
const model = flag("model") ?? process.env.HERMES_MODEL ?? "muse-spark-1.3";
const limit = Number(flag("limit") ?? 50);
const writeDb = args.includes("--write-db");
const onlyIfDue = args.includes("--only-if-due");
const HERMES = process.env.HERMES_BIN ?? "hermes";
const REPO = resolve(".");

if (!/^personas:.+|^supabase$/.test(source)) throw new Error("uso: pnpm hermes --source=personas:<pasta> | --source=supabase");
if (source === "supabase" && model.includes("contributor"))
  throw new Error("a variante -contributor cede os dados para treino da Meta: proibida sobre conversa real (LGPD)");

// ── Supabase (production) ─────────────────────────────────────────────────────────────
const SB = process.env.SUPABASE_URL ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!res.ok) throw new Error(`supabase ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface Row { id: string; lead_id: string; conversation_id: string; direction: string; body: string; created_at: string; gate: string; verdict: string; detail: string | null }

async function fromSupabase(): Promise<{ conversations: Conversation[]; leads: number }> {
  const convs = await rest<Pick<Row, "id" | "lead_id">[]>(`conversations?select=id,lead_id&order=created_at.desc&limit=${limit}`);
  if (convs.length === 0) return { conversations: [], leads: 0 };
  const ids = convs.map((c) => c.id).join(",");
  const msgs = await rest<Row[]>(`messages?select=conversation_id,direction,body,created_at&conversation_id=in.(${ids})&order=created_at`);
  const traces = await rest<Row[]>(`gate_traces?select=conversation_id,gate,verdict,detail,created_at&verdict=eq.block&conversation_id=in.(${ids})&order=created_at`);
  const conversations = convs.map((c): Conversation => {
    const mine = msgs.filter((m) => m.conversation_id === c.id);
    let pending = traces.filter((t) => t.conversation_id === c.id);
    return {
      persona: `conversa-${c.id.slice(0, 8)}`,
      transcript: mine.map((m) => {
        if (m.direction === "inbound") return { from: "persona", text: m.body };
        // gate_traces carry no message id: a veto belongs to the next reply that went out.
        const vetoes = pending.filter((t) => t.created_at <= m.created_at).map((t) => ({ gate: t.gate, detail: t.detail }));
        pending = pending.filter((t) => t.created_at > m.created_at);
        return { from: "valen", text: m.body, vetoes };
      }),
    };
  });
  return { conversations, leads: new Set(convs.map((c) => c.lead_id)).size };
}

function fromPersonas(dir: string): { conversations: Conversation[]; leads: number } {
  const files = readdirSync(dir).filter((f) => /^persona-.+\.json$/.test(f));
  const conversations = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Conversation);
  return { conversations, leads: conversations.length };
}

// ── The run ───────────────────────────────────────────────────────────────────────────
if (onlyIfDue && source === "supabase") {
  const [b] = await rest<Array<{ due: boolean; leads_since_last_run: number }>>("hermes_backlog?select=due,leads_since_last_run");
  if (!b?.due) {
    console.log(`hermes: ${b?.leads_since_last_run ?? 0} leads desde a última execução — espera 50 (R6.2)`);
    process.exit(0);
  }
}

const { conversations, leads } = source === "supabase" ? await fromSupabase() : fromPersonas(source.slice("personas:".length));
if (conversations.length === 0) {
  console.log("hermes: nenhuma conversa para ler");
  process.exit(0);
}

const bundle = mkdtempSync(join(tmpdir(), "hermes-bundle-"));
mkdirSync(join(bundle, "conversas"));
const rendered = new Map<string, string>();
for (const c of conversations) {
  const md = renderConversation(c);
  rendered.set(c.persona, md);
  writeFileSync(join(bundle, "conversas", `${c.persona}.md`), md);
}
writeFileSync(join(bundle, "placar.md"), renderScorecard(source, scoreRun(conversations)));
cpSync(join(REPO, "docs/agente-ia/08-mudancas/registro.md"), join(bundle, "registro.md"));
// The ledger (operator, 2026-09-25): every earlier decision and its reason, so a refused
// idea is not proposed again. Read from Supabase whenever it is reachable — persona runs
// included, because the lessons are the same; without it the file says so.
const ledger: LedgerRow[] = SB
  ? await rest<LedgerRow[]>(
      "hermes_proposals?select=code,target,rationale,status,decision_reason,execution_ref,result,created_at,decided_at&order=created_at.desc&limit=200",
    )
  : [];
writeFileSync(join(bundle, "decisoes.md"), renderLedger(ledger));
const claude = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
writeFileSync(
  join(bundle, "regras.md"),
  (claude.match(/\*\*Cinco coisas[\s\S]*?\n\n\*\*A Evaluation Layer/)?.[0] ?? "") +
    "\n\nR13.6 (operador): escassez e prova social inventadas estão recusadas.\n",
);

const home = mkdtempSync(join(tmpdir(), "hermes-home-"));
// Hermes refuses a data-training tier unattended. Only synthetic persona runs may opt in
// (the supabase source already refused it above): no real customer is in the bundle.
const allowTraining = model.includes("contributor") && source.startsWith("personas:");
writeFileSync(
  join(home, "config.yaml"),
  readFileSync(join(REPO, "hermes/config.yaml"), "utf8").replace(/default: "[^"]+"/, `default: "${model}"`) +
    (allowTraining ? "\nsecurity:\n  allow_data_training_tiers_noninteractive: true\n" : ""),
);
cpSync(join(REPO, "hermes/skills"), join(home, "skills"), { recursive: true });

const prompt =
  "Use a skill encorpa-supervisor. Leia decisoes.md primeiro, depois placar.md, regras.md, registro.md e todos os arquivos em conversas/, " +
  "e escreva propostas.json nesta pasta, exatamente no formato da skill. Trecho de evidência só copiado, nunca resumido.";
const usageFile = join(bundle, "usage.json");
const started = Date.now();
try {
  execFileSync(HERMES, ["-z", prompt, "-m", model, "--provider", "meta-ai", "-t", "file,skills,todo", "--skills", "encorpa-supervisor", "--in", bundle, "--usage-file", usageFile, "--ignore-rules"], {
    env: { ...process.env, HERMES_HOME: home, SUPABASE_SERVICE_ROLE_KEY: "", MODEL_API_KEY: process.env.MODEL_API_KEY ?? process.env.META_API_KEY ?? "" },
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 20 * 60_000,
  });
} catch (e) {
  console.error(`hermes falhou: ${(e as Error).message}`);
}
const usage = existsSync(usageFile) ? (JSON.parse(readFileSync(usageFile, "utf8")) as Record<string, unknown>) : {};
const out = join(bundle, "propostas.json");
if (!existsSync(out)) throw new Error(`hermes não escreveu propostas.json (pacote em ${bundle})`);
const raw = JSON.parse(readFileSync(out, "utf8")) as { resumo?: string };
// Today's gates, under the test config the gate diff uses (the production secret is not
// readable), on both payment paths: a sentence counts as refused if either path refuses it.
const blockedBy = (text: string) => [
  ...new Set(
    (["cod", "prepay"] as const).flatMap((paymentPath) =>
      runGates(text, fixtureCtx({ paymentPath, regionKnown: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate),
    ),
  ),
];
const checked = annotateWithGates(checkProposals(raw, rendered), blockedBy);
const ok = checked.filter((c) => c.ok);

const day = new Date().toISOString().slice(0, 10);
const label = source === "supabase" ? "producao" : source.split("/").pop()!;
const title = `Propostas do Hermes — ${day} — ${label}`;
// Hermes does not price Muse (it reports 0 with cost_status "unknown"), so the cost comes
// from this repository's own price table. Hermes counts cache reads apart from input.
const tok = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
const costUsd =
  PRICES[model] && tok("total_tokens") > 0
    ? costBrl(model, { inputTokens: tok("input_tokens") + tok("cache_read_tokens"), cachedTokens: tok("cache_read_tokens"), outputTokens: tok("output_tokens") }, 1)
    : null;
const md =
  renderProposals(title, raw.resumo ?? "", checked) +
  `\n---\nModelo ${model} · ${conversations.length} conversas · ${Math.round((Date.now() - started) / 1000)} s · ` +
  `custo US$ ${costUsd != null ? costUsd.toFixed(4) : "?"} (${tok("total_tokens")} tokens, ${tok("api_calls")} chamadas)\n`;
const dest = join(REPO, "docs/agente-ia/08-mudancas/propostas");
mkdirSync(dest, { recursive: true });
const file = join(dest, `${day}-${label}.md`);
writeFileSync(file, md);
writeFileSync(file.replace(/\.md$/, ".json"), JSON.stringify({ resumo: raw.resumo ?? "", checked, usage, costUsd }, null, 2));
console.log(md);
console.log(`\nescrito em ${file}`);

if (writeDb) {
  const [run] = await rest<Array<{ id: string }>>("hermes_runs", {
    method: "POST",
    body: JSON.stringify({ source, model, conversations_seen: conversations.length, leads_seen: leads, proposals_ok: ok.length, proposals_rejected: checked.length - ok.length, cost_usd: costUsd }),
  });
  if (ok.length)
    await rest("hermes_proposals", {
      method: "POST",
      body: JSON.stringify(
        ok.map(({ proposal: p }, i) => ({
          run_id: run!.id,
          // The code the operator reads in the document (renderProposals numbers the valid
          // ones), with the day: H-numbers restart every run.
          code: `${day} H-${i + 1}`,
          target: p.alvo,
          rationale: `${p.o_que} — ${p.por_que}`,
          evidence: { ...p, source },
          status: "proposed",
          leads_seen: leads,
        })),
      ),
    });
  console.log(`hermes_runs ${run!.id}: ${ok.length} propostas gravadas como 'proposed'`);
}
