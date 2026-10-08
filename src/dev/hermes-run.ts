/**
 * Runs Hermes, the offline supervisor (R5.7, R6.2, R11.2, R11.6), over a batch of
 * conversations and turns what it proposes into rows for the operator to decide.
 *
 *   pnpm hermes --source=personas:data/persona-runs/<dir>     # synthetic, for testing
 *   pnpm hermes --source=supabase --write-db                  # production, every 50 leads
 *
 * Options: --model=<id> (default muse-spark-1.3; the -contributor variant is refused on
 * the supabase source, because Meta trains on it and these are real customers) ·
 * --limit=N (supabase: N conversations, default 50, picked by `hermes_sample` — flagged first,
 * then a control of plain ones) · --write-db (insert into hermes_runs and hermes_proposals,
 * and measure every published proposal's check before and after it went live) ·
 * --only-if-due (supabase: exit quietly unless `hermes_backlog.due`).
 *
 * Environment: HERMES_BIN (default `hermes`), MODEL_API_KEY or META_API_KEY, and for the
 * supabase source SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. HERMES_MAX_USD (optional): a run
 * that costs more fails the job after writing — absent means no ceiling, as before. In the Claude Code cloud
 * container the proxy injects the Meta and Supabase keys; pass NODE_USE_ENV_PROXY=1.
 *
 * THE BARRIER (R11.6). Hermes runs with the `file`, `skills` and `todo` toolsets only —
 * no terminal, no web — in a throwaway copy of the evidence, started there (`cwd`), with an
 * environment of PATH, HOME, its own home, the model key and the proxy settings only. It can only write `propostas.json` there. This script validates every
 * proposal (quotes must be verbatim, nothing on the "do not" list) and writes the
 * survivors with status 'proposed'. Nothing Hermes writes reaches production: accepting a
 * proposal is opening a registry entry, by a person.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gateBriefing, runGates } from "../agent/guardrails.js";
import { systemPrompt } from "../agent/prompt.js";
import { config as fixtureConfig, ctx as fixtureCtx } from "../../tests/fixtures.js";
import {
  annotateWithGates,
  checkModelReverts,
  checkProposals,
  discardAlreadyVetoed,
  holdForRevert,
  measureEffect,
  pickSample,
  proposalCode,
  renderNumbers,
  renderRevert,
  REVERT_CODE,
  revertCheck,
  revertPending,
  revertRationale,
  revertToWrite,
  type Revert,
  scrubSecrets,
  storedEvidence,
  withMeasure,
  type SampleRow,
  renderConversation,
  renderLedger,
  renderProposals,
  rowsToConversations,
  unquote,
  withoutQuotes,
  type LedgerRow,
  type SupabaseRows,
  type AgentVersionRow,
} from "./hermes-core.js";
import { SYNTHETIC_PHONE_PREFIX } from "./persona-run-core.js";
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

/** Every row, page by page: PostgREST caps a response (1000 on Supabase) without saying so. */
async function restAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const page = await rest<T[]>(path, { headers: { "Range-Unit": "items", Range: `${out.length}-${out.length + 999}` } });
    if (page.length === 0) return out;
    out.push(...page);
  }
}

type ConvRow = SupabaseRows["conversations"][number];
const CONV = "id,lead_id,welcomed_at,cost_brl,leads!inner(phone)";
// Persona conversations are filtered in every query too, so a limit counts customers only;
// rowsToConversations filters again, and is the tested half.
const REAL = `leads.phone=not.like.${SYNTHETIC_PHONE_PREFIX}*`;

async function load(convs: ConvRow[]): Promise<{ conversations: Conversation[]; leads: number; ids: string[] }> {
  if (convs.length === 0) return { conversations: [], leads: 0, ids: [] };
  const ids = convs.map((c) => c.id);
  const inIds = `conversation_id=in.(${ids.join(",")})`;
  const [messages, traces, outcomes] = await Promise.all([
    restAll<SupabaseRows["messages"][number]>(`messages?select=conversation_id,direction,body,created_at&${inIds}&order=created_at,id`),
    restAll<SupabaseRows["traces"][number]>(`gate_traces?select=conversation_id,gate,detail,created_at&verdict=eq.block&${inIds}&order=created_at,id`),
    restAll<SupabaseRows["outcomes"][number]>(`turn_outcomes?select=conversation_id,outcome,created_at&${inIds}&order=created_at,id`),
  ]);
  return { ...rowsToConversations({ conversations: convs, messages, traces, outcomes }), ids };
}

/** Where to look (item 3 of the analysis): conversations with activity since the last
 * production run STARTED (a conversation that began before it and got a new reply after it
 * is read; one that arrived while it ran is not lost), flagged first, plus a control — all
 * of them when there was no run yet. */
