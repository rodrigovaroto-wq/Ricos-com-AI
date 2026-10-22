/**
 * Calibrates Hermes against known ground truth (P1.4, operator 2026-10-22): several trials, each planting `--per-class`
 * defects of each class (`DEFECT_CLASSES`: a lie that went out, a canned reply after vetoes, the same link twice) in
 * distinct conversations beside clean ones, a Hermes run per trial, and the recall per class over all of them. "Rodada
 * limpa, nada a propor" is only worth something if Hermes finds the problem when there is one — rerun after every change
 * to the skill (hermes/skills/encorpa-supervisor) or to the model.
 *
 *   pnpm hermes:calibrar --source=supabase [--trials=10] [--per-class=4] [--clean=4] [--seed=1]
 *   pnpm hermes:calibrar --source=personas:data/persona-runs/<dir> [--model=muse-spark-1.3-contributor]
 *
 * `supabase` reads real conversations (copies; nothing is written back) and runs the STANDARD model only — the
 * `-contributor` variant gives Meta the text for training (hermes-run refuses it on real conversations, and so does this).
 * Everything of a real calibration stays outside the repository (a temp folder): the planted copies carry customer text.
 * Environment: as `pnpm hermes` (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, META_API_KEY; in the Claude Code container the
 * proxy injects them — NODE_USE_ENV_PROXY=1). HERMES_MAX_USD caps each trial's run.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rowsToConversations, type Checked, type SupabaseRows } from "./hermes-core.js";
import { renderCalibration, score, trial, type Planted } from "./hermes-calibrate-core.js";
import { SYNTHETIC_PHONE_PREFIX } from "./persona-run-core.js";
import type { Conversation } from "./persona-scorecard.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const source = flag("source") ?? "";
const trials = Number(flag("trials") ?? 10);
const perClass = Number(flag("per-class") ?? 4);
const clean = Number(flag("clean") ?? 4);
const seed = Number(flag("seed") ?? 1);
const model = flag("model") ?? "muse-spark-1.3";
if (!/^personas:.+|^supabase$/.test(source)) throw new Error("uso: pnpm hermes:calibrar --source=supabase | --source=personas:<pasta>");
if (source === "supabase" && model.includes("contributor"))
  throw new Error("a variante -contributor cede os dados para treino da Meta: proibida sobre conversa real (LGPD)");

const SB = process.env.SUPABASE_URL ?? "https://hbmkgakzrqmdlsvszjeo.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const rest = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`supabase ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

const pool = async (): Promise<Conversation[]> => {
  if (source.startsWith("personas:")) {
    const dir = source.slice("personas:".length);
    return readdirSync(dir).filter((f) => /^persona-.+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Conversation);
  }
  const conversations = await rest<SupabaseRows["conversations"]>(`conversations?select=id,lead_id,welcomed_at,cost_brl,leads!inner(phone)&leads.phone=not.like.${SYNTHETIC_PHONE_PREFIX}*&order=created_at`);
  const inIds = `conversation_id=in.(${conversations.map((c) => c.id).join(",")})`;
  const [messages, traces, outcomes] = await Promise.all([
    rest<SupabaseRows["messages"]>(`messages?select=conversation_id,direction,body,created_at&${inIds}&order=created_at,id`),
    rest<SupabaseRows["traces"]>(`gate_traces?select=conversation_id,gate,detail,created_at&verdict=eq.block&${inIds}&order=created_at,id`),
    rest<SupabaseRows["outcomes"]>(`turn_outcomes?select=conversation_id,outcome,created_at&${inIds}&order=created_at,id`),
  ]);
  return rowsToConversations({ conversations, messages, traces, outcomes }).conversations;
};

const base = await pool();
const work = mkdtempSync(join(tmpdir(), "hermes-calibracao-"));
const runs: Array<{ planted: Planted[]; checked: Checked[] }> = [];
let cost = 0;
let costKnown = true;
for (let t = 0; t < trials; t++) {
  const one = trial(base, { seed: seed * 1000 + t, perClass, clean });
  const dir = mkdtempSync(join(work, `rodada-${t + 1}-`));
  one.conversations.forEach((c, i) => writeFileSync(join(dir, `persona-${String(i + 1).padStart(2, "0")}.json`), JSON.stringify(c)));
  writeFileSync(join(dir, "plantados.json"), JSON.stringify(one.planted, null, 1));
  if (one.short) console.warn(`rodada ${t + 1}: conversas insuficientes para ${perClass} por classe — plantou ${one.planted.length}`);
  try {
    execFileSync("pnpm", ["-s", "hermes", `--source=personas:${dir}`, `--model=${model}`, `--out-dir=${dir}`], { stdio: "inherit" });
  } catch (e) {
    console.error(`rodada ${t + 1}: hermes falhou (${(e as Error).message.slice(0, 160)})`);
  }
  const out = readdirSync(dir).find((f) => f.endsWith(".json") && f.startsWith("20"));
  const result = out ? (JSON.parse(readFileSync(join(dir, out), "utf8")) as { checked: Checked[]; costUsd: number | null }) : { checked: [], costUsd: null };
  if (typeof result.costUsd === "number") cost += result.costUsd;
  else costKnown = false;
  runs.push({ planted: one.planted, checked: result.checked });
}
const report = renderCalibration(score(runs), { trials, costUsd: costKnown ? cost : null, model, source });
writeFileSync(join(work, "calibracao.md"), report);
console.log(`\n${report}\n\n(rodadas em ${work})`);
const below = score(runs).some((s) => s.planted > 0 && s.found / s.planted < 0.8);
process.exitCode = below ? 1 : 0;
