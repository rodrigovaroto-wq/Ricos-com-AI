/**
 * The persona runner: a model-driven customer (`.claude/agents/persona-*.md`) talks to
 * Malu through one of three doors, and every conversation is written to a report.
 * Spec: docs/agente-ia/05-plano/03-personas-de-teste-interno.md; phase 3.2 of
 * docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md.
 *
 * RUNBOOK — door `local` in the Claude Code cloud container (verified 2026-09-24). There
 * the egress proxy injects the real credentials for api.meta.ai and the Supabase host,
 * overwriting whatever Authorization/apikey the code sends, so the keys below are
 * placeholders on purpose: any non-empty value works, and no real key touches a file.
 * Deno trusts the proxy only with DENO_CERT; Node's fetch uses the proxy only with
 * NODE_USE_ENV_PROXY=1 (loopback is in NO_PROXY, so the local door stays direct).
 *
 *   # Terminal 1 — the function from DISK, on 127.0.0.1:8000, against the production DB.
 *   export BUSINESS_CONFIG="$(jq -c '.agentName = "Malu" | .testimonials = []
 *     | .handoff.email = "operador@example.com" | del(._comment)' config/business.example.json)"
 *   DENO_CERT=/root/.ccr/ca-bundle.crt DENO_SERVE_ADDRESS=tcp:127.0.0.1:8000 \
 *   SUPABASE_URL=https://hbmkgakzrqmdlsvszjeo.supabase.co SUPABASE_SERVICE_ROLE_KEY=placeholder \
 *   META_API_KEY=placeholder CONVERSATION_MODEL=muse-spark-1.3-contributor \
 *   CONVERSATION_MODEL_PRICE='{"in":0.10,"out":0.20,"cached":0.002}' \
 *   deno run --allow-env \
 *     --allow-net=127.0.0.1:8000,127.0.0.1:44995,hbmkgakzrqmdlsvszjeo.supabase.co,api.meta.ai,api.openai.com,app.coinzz.com.br,viacep.com.br \
 *     supabase/functions/turn/index.ts
 *
 *   # Terminal 2 — the runner (Node), one persona, sequential, capped at R$ 5 for the run:
 *   NODE_USE_ENV_PROXY=1 SUPABASE_URL=https://hbmkgakzrqmdlsvszjeo.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=placeholder META_API_KEY=placeholder \
 *   pnpm dev:personas --door=local --persona=jussara --max-turns=6
 *
 * `127.0.0.1:44995` is the container's local proxy ($HTTPS_PROXY); Deno needs net
 * permission for it too. Outside this container, drop DENO_CERT and that host and pass
 * real keys through `--env-file=.env` instead (LOCAL_FUNCTION_URL defaults to
 * http://localhost:8000; only localhost, 127.0.0.1 or ::1 are accepted — the service
 * key rides along).
 *
 * WHY THE `local` COMMAND LOOKS LIKE THAT. `Deno.serve` in index.ts takes no hostname, so
 * a bare `--allow-net` listens on 0.0.0.0:8000 with the production keys and without the
 * Supabase gateway's `verify_jwt`: anyone on the network could POST a forged
 * `{"job":"order",...}` with a real lead's phone. `DENO_SERVE_ADDRESS` moves the listener
 * to loopback, and the explicit `--allow-net` list is the lock: it grants 127.0.0.1:8000
 * and nothing else to listen on, so forgetting the variable fails closed (`NotCapable:
 * Requires net access to "0.0.0.0:8000"`) instead of opening the port. The outbound
 * hosts are every `fetch` in supabase/functions/turn/: SUPABASE_URL's host (replace
 * `<ref>`), the two conversation-model hosts — api.meta.ai (Muse) and api.openai.com
 * (`callLuna`, the v32 rollback; Gemini left the turn on 2026-09-23, R12.1) — and
 * Coinzz + ViaCEP from availability.ts. A new
 * outbound host in the function must be added here, or its call fails with NotCapable.
 *
 *   # door `function` — the deployed Edge Function (fallback: proves code, not path)
 *   pnpm dev:personas --door=function --all
 *
 *   # door `n8n` — the production webhook, the customer's path
 *   N8N_INBOUND_URL=https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound \
 *     pnpm dev:personas --door=n8n --all --i-know-this-is-production --n8n-does-not-create-orders
 *
 * NO PERSONA RUN MAY CREATE A REAL ORDER. Some personas buy (name, address, CPF). The
 * runner never calls checkout or Coinzz; when a body carries `orderReady: true` or a
 * non-null `order`, the conversation is flagged ORDER_READY in the report and on the
 * console. The Edge Function itself only builds the Coinzz request — it is n8n that
 * would send it. Nobody has confirmed today whether the `Encorpa — Turno da agente`
 * workflow calls Coinzz on `orderReady`, so the `n8n` door additionally requires
 * `--n8n-does-not-create-orders`: pass it only after reading the workflow.
 *
 * TIME DOES NOT PASS HERE. The loop has no clock and does not invent one: the silence
 * ruler (the three touches), the checkout reminder, the deferred reply and business
 * hours are out of scope for a persona round. When a persona "disappears for six hours"
 * (Neusa) or "three days" (Karol), it only shows in the content of her next message —
 * the next message is delivered immediately.
 *
 * Environment (never in a file): META_API_KEY (the persona's model — `muse-spark-1.3-
 * contributor`, R12.1: Meta is the only provider; synthetic text only, since that variant
 * cedes prompts to Meta for training), SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (reads, the `function` door, cleanup), N8N_INBOUND_URL
 * (door `n8n`), LOCAL_FUNCTION_URL (optional), USD_TO_BRL (optional). `pnpm` does not
 * load `.env`; export the variables or prefix with `node --env-file=.env`.
 *
 * Flags: --door=local|function|n8n (default local) · --persona=<nome> (repeatable, only
 * a-z and -) or --all · --max-turns=N (default 20) · --keep-data (skip the cleanup) ·
 * --out=<dir> (default data/persona-runs, git-ignored) · --budget-brl=N (default 5).
 *
 * SPEND IS CAPPED TWICE, and the operator pays for both sides. Per persona, the persona
 * model's own seam refuses to call past PERSONA_BUDGET_BRL. For the whole run,
 * --budget-brl caps persona model + what the turn reported spending (Malu), summed over
 * every persona: checked before each persona message, so it overshoots by at most one
 * exchange; crossing it ends that conversation as `budget_exceeded`, still cleans it up
 * and writes its report, and skips every persona after it. Personas run one at a time,
 * never in parallel.
 *
 * OUTPUT: one `<persona>.md` (readable transcript: every Malu message with its bubbles,
 * status, rewrites, gate vetoes, stage and cost) and one `<persona>.json` (the same plus
 * every raw body) per persona, and `_resumo.md` / `_resumo.json` for the run.
 *
 * CLEANUP IS ON BY DEFAULT, per persona, right after her conversation ends — every door
 * writes to production, and each turn schedules a `silence_1` the production cron would
 * send to a number that does not exist. `stage` and `turn_outcomes` are read into the
 * report first: after the cleanup the report is all that is left. A conversation that
 * flagged ORDER_READY is NOT deleted (it may be the only trace of a real order); its
 * scheduled followups are canceled instead and its phone is listed at the end.
 * `--keep-data` leaves every synthetic conversation in the production tables that
 * measure the real funnel — use it only when someone will inspect and delete them.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSeam } from "../llm/seam.js";
import { metaProvider } from "../llm/providers/meta.js";
import {
  cleanupAfter,
  deliverOver,
  doorTarget,
  parseArgs,
  parsePersonaFile,
  postgrestDb,
  renderMarkdown,
  requireEnv,
  runPersona,
  syntheticPhone,
  type CleanupResult,
  type PersonaModel,
} from "./persona-run-core.js";

const AGENTS_DIR = ".claude/agents";
/** Dev spend ceiling per persona conversation, not the lead ceiling. */
const PERSONA_BUDGET_BRL = 2;
/** The customer's model. Priced in src/llm/pricing.ts. */
const PERSONA_MODEL = "muse-spark-1.3-contributor";