async function fromSupabase(lastRunStart: string | null) {
  const since = lastRunStart ? `&last_activity=gt.${encodeURIComponent(lastRunStart)}` : "";
  const sample = await restAll<SampleRow>(`hermes_sample?select=*${since}&order=created_at.desc,conversation_id`);
  const ids = pickSample(sample, limit);
  if (ids.length === 0) return { conversations: [], leads: 0, ids: [] };
  const loaded = await load(await restAll<ConvRow>(`conversations?select=${CONV}&${REAL}&id=in.(${ids.join(",")})&order=created_at,id`));
  // The version each conversation ran under (L3 item 8): Hermes judges an undue premise
  // against the previous version. turn_outcomes_conversation_idx (conversation_id,
  // created_at) serves the `in` and the order restAll pages by; before
  // migration 0021 the column does not exist and the conversations go without it.
  const tagged = await restAll<{ conversation_id: string; agent_version: number }>(
    `turn_outcomes?select=conversation_id,agent_version&conversation_id=in.(${loaded.ids.join(",")})&agent_version=not.is.null&order=conversation_id,created_at,id`,
  ).catch(() => []);
  const versions = new Map<string, number[]>();
  for (const t of tagged) {
    const label = `conversa-${t.conversation_id.slice(0, 8)}`;
    versions.set(label, [...new Set([...(versions.get(label) ?? []), t.agent_version])].sort((a, b) => a - b));
  }
  return { ...loaded, versions };
}

function fromPersonas(dir: string): { conversations: Conversation[]; leads: number } {
  const files = readdirSync(dir).filter((f) => /^persona-.+\.json$/.test(f));
  const conversations = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Conversation);
  return { conversations, leads: conversations.length };
}

// ── The run ───────────────────────────────────────────────────────────────────────────
const backlog =
  source === "supabase"
    ? (await rest<Array<{ due: boolean; leads_since_last_run: number; last_run_at: string | null }>>("hermes_backlog?select=due,leads_since_last_run,last_run_at"))[0]
    : undefined;
if (onlyIfDue && source === "supabase" && !backlog?.due) {
  console.log(`hermes: ${backlog?.leads_since_last_run ?? 0} leads desde a última execução — espera 50 (R6.2)`);
  process.exit(0);
}

const startedAt = new Date().toISOString();
const lastRunStart =
  source === "supabase"
    ? ((r) => r?.started_at ?? r?.created_at ?? null)(
        (await rest<Array<{ started_at: string | null; created_at: string }>>("hermes_runs?select=started_at,created_at&source=eq.supabase&order=created_at.desc&limit=1"))[0],
      )
    : null;
const { conversations, leads, ids: conversationIds, versions } =
  source === "supabase"
    ? { versions: new Map<string, number[]>(), ...(await fromSupabase(lastRunStart)) }
    : { ...fromPersonas(source.slice("personas:".length)), ids: [] as string[], versions: new Map<string, number[]>() };
if (conversations.length === 0) {
  console.log("hermes: nenhuma conversa para ler");
  process.exit(0);
}

