/**
 * Rules every production n8n workflow must hold, checked against the ACTIVE version
 * (what runs), never the draft. Each rule is a failure that already happened here:
 *
 * - O-04 (2026-09-24): the régua called the Edge Function with the "Gemini API" header
 *   credential and got `Invalid JWT` every 5 minutes for weeks; the turn had the same
 *   bug on 2026-09-08 (`.claude/memory/verificar-pela-porta-de-producao.md`).
 * - `neverError` turned that 401 into a green execution both times.
 * - The versioned export was the draft, with the trigger disabled — nobody saw the
 *   difference between what was committed and what ran.
 * - The v33 turn takes up to ~120 s; a 60 s timeout sends a saved reply to the refusal
 *   branch.
 */

export interface N8nNode {
  name: string;
  type: string;
  disabled?: boolean;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id?: string; name: string }>;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
}

/** The one credential that may authenticate a call to the Edge Function. */
export const SUPABASE_CREDENTIAL = "Supabase service_role";
/** The Supabase gateway's own limit; the v33 turn needs close to all of it. */
export const MIN_TURN_TIMEOUT_MS = 150_000;

const get = (o: unknown, path: string[]): unknown =>
  path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);

export function checkWorkflow(wf: N8nWorkflow): string[] {
  const problems: string[] = [];
  for (const node of wf.nodes) {
    const where = `${wf.name} › ${node.name}`;
    if (node.type === "n8n-nodes-base.scheduleTrigger" && wf.active && node.disabled)
      problems.push(`${where}: schedule trigger disabled in an active workflow`);

    const url = String(node.parameters?.url ?? "");
    if (node.type !== "n8n-nodes-base.httpRequest" || !url.includes(".supabase.co/functions/")) continue;
    const cred = node.credentials?.httpHeaderAuth?.name;
    if (cred !== SUPABASE_CREDENTIAL)
      problems.push(`${where}: calls the Edge Function with credential "${cred ?? "none"}", not "${SUPABASE_CREDENTIAL}"`);
    if (get(node.parameters, ["options", "response", "response", "neverError"]) === true)
      problems.push(`${where}: neverError hides a gateway 401 as a green execution`);
    const timeout = Number(get(node.parameters, ["options", "timeout"]) ?? 0);
    // Only the conversation turn; the sweep and the order carry a `job` and are fast.
    const isConversationTurn = url.endsWith("/functions/v1/turn") && !String(node.parameters?.jsonBody ?? "").includes("job");
    if (isConversationTurn && timeout < MIN_TURN_TIMEOUT_MS)
      problems.push(`${where}: timeout ${timeout} ms is below ${MIN_TURN_TIMEOUT_MS} ms`);
    // O10: the order call forwards the platform's secret, or every real sale is refused 401.
    if (String(node.parameters?.jsonBody ?? "").includes('job: "order"') && !String(node.parameters?.jsonBody).includes("token"))
      problems.push(`${where}: the order call does not forward the webhook token (O10)`);
  }
  // O2: a new lead gets the welcome and, without the Wait and the resume call, nothing
  // else ever again. The inbound workflow must carry both.
  const inbound = wf.nodes.some((n) => n.type === "n8n-nodes-base.webhook" && n.parameters?.path === "encorpa-inbound");
  if (inbound) {
    if (!wf.nodes.some((n) => n.type === "n8n-nodes-base.wait" && !n.disabled))
      problems.push(`${wf.name}: no Wait node after the welcome (O2)`);
    if (!wf.nodes.some((n) => !n.disabled && /resume:\s*true/.test(String(n.parameters?.jsonBody ?? ""))))
      problems.push(`${wf.name}: no call with resume: true after the Wait (O2)`);
  }
  return problems;
}