const args = parseArgs(process.argv.slice(2));
const env = requireEnv(process.env, args.door);

const names =
  args.personas === "all"
    ? (await readdir(AGENTS_DIR)).filter((f) => /^persona-.+\.md$/.test(f)).map((f) => f.slice(0, -3))
    : args.personas.map((p) => (p.startsWith("persona-") ? p : `persona-${p}`));
if (names.length === 0) throw new Error(`nenhum arquivo persona-*.md em ${AGENTS_DIR}`);

const db = postgrestDb({ url: env.supabaseUrl, key: env.serviceKey });
const deliver = deliverOver(doorTarget(args.door, env));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(args.outDir, `${stamp}-${args.door}`);
await mkdir(outDir, { recursive: true });

let failures = 0;
const keptOrderReady: string[] = [];
/** Persona model + Malu, over every persona already finished. */
let runSpentBrl = 0;
const summary: Array<{ persona: string; endReason: string; failure: string | null; personaCostBrl: number; agentCostBrl: number | null; orderReady: boolean; cleanup: string }> = [];
for (const name of names) {
  if (runSpentBrl >= args.budgetBrl) {
    console.log(`orçamento da execução esgotado (R$ ${runSpentBrl.toFixed(4)} de R$ ${args.budgetBrl}) — ${name} não roda`);
    summary.push({ persona: name, endReason: "skipped_budget", failure: null, personaCostBrl: 0, agentCostBrl: null, orderReady: false, cleanup: "none" });
    continue;
  }
  const persona = parsePersonaFile(await readFile(join(AGENTS_DIR, `${name}.md`), "utf8"));

  let spent = 0;
  const provider = metaProvider({ apiKey: env.metaKey, model: PERSONA_MODEL });
  const seam = createSeam({
    providers: { conversation: provider, cheap: provider },
    usdToBrl: Number(process.env["USD_TO_BRL"] ?? "5.4"),
    ceilingBrl: PERSONA_BUDGET_BRL,
    record: () => undefined,
  });
  const model: PersonaModel = {
    async next(system, messages) {
      const result = await seam.call("cheap", { purpose: "persona", system, messages, maxOutputTokens: 400 }, spent);
      spent += result.costBrl;
      return result.text;
    },
  };

  const runId = `persona-${stamp}-${name}`;
  const report = await runPersona({
    persona,
    door: args.door,
    deliver,
    model,
    db,
    phone: syntheticPhone(),
    runId,
    maxTurns: args.maxTurns,
    overBudget: (agentCostBrl) =>
      runSpentBrl + spent + agentCostBrl >= args.budgetBrl
        ? `orçamento da execução atingido: R$ ${(runSpentBrl + spent + agentCostBrl).toFixed(4)} de R$ ${args.budgetBrl}`
        : null,
  });
  runSpentBrl += spent + (report.costBrl ?? 0);

  let cleanup: CleanupResult | { action: "kept_by_flag" } | { action: "failed"; error: string } = {
    action: "kept_by_flag",
  };
  if (args.cleanup) {
    try {
      cleanup = await cleanupAfter(report, db);
    } catch (error) {
      cleanup = { action: "failed", error: error instanceof Error ? error.message : String(error) };
      failures += 1;
    }
  }
  if (report.orderReady) keptOrderReady.push(report.phone);

  const full = { ...report, personaCostBrl: spent, cleanup };
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(full, null, 2));
  await writeFile(
    join(outDir, `${name}.md`),
    `${renderMarkdown(report)}\nCusto da persona (${PERSONA_MODEL}): R$ ${spent.toFixed(4)}\n` +
      `Limpeza: ${cleanup.action}${"error" in cleanup ? ` (${cleanup.error})` : ""}\n`,
  );
  if (report.failure) failures += 1;
  summary.push({
    persona: name,
    endReason: report.endReason,
    failure: report.failure,
    personaCostBrl: spent,
    agentCostBrl: report.costBrl,
    orderReady: report.orderReady,
    cleanup: cleanup.action,
  });
  console.log(
    `${report.failure ? "FALHOU" : "ok    "} ${name} — ${report.endReason}` +
      `${report.orderReady ? " — ORDER_READY" : ""}${report.failure ? `: ${report.failure}` : ""}` +
      ` — limpeza: ${cleanup.action}${"error" in cleanup ? ` (${cleanup.error})` : ""}` +
      ` — R$ ${(spent + (report.costBrl ?? 0)).toFixed(4)} (persona ${spent.toFixed(4)} + Malu ${(report.costBrl ?? 0).toFixed(4)})`,
  );
}

