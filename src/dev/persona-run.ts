/**
 * The persona runner: a model-driven customer (`.claude/agents/persona-*.md`) talks to
 * Malu through one of three doors, and every conversation is written to a report.
 * Spec: docs/agente-ia/05-plano/03-personas-de-teste-interno.md; phase 3.2 of
 * docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md.
 *
 * Run for real (needs credentials — none exist in the dev container, which is expected):
 *
 *   # door `local` — the function from DISK, against the production database.
 *   # Terminal 1: the function reads its own env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   # META_API_KEY, GEMINI_API_KEY, BUSINESS_CONFIG, ...) and listens on 127.0.0.1:8000.
 *   DENO_SERVE_ADDRESS=tcp:127.0.0.1:8000 deno run --allow-env --env-file=.env \
 *     --allow-net=127.0.0.1:8000,<ref>.supabase.co,generativelanguage.googleapis.com,api.meta.ai,api.openai.com,app.coinzz.com.br,viacep.com.br \
 *     supabase/functions/turn/index.ts
 *   # Terminal 2 (LOCAL_FUNCTION_URL defaults to http://localhost:8000; only localhost,
 *   # 127.0.0.1 or ::1 are accepted — the service key rides along):
 *   pnpm dev:personas --door=local --persona=jussara
 *
 * WHY THE `local` COMMAND LOOKS LIKE THAT. `Deno.serve` in index.ts takes no hostname, so
 * a bare `--allow-net` listens on 0.0.0.0:8000 with the production keys and without the
 * Supabase gateway's `verify_jwt`: anyone on the network could POST a forged
 * `{"job":"order",...}` with a real lead's phone. `DENO_SERVE_ADDRESS` moves the listener
 * to loopback, and the explicit `--allow-net` list is the lock: it grants 127.0.0.1:8000
 * and nothing else to listen on, so forgetting the variable fails closed (`NotCapable:
 * Requires net access to "0.0.0.0:8000"`) instead of opening the port. The outbound
 * hosts are every `fetch` in supabase/functions/turn/: SUPABASE_URL's host (replace
 * `<ref>`), the three model providers, and Coinzz + ViaCEP from availability.ts. A new
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
 * Environment (never in a file): GEMINI_API_KEY (the persona's model), SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (reads, the `function` door, cleanup), N8N_INBOUND_URL
 * (door `n8n`), LOCAL_FUNCTION_URL (optional), USD_TO_BRL (optional). `pnpm` does not
 * load `.env`; export the variables or prefix with `node --env-file=.env`.
 *
 * Flags: --door=local|function|n8n (default local) · --persona=<nome> (repeatable, only
 * a-z and -) or --all · --max-turns=N (default 20) · --keep-data (skip the cleanup) ·
 * --out=<dir> (default data/persona-runs, git-ignored).
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
import { geminiProvider } from "../llm/providers/gemini.js";
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
for (const name of names) {
  const persona = parsePersonaFile(await readFile(join(AGENTS_DIR, `${name}.md`), "utf8"));

  let spent = 0;
  const seam = createSeam({
    providers: {
      conversation: geminiProvider({ apiKey: env.geminiKey, model: "gemini-3.5-flash-lite" }),
      cheap: geminiProvider({ apiKey: env.geminiKey, model: "gemini-3.5-flash-lite" }),
    },
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
  });

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
  await writeFile(join(outDir, `${name}.md`), `${renderMarkdown(report)}\nCusto da persona: R$ ${spent.toFixed(4)}\n`);
  if (report.failure) failures += 1;
  console.log(
    `${report.failure ? "FALHOU" : "ok    "} ${name} — ${report.endReason}` +
      `${report.orderReady ? " — ORDER_READY" : ""}${report.failure ? `: ${report.failure}` : ""}` +
      ` — limpeza: ${cleanup.action}${"error" in cleanup ? ` (${cleanup.error})` : ""}`,
  );
}

if (keptOrderReady.length) {
  console.log(
    `ORDER_READY: ${keptOrderReady.length} conversa(s) mantida(s) no banco, sem limpeza — ` +
      `confira que nenhum pedido real nasceu: ${keptOrderReady.join(", ")}`,
  );
}
if (!args.cleanup) console.log("--keep-data: as conversas sintéticas ficaram no banco de produção");

console.log(`relatórios em ${outDir}`);
if (failures) process.exitCode = 1;
