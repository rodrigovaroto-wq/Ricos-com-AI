/**
 * The persona runner: a model-driven customer (`.claude/agents/persona-*.md`) talks to
 * Valen through one of three doors, and every conversation is written to a report.
 * Spec: docs/agente-ia/05-plano/03-personas-de-teste-interno.md; phase 3.2 of
 * docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md.
 *
 * Run for real (needs credentials — none exist in the dev container, which is expected):
 *
 *   # door `local` — the function from DISK, against the production database.
 *   # Terminal 1: the function reads its own env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   # META_API_KEY, GEMINI_API_KEY, BUSINESS_CONFIG, ...) and listens on :8000.
 *   deno run --allow-net --allow-env --env-file=.env supabase/functions/turn/index.ts
 *   # Terminal 2 (LOCAL_FUNCTION_URL defaults to http://localhost:8000):
 *   pnpm dev:personas --door=local --persona=jussara --cleanup
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
 * Flags: --door=local|function|n8n (default local) · --persona=<nome> (repeatable) or
 * --all · --max-turns=N (default 20) · --cleanup (deletes leads with the synthetic
 * prefix at the end — every door writes to the production database) ·
 * --out=<dir> (default data/persona-runs, git-ignored).
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSeam } from "../llm/seam.js";
import { geminiProvider } from "../llm/providers/gemini.js";
import {
  deliverOver,
  doorTarget,
  parseArgs,
  parsePersonaFile,
  postgrestDb,
  renderMarkdown,
  requireEnv,
  runPersona,
  SYNTHETIC_PHONE_PREFIX,
  syntheticPhone,
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

  const full = { ...report, personaCostBrl: spent };
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(full, null, 2));
  await writeFile(join(outDir, `${name}.md`), `${renderMarkdown(report)}\nCusto da persona: R$ ${spent.toFixed(4)}\n`);
  if (report.failure) failures += 1;
  console.log(
    `${report.failure ? "FALHOU" : "ok    "} ${name} — ${report.endReason}` +
      `${report.orderReady ? " — ORDER_READY" : ""}${report.failure ? `: ${report.failure}` : ""}`,
  );
}

if (args.cleanup) {
  const deleted = await db.deleteLeadsByPrefix(SYNTHETIC_PHONE_PREFIX);
  console.log(`limpeza: ${deleted} lead(s) com prefixo ${SYNTHETIC_PHONE_PREFIX} apagado(s)`);
}

console.log(`relatórios em ${outDir}`);
if (failures) process.exitCode = 1;