await writeFile(
  join(outDir, "_resumo.json"),
  JSON.stringify({ door: args.door, budgetBrl: args.budgetBrl, spentBrl: runSpentBrl, personas: summary }, null, 2),
);
await writeFile(
  join(outDir, "_resumo.md"),
  [
    `# Execução ${stamp} — porta \`${args.door}\``,
    "",
    `Gasto total: R$ ${runSpentBrl.toFixed(4)} de R$ ${args.budgetBrl} (persona + Malu)`,
    "",
    "| Persona | Fim | Persona R$ | Malu R$ | ORDER_READY | Limpeza |",
    "|---|---|---|---|---|---|",
    ...summary.map(
      (s) =>
        `| [${s.persona}](${s.persona}.md) | \`${s.endReason}\`${s.failure ? ` — ${s.failure.replace(/\|/g, "/")}` : ""} | ` +
        `${s.personaCostBrl.toFixed(4)} | ${s.agentCostBrl === null ? "—" : s.agentCostBrl.toFixed(4)} | ` +
        `${s.orderReady ? "**sim**" : "não"} | ${s.cleanup} |`,
    ),
    "",
  ].join("\n"),
);
console.log(`gasto da execução: R$ ${runSpentBrl.toFixed(4)} de R$ ${args.budgetBrl}`);

if (keptOrderReady.length) {
  console.log(
    `ORDER_READY: ${keptOrderReady.length} conversa(s) mantida(s) no banco, sem limpeza — ` +
      `confira que nenhum pedido real nasceu: ${keptOrderReady.join(", ")}`,
  );
}
if (!args.cleanup) console.log("--keep-data: as conversas sintéticas ficaram no banco de produção");

console.log(`relatórios em ${outDir}`);
if (failures) process.exitCode = 1;