const bundle = mkdtempSync(join(tmpdir(), "hermes-bundle-"));
mkdirSync(join(bundle, "conversas"));
const rendered = new Map<string, string>();
for (const c of conversations) {
  const md = renderConversation(c, versions.get(c.persona));
  rendered.set(c.persona, md);
  writeFileSync(join(bundle, "conversas", `${c.persona}.md`), md);
}
writeFileSync(join(bundle, "placar.md"), renderScorecard(source, scoreRun(conversations)));
// The rules a lie is judged against: the prompt Malu reads, under the test config the gates
// below use too (the production secret is not readable). A lie proposal quotes its line.
const promptText = systemPrompt(fixtureConfig, gateBriefing(fixtureConfig), null);
writeFileSync(join(bundle, "prompt.md"), `# O prompt da Malu (config de teste)\n\n${promptText}\n`);
// Counts and rates come from the evaluation views, never from the model (item 4).
let revert: Revert | null = null;
let onAir: number | null = null;
if (SB) {
  const from = (lastRunStart ?? new Date(Date.now() - 14 * 86_400_000).toISOString()).slice(0, 10);
  // Until the operator applies 0021 these two do not exist: the run goes on without them.
  const beforeMigration = <T>(e: Error): T[] => (console.warn(`hermes: versão da Malu indisponível (${e.message.slice(0, 120)})`), []);
  const [outcomesByDay, blocksByDay, outcomesByVersion, [latestVersion]] = await Promise.all([
    restAll<Record<string, unknown>>(`eval_turn_outcomes?select=*&day=gte.${from}&order=day`),
    restAll<Record<string, unknown>>(`eval_gate_blocks?select=*&day=gte.${from}&blocks=gt.0&order=day,gate`),
    // The last ten versions whole, not the period: the rollback rule compares a version with the one before it.
    rest<Record<string, unknown>[]>("eval_version_outcomes?select=*&order=agent_version.desc.nullslast&limit=10").catch(beforeMigration<Record<string, unknown>>),
    rest<AgentVersionRow[]>("agent_versions?select=*&order=version.desc&limit=1").catch(beforeMigration<AgentVersionRow>),
  ]);
  writeFileSync(join(bundle, "numeros.md"), renderNumbers(outcomesByDay, blocksByDay, outcomesByVersion, latestVersion ?? null));
  // L3 item 8: handoff worse under the version on air → revert it. Production runs only: a
  // persona round never writes a revert of what real customers ran.
  if (source === "supabase") {
    revert = revertCheck(outcomesByVersion, latestVersion ?? null);
    onAir = latestVersion?.version ?? null;
  }
} else writeFileSync(join(bundle, "numeros.md"), "# Números do período\n\n(rodada de personas sem banco: use só placar.md)\n");
cpSync(join(REPO, "docs/agente-ia/08-mudancas/registro.md"), join(bundle, "registro.md"));
// The real cases already audited and what fixed them (operator, 2026-10-08): Hermes's initial history.
cpSync(join(REPO, "hermes/historico-inicial.md"), join(bundle, "historico.md"));
// The ledger (operator, 2026-09-25): every earlier decision and its reason, so a refused
// idea is not proposed again. Read from Supabase whenever it is reachable — persona runs
// included, because the lessons are the same; without it the file says so.
const ledger: LedgerRow[] = SB
  ? await rest<LedgerRow[]>(
      "hermes_proposals?select=code,target,rationale,status,decision_reason,execution_ref,result,created_at,decided_at&order=created_at.desc&limit=200",
    )
  : [];
writeFileSync(join(bundle, "decisoes.md"), renderLedger(ledger));
// One revert per version; while one is pending no other proposal is written (L3 item 8).
const revertNow = revertToWrite(revert, ledger);
const holding = revertPending(ledger, revertNow !== null);
writeFileSync(join(bundle, "reverter.md"), renderRevert(revertNow, holding));
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
  "Use a skill encorpa-supervisor. Leia reverter.md primeiro, depois decisoes.md, historico.md, placar.md, numeros.md, prompt.md, regras.md, registro.md e todos os arquivos em conversas/, " +
  "e escreva propostas.json nesta pasta, exatamente no formato da skill. Trecho de evidência só copiado, nunca resumido.";
