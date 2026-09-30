/**
 * Pulls the ACTIVE version of the production workflows into n8n/workflows/ and
 * checks them against src/dev/n8n-rules.ts. Read-only on n8n.
 *
 *   NODE_USE_ENV_PROXY=1 pnpm dev:n8n
 *
 * In the Claude Code cloud container the proxy injects the n8n API key for
 * encorpa-fashion.pikapod.net; elsewhere pass N8N_API_KEY. Exits 1 when a rule fails,
 * so a drifted or broken production workflow is a red command, not a green execution.
 */
import { writeFileSync } from "node:fs";
import { checkWorkflow, type N8nWorkflow } from "./n8n-rules.js";

const BASE = process.env.N8N_BASE_URL ?? "https://encorpa-fashion.pikapod.net";
const WORKFLOWS: Record<string, string> = {
  HnGrxquQLpfbXWLH: "turno-da-agente",
  SVDtFUi2N9oOskkx: "relogio-da-regua",
  gS72LhYGOnmyALRq: "venda-confirmada",
  o5ZULK9Y74l1hReL: "hermes-decisao",
  GehzRG0OhJ4FtBm9: "whatsapp-envio",
  "3Q18SjoW0UUXrTPI": "responder-cliente",
};

interface ApiWorkflow {
  id: string;
  name: string;
  active: boolean;
  activeVersionId: string | null;
  activeVersion?: { versionId: string; nodes: N8nWorkflow["nodes"]; connections: NonNullable<N8nWorkflow["connections"]> };
}

async function fetchActive(id: string): Promise<N8nWorkflow & { versionId: string }> {
  const headers: Record<string, string> = process.env.N8N_API_KEY ? { "X-N8N-API-KEY": process.env.N8N_API_KEY } : {};
  const res = await fetch(`${BASE}/api/v1/workflows/${id}`, { headers });
  if (!res.ok) throw new Error(`n8n ${id}: HTTP ${res.status}`);
  const wf = (await res.json()) as ApiWorkflow;
  if (!wf.activeVersion) throw new Error(`n8n ${id}: no active version — the workflow is not published`);
  return {
    id: wf.id,
    name: wf.name,
    active: wf.active,
    versionId: wf.activeVersion.versionId,
    nodes: wf.activeVersion.nodes,
    connections: wf.activeVersion.connections,
  };
}

const ids = Object.keys(WORKFLOWS);
let failed = false;
for (const id of ids) {
  const wf = await fetchActive(id);
  const file = WORKFLOWS[id]!;
  writeFileSync(`n8n/workflows/${file}.json`, JSON.stringify(wf, null, 2) + "\n");
  const problems = checkWorkflow(wf);
  console.log(`${problems.length ? "FALHA" : "ok   "} ${wf.name} (versão ativa ${wf.versionId})`);
  for (const p of problems) console.log(`  - ${p}`);
  failed ||= problems.length > 0;
}
process.exitCode = failed ? 1 : 0;
