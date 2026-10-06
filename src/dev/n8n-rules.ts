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
 * - The régua's sweep (2026-09-28) had no error output: a sweep the Edge Function refused
 *   (a missing column, a database error) failed every 5 minutes and told nobody.
 * - The turn answered its webhook only after the welcome's Wait (2026-09-30): the caller got
 *   a 502 on every first message, and the `n8n` persona door could not run.
 * - The WhatsApp send node had no credential and asked for another auth type (2026-10-06):
 *   with the channel on, every message would have been refused by Meta.
 */

export interface N8nNode {
  name: string;
  type: string;
  disabled?: boolean;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id?: string; name: string }>;
  onError?: string;
  position?: [number, number];
}

/** n8n's wiring: per node, one list of targets per output (`main[1]` is the error output). */
export type N8nConnections = Record<string, { main?: ({ node: string }[] | null)[] }>;

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections?: N8nConnections;
}

/** The one credential that may authenticate a call to the Edge Function. */
export const SUPABASE_CREDENTIAL = "Supabase service_role";
/** The one credential that may authenticate a call to the WhatsApp Cloud API. */
export const WHATSAPP_CREDENTIAL = "WhatsApp Cloud API";
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

    // The send node's URL is built in "Monta os envios", so it is recognized by name.
    if (node.type === "n8n-nodes-base.httpRequest" && node.name === "Envia pela Cloud API" && !node.disabled) {
      const wa = node.credentials?.httpHeaderAuth?.name;
      if (node.parameters?.genericAuthType !== "httpHeaderAuth" || wa !== WHATSAPP_CREDENTIAL)
        problems.push(`${where}: sends to WhatsApp with credential "${wa ?? "none"}", not "${WHATSAPP_CREDENTIAL}" (Header Auth)`);
    }

    const url = String(node.parameters?.url ?? "");
    if (node.type !== "n8n-nodes-base.httpRequest" || !url.includes(".supabase.co/functions/")) continue;
    const cred = node.credentials?.httpHeaderAuth?.name;
    if (cred !== SUPABASE_CREDENTIAL)
      problems.push(`${where}: calls the Edge Function with credential "${cred ?? "none"}", not "${SUPABASE_CREDENTIAL}"`);
    if (get(node.parameters, ["options", "response", "response", "neverError"]) === true)
      problems.push(`${where}: neverError hides a gateway 401 as a green execution`);
    if (node.onError !== "continueErrorOutput" || !wf.connections?.[node.name]?.main?.[1]?.length)
      problems.push(`${where}: no wired error output — a refused call reaches nobody`);
    const timeout = Number(get(node.parameters, ["options", "timeout"]) ?? 0);
    // Only the conversation turn; the sweep and the order carry a `job` and are fast.
    const isConversationTurn = url.endsWith("/functions/v1/turn") && !String(node.parameters?.jsonBody ?? "").includes("job");
    if (isConversationTurn && timeout < MIN_TURN_TIMEOUT_MS)
      problems.push(`${where}: timeout ${timeout} ms is below ${MIN_TURN_TIMEOUT_MS} ms`);
    // O10: the order call forwards the platform's secret, or every real sale is refused 401.
    if (String(node.parameters?.jsonBody ?? "").includes('job: "order"') && !String(node.parameters?.jsonBody).includes("token"))
      problems.push(`${where}: the order call does not forward the webhook token (O10)`);
  }
  // The Hermes decision form (2026-09-25): a public URL. It may only flip a row whose token
  // matches and that is still 'proposed' — without both filters any link, old or guessed,
  // approves a change that then implements and publishes itself.
  if (wf.nodes.some((n) => n.type === "n8n-nodes-base.formTrigger" && !n.disabled)) {
    for (const node of wf.nodes) {
      const url = String(node.parameters?.url ?? "");
      if (node.type !== "n8n-nodes-base.httpRequest" || node.parameters?.method !== "PATCH" || !url.includes("/rest/v1/hermes_proposals?id=eq.")) continue;
      if (!url.includes("decision_token=eq.") || !url.includes("status=eq.proposed"))
        problems.push(`${wf.name} › ${node.name}: the decision update does not require the token and status=proposed`);
    }
  }
  // L0.3 (2026-09-30): the "Responder cliente" form sends a person's text to a real
  // customer. A form URL is public; without a password anyone who finds it writes to her
  // as the Encorpa.
  if (wf.nodes.some((n) => /\\?"?job\\?"?\s*:\s*\\?"human_reply/.test(String(n.parameters?.jsonBody ?? "")))) {
    for (const n of wf.nodes)
      if (n.type === "n8n-nodes-base.formTrigger" && !n.disabled && n.parameters?.authentication !== "basicAuth")
        problems.push(`${wf.name} › ${n.name}: the human reply form has no password (basicAuth)`);
  }
  // O2: a new lead gets the welcome and, without the Wait and the resume call, nothing
  // else ever again. The inbound workflow must carry both.
  const inbound = wf.nodes.some((n) => n.type === "n8n-nodes-base.webhook" && n.parameters?.path === "encorpa-inbound");
  // Security review 2026-09-25: encorpa-inbound is public. The turn call must name the
  // message fields; forwarding the caller's body whole lets anyone post `job`, `order` or
  // `token` through the webhook with n8n's service credential attached.
  // Second review: `channel` is whatever the public caller wrote; only the turn's `sealed`
  // flag may decide that something goes out to a customer.
  if (inbound && wf.nodes.some((n) => n.type === "n8n-nodes-base.executeWorkflow" && !n.disabled)) {
    const params = JSON.stringify(wf.nodes.map((n) => n.parameters ?? {}));
    if (/body\.channel/.test(params)) problems.push(`${wf.name}: decides on the caller's channel field`);
    if (!/\$json\.sealed/.test(params)) problems.push(`${wf.name}: sends to WhatsApp without the turn's sealed flag`);
  }
  if (inbound) {
    for (const n of wf.nodes) {
      if (n.type !== "n8n-nodes-base.httpRequest" || !String(n.parameters?.url ?? "").includes("/functions/v1/turn")) continue;
      const body = String(n.parameters?.jsonBody ?? "");
      if (/JSON\.stringify\(\s*\$json\.body\s*\)|\.\.\.\s*\$\(\s*'Mensagem recebida'\s*\)\.first\(\)\.json\.body/.test(body))
        problems.push(`${wf.name} › ${n.name}: forwards the public webhook's body whole to the turn`);
      // The turn checks the inbound seal over these fields (inbound-signature.ts); one left
      // out of the body and every sealed message it applies to is refused 401 — `reply`
      // since 6d838b2, which was every button tap (2026-09-28).
      for (const field of ["externalId", "from", "body", "sentAt", "signature", "reply"])
        if (!new RegExp(`\\b${field}:`).test(body)) problems.push(`${wf.name} › ${n.name}: does not forward sealed field ${field}`);
    }
  }
  // 2026-09-30: n8n (executionOrder v1) runs a node's children top to bottom by canvas
  // position, each branch to its end. A Wait placed above the webhook's response parks the
  // execution before the response runs: the caller waits out the whole pause and gets a 502.
  const byName = new Map(wf.nodes.map((n) => [n.name, n]));
  const reachesWait = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name);
    const node = byName.get(name);
    if (node?.type === "n8n-nodes-base.wait" && !node.disabled) return true;
    return (wf.connections?.[name]?.main ?? []).some((out) => (out ?? []).some((t) => reachesWait(t.node, seen)));
  };
  for (const outputs of Object.values(wf.connections ?? {}))
    for (const out of outputs.main ?? []) {
      const targets = (out ?? []).map((t) => byName.get(t.node)).filter((n): n is N8nNode => n !== undefined && !n.disabled);
      for (const respond of targets.filter((n) => n.type === "n8n-nodes-base.respondToWebhook"))
        for (const other of targets)
          if (other !== respond && reachesWait(other.name) && !((respond.position?.[1] ?? Infinity) < (other.position?.[1] ?? -Infinity)))
            problems.push(`${wf.name} › ${respond.name}: runs after "${other.name}", which reaches a Wait — the webhook answers only after the pause`);
    }
  if (inbound) {
    if (!wf.nodes.some((n) => n.type === "n8n-nodes-base.wait" && !n.disabled))
      problems.push(`${wf.name}: no Wait node after the welcome (O2)`);
    if (!wf.nodes.some((n) => !n.disabled && /resume:\s*true/.test(String(n.parameters?.jsonBody ?? ""))))
      problems.push(`${wf.name}: no call with resume: true after the Wait (O2)`);
  }
  return problems;
}