const usageFile = join(bundle, "usage.json");
const started = Date.now();
try {
  execFileSync(HERMES, ["-z", prompt, "-m", model, "--provider", "meta-ai", "-t", "file,skills,todo", "--skills", "encorpa-supervisor", "--in", bundle, "--usage-file", usageFile, "--ignore-rules"], {
    // Started inside the bundle, and nothing of this process's environment but what it needs:
    // Hermes reads customer text that may carry instructions (security review, 2026-09-29).
    cwd: bundle,
    env: {
      ...Object.fromEntries(
        ["PATH", "HOME", "LANG", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"]
          .filter((k) => process.env[k] !== undefined)
          .map((k) => [k, process.env[k]!]),
      ),
      HERMES_HOME: home,
      MODEL_API_KEY: process.env.MODEL_API_KEY ?? process.env.META_API_KEY ?? "",
    },
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
// A model-written revert passes the bar of the deterministic one: the version on air, one
// per version, none while one is pending or written by this run (revertNow).
const checked = holdForRevert(
  checkModelReverts(discardAlreadyVetoed(annotateWithGates(checkProposals(raw, rendered, promptText), blockedBy)), onAir, ledger, revertNow),
  holding,
);
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
// A production run's document goes to git through hermes.yml's PR, and git never expires:
// no customer excerpt in it (LGPD, R6.3). The originals stay in hermes_proposals (90 days).
const production = source === "supabase";
const published = production ? withoutQuotes(checked) : checked;
const resumo = production ? String(unquote(raw.resumo ?? "")) : (raw.resumo ?? "");
const skillSha = createHash("sha256").update(readFileSync(join(REPO, "hermes/skills/encorpa-supervisor/SKILL.md"))).digest("hex").slice(0, 12);
const commitSha = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const md = scrubSecrets(
  renderProposals(title, resumo, published) +
    `\n---\nModelo ${model} · skill ${skillSha} · commit ${commitSha.slice(0, 12)} · ${conversations.length} conversas · ${Math.round((Date.now() - started) / 1000)} s · ` +
    `custo US$ ${costUsd != null ? costUsd.toFixed(4) : "?"} (${tok("total_tokens")} tokens, ${tok("api_calls")} chamadas)\n`,
);
const dest = join(REPO, "docs/agente-ia/08-mudancas/propostas");
mkdirSync(dest, { recursive: true });
const file = join(dest, `${day}-${label}.md`);
writeFileSync(file, md);
writeFileSync(file.replace(/\.md$/, ".json"), scrubSecrets(JSON.stringify({ resumo, checked: published, usage, costUsd }, null, 2)));
console.log(md);
console.log(`\nescrito em ${file}`);

if (writeDb) {
  const [run] = await rest<Array<{ id: string }>>("hermes_runs", {
    method: "POST",
    body: JSON.stringify({
      source,
      model,
      conversations_seen: conversations.length,
      leads_seen: leads,
      proposals_ok: ok.length,
      proposals_rejected: checked.length - ok.length,
      cost_usd: costUsd,
      started_at: startedAt,
      skill_sha: skillSha,
      commit_sha: commitSha,
      ...(conversationIds.length ? { conversation_ids: conversationIds } : {}),
    }),
  });
  // The deterministic revert (L3 item 8): written by this run from the SQL numbers, not by
  // the model. Critical by its code prefix — there is no severity column (no migration).
  if (revertNow) {
    const o_que = `Reverter v${revertNow.version}`;
    await rest("hermes_proposals", {
      method: "POST",
      body: JSON.stringify({
        run_id: run!.id,
        code: `${REVERT_CODE}v${revertNow.version} ${day} handoff`,
        target: `reverter:v${revertNow.version}`,
        rationale: revertRationale(revertNow),
        evidence: {
          alvo: `reverter:v${revertNow.version}`,
          o_que,
          por_que: revertRationale(revertNow),
          objetivo: `handoff de volta ao nível da v${revertNow.previous}; a mudança da v${revertNow.version} é analisada, corrigida, testada e validada antes de voltar`,
          como_medir: "handoff_rate em eval_version_outcomes, versão nova contra a anterior",
          severidade: "critica",
          evidencias: [],
          reverter: revertNow,
          source,
        },
        status: "proposed",
        leads_seen: leads,
      }),
    });
    console.log(`hermes: CRÍTICO — reversão da v${revertNow.version} gravada`);
  }
  if (ok.length)
    await rest("hermes_proposals", {
      method: "POST",
      body: JSON.stringify(
        ok.map((c, i) => ({
          run_id: run!.id,
          // The code the operator reads in the document (renderProposals numbers the valid
          // ones), with the day: H-numbers restart every run. A revert starts with REVERTER-.
          code: proposalCode(c.proposal.alvo, day, i + 1),
          target: c.proposal.alvo,
          rationale: `${c.proposal.o_que} — ${c.proposal.por_que}`,
          evidence: { ...storedEvidence(c), source },
          status: "proposed",
          leads_seen: leads,
        })),
      ),
    });
  console.log(`hermes_runs ${run!.id}: ${ok.length} propostas gravadas como 'proposed'`);

  // Item 2 of the analysis: every published proposal's own check, on real conversations
  // before and after it went live, rewritten on each run. The ledger Hermes reads next time
  // carries it as "Resultado medido".
  if (production) {
    const live = await rest<Array<{ id: string; code: string | null; published_at: string; result: string | null; evidence: { como_medir?: string } | null }>>(
      "hermes_proposals?select=id,code,published_at,result,evidence&status=eq.published&published_at=not.is.null",
    );
    for (const p of live) {
      const at = encodeURIComponent(p.published_at);
      const [before, after] = await Promise.all([
        rest<ConvRow[]>(`conversations?select=${CONV}&${REAL}&created_at=lt.${at}&order=created_at.desc&limit=${limit}`).then(load),
        rest<ConvRow[]>(`conversations?select=${CONV}&${REAL}&created_at=gte.${at}&order=created_at.desc&limit=${limit}`).then(load),
      ]);
      const result = withMeasure(p.result, measureEffect(p.evidence?.como_medir, before.conversations, after.conversations));
      await rest(`hermes_proposals?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ result }) });
      console.log(`${p.code ?? p.id}: ${result}`);
    }
  }
}

// A ceiling for the supervisor (analysis §e): after the fact, because the Hermes binary is a
// black box — the job fails, the operator sees it, and the next run is a decision.
const maxUsd = Number(process.env.HERMES_MAX_USD ?? "");
if (process.env.HERMES_MAX_USD && costUsd != null && Number.isFinite(maxUsd) && costUsd > maxUsd) {
  console.error(`hermes: a rodada custou US$ ${costUsd.toFixed(4)}, acima do teto HERMES_MAX_USD de US$ ${maxUsd}`);
  process.exitCode = 1;
}
