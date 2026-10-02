/**
 * Publishes the `turn` Edge Function by the management API, from the files on disk, as a new
 * numbered version of the agent (§5 of docs/agente-ia/05-plano/10-execucao-mes-1.md).
 *
 *   NODE_USE_ENV_PROXY=1 pnpm deploy:turn --dry-run          # prints what it would do
 *   NODE_USE_ENV_PROXY=1 pnpm deploy:turn [--note="..."] [--proposal=<hermes_proposals.id>]
 *
 * Order: the next row in `agent_versions` (max + 1, HEAD's sha) → the secret AGENT_VERSION →
 * the deploy. A secret or deploy that fails puts the previous secret back and deletes the
 * row, so turns of the old code never carry the new number. Migration 0021 must be applied
 * first; without it the first write fails and nothing is published.
 *
 * Refuses a function directory that differs from HEAD: the row's git_sha has to be the code
 * that went up. Everything goes through the management API (SQL by `database/query`, with
 * parameters), so one credential does it all: in the Claude Code cloud container the proxy
 * injects it for api.supabase.com; elsewhere pass SUPABASE_ACCESS_TOKEN (the operator's
 * sbp_… token).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTION_DIR, functionFiles, nextVersion } from "./deploy-turn-core.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dryRun = args.includes("--dry-run");
const proposal = flag("proposal") ?? null;
const note = flag("note") ?? "pnpm deploy:turn";

const REF = process.env.SUPABASE_PROJECT_REF ?? "hbmkgakzrqmdlsvszjeo";
const API = `https://api.supabase.com/v1/projects/${REF}`;
const apiHeaders: Record<string, string> = process.env.SUPABASE_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } : {};

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
const sql = <T>(query: string, parameters: unknown[] = []) =>
  call<T[]>(`${API}/database/query`, { method: "POST", headers: { ...apiHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ query, parameters }) });
const setSecret = (value: string) =>
  call(`${API}/secrets`, { method: "POST", headers: { ...apiHeaders, "Content-Type": "application/json" }, body: JSON.stringify([{ name: "AGENT_VERSION", value }]) });

const files = functionFiles(FUNCTION_DIR);
const sha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain", "--", FUNCTION_DIR);
if (dirty && !dryRun) throw new Error(`${FUNCTION_DIR} difere do HEAD; commite antes, para o git_sha da versão ser o código publicado:\n${dirty}`);

if (proposal !== null && !/^[0-9a-f-]{36}$/.test(proposal)) throw new Error(`--proposal=${proposal}: não é o id (uuid) de hermes_proposals`);
const last = await sql<{ version: number }>("select version from public.agent_versions order by version desc limit 1").catch(
  (e: Error) => {
    if (!dryRun) throw e;
    console.log(`(agent_versions não lida: ${e.message} — a 0021 está aplicada?)`);
    return [];
  },
);
const version = nextVersion(last);
const previous = last[0]?.version ?? null;

console.log(`projeto ${REF} · commit ${sha}${dirty ? " (com alteração não commitada)" : ""}`);
console.log(`agent_versions: v${previous ?? "—"} → v${version}${proposal ? ` · proposta ${proposal}` : ""} · nota "${note}"`);
console.log(`${files.length} arquivos de ${FUNCTION_DIR}: ${files.join(", ")}`);
if (dryRun) {
  console.log("--dry-run: nada gravado, segredo intocado, nada publicado.");
  process.exit(0);
}

// The primary key refuses a second deploy that read the same max at the same time.
await sql("insert into public.agent_versions (version, git_sha, hermes_proposal_id, note) values ($1::int, $2, $3::uuid, $4)", [version, sha, proposal, note]);
try {
  await setSecret(String(version));
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ entrypoint_path: "index.ts", name: "turn", verify_jwt: true })], { type: "application/json" }));
  for (const f of files) form.append("file", new Blob([readFileSync(join(FUNCTION_DIR, f))]), f);
  const fn = await call<{ version?: number; updated_at?: number | string; ezbr_sha256?: string }>(`${API}/functions/deploy?slug=turn`, {
    method: "POST",
    headers: apiHeaders,
    body: form,
  });
  console.log(`publicada: agent_version ${version} · função turn v${fn.version} · updated_at ${fn.updated_at} · ezbr_sha256 ${fn.ezbr_sha256}`);
} catch (e) {
  // Put things back, so old code is not counted as the new version; report what could not be undone.
  const undo = await Promise.allSettled([
    previous === null
      ? call(`${API}/secrets`, { method: "DELETE", headers: { ...apiHeaders, "Content-Type": "application/json" }, body: JSON.stringify(["AGENT_VERSION"]) })
      : setSecret(String(previous)),
    sql("delete from public.agent_versions where version = $1::int", [version]),
  ]);
  for (const u of undo) if (u.status === "rejected") console.error(`NÃO DESFEITO — confira à mão: ${(u.reason as Error).message}`);
  throw e;
}
