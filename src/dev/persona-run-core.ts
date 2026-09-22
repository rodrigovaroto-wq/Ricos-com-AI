/**
 * The testable half of the persona runner (`persona-run.ts`): parsing, the conversation
 * loop, the three doors, the outcome table and the safety checks. Nothing here touches
 * the network on its own — the model, the door and the database are injected, so the
 * whole loop runs in `tests/persona-run.test.ts` with fakes.
 */

export type Door = "local" | "function" | "n8n";
export const DOORS: readonly Door[] = ["local", "function", "n8n"];

/**
 * Every phone the runner invents starts here. `55` is Brazil and `00` is not a DDD, so
 * no real WhatsApp number can ever collide with it. The cleanup DELETE refuses any
 * other prefix.
 */
export const SYNTHETIC_PHONE_PREFIX = "5500099";

export const END_MARKER = "[FIM]";

/** The persona's first cue. Neutral on purpose: she must not learn she is a test. */
export const KICKOFF =
  "(Você acabou de ver o anúncio no Instagram e abriu o WhatsApp da loja. Mande a sua primeira mensagem.)";

/** What she "sees" when a turn produced no text for her. */
const NO_REPLY = "(sem resposta)";

const DOOR_NOTES: Record<Door, string> = {
  local: "função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu",
  function:
    "porta `function` (fallback): Edge Function no ar, chamada direto — prova o código, não o caminho",
  n8n: "porta de produção: webhook do n8n, o mesmo caminho da cliente",
};

// ---------------------------------------------------------------------------
// Persona file

export interface Persona {
  name: string;
  /** The whole markdown body, frontmatter removed. */
  system: string;
}

export const parsePersonaFile = (markdown: string): Persona => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) throw new Error("arquivo de persona sem frontmatter (--- ... ---)");
  const [, frontmatter = "", body = ""] = match;
  const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
  if (!name) throw new Error("arquivo de persona sem `name` no frontmatter");
  const system = body.trim();
  if (!system) throw new Error(`persona ${name}: corpo vazio — o corpo é o system prompt`);
  return { name, system };
};

/**
 * The fixed contract with the persona files: the last message, then `[FIM]` alone on the
 * next line. `[FIM]` alone means she left without a word.
 */
export const parsePersonaReply = (raw: string): { text: string; ended: boolean } => {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.at(-1)?.trim() === END_MARKER) {
    return { text: lines.slice(0, -1).join("\n").trim(), ended: true };
  }
  return { text: raw.trim(), ended: false };
};

// ---------------------------------------------------------------------------
// Arguments and environment

export interface RunnerArgs {
  door: Door;
  personas: string[] | "all";
  maxTurns: number;
  cleanup: boolean;
  outDir: string;
}

export const parseArgs = (argv: readonly string[]): RunnerArgs => {
  let door: string = "local";
  const personas: string[] = [];
  let all = false;
  let maxTurns = 20;
  let cleanup = false;
  let production = false;
  let noOrders = false;
  let outDir = "data/persona-runs";

  for (const arg of argv) {
    const [flag, value] = arg.split(/=(.*)/s, 2) as [string, string | undefined];
    if (flag === "--door" && value) door = value;
    else if (flag === "--persona" && value) personas.push(value);
    else if (flag === "--all") all = true;
    else if (flag === "--max-turns" && value) maxTurns = Number(value);
    else if (flag === "--cleanup") cleanup = true;
    else if (flag === "--i-know-this-is-production") production = true;
    else if (flag === "--n8n-does-not-create-orders") noOrders = true;
    else if (flag === "--out" && value) outDir = value;
    else throw new Error(`argumento desconhecido: ${arg}`);
  }

  if (!DOORS.includes(door as Door)) throw new Error(`porta inválida: ${door} (use local, function ou n8n)`);
  if (door === "n8n" && !production) {
    throw new Error("a porta n8n é o webhook de PRODUÇÃO — repita com --i-know-this-is-production");
  }
  if (door === "n8n" && !noOrders) {
    // Unconfirmed today whether the workflow calls Coinzz on `orderReady`. A buying
    // persona through that door could file a real order.
    throw new Error(
      "confirme que o workflow do n8n NÃO cria pedido na Coinzz ao receber orderReady — " +
        "repita com --n8n-does-not-create-orders",
    );
  }
  if (!all && personas.length === 0) throw new Error("diga qual persona: --persona=<nome> (repetível) ou --all");
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new Error(`--max-turns inválido: ${maxTurns}`);

  return { door: door as Door, personas: all ? "all" : personas, maxTurns, cleanup, outDir };
};

export interface RunnerEnv {
  geminiKey: string;
  supabaseUrl: string;
  serviceKey: string;
  n8nUrl: string | null;
  localUrl: string;
}

/** Every missing variable at once, so a run never fails one variable at a time. */
export const requireEnv = (env: Readonly<Record<string, string | undefined>>, door: Door): RunnerEnv => {
  const needed = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  if (door === "n8n") needed.push("N8N_INBOUND_URL");
  const missing = needed.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`variáveis de ambiente faltando para a porta ${door}: ${missing.join(", ")}`);
  }
  return {
    geminiKey: env["GEMINI_API_KEY"]!.trim(),
    supabaseUrl: env["SUPABASE_URL"]!.trim().replace(/\/+$/, ""),
    serviceKey: env["SUPABASE_SERVICE_ROLE_KEY"]!.trim(),
    n8nUrl: env["N8N_INBOUND_URL"]?.trim() || null,
    localUrl: env["LOCAL_FUNCTION_URL"]?.trim() || "http://localhost:8000",
  };
};

// ---------------------------------------------------------------------------
// Doors

export interface Inbound {
  externalId: string;
  from: string;
  body: string;
  resume?: true;
}

/** Whatever the turn answered. Only the fields the runner reads are named. */
export interface TurnBody {
  status?: string;
  reply?: string | null;
  costBrl?: number;
  resumeInSeconds?: number;
  [key: string]: unknown;
}

export type Deliver = (inbound: Inbound) => Promise<TurnBody>;

export interface DoorTarget {
  url: string;
  headers: Record<string, string>;
}

export const doorTarget = (door: Door, env: RunnerEnv): DoorTarget => {
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}` };
  if (door === "function") return { url: `${env.supabaseUrl}/functions/v1/turn`, headers: auth };
  if (door === "local") return { url: env.localUrl, headers: auth };
  if (!env.n8nUrl) throw new Error("N8N_INBOUND_URL faltando para a porta n8n");
  // The service key never goes to the webhook: n8n holds its own credential.
  return { url: env.n8nUrl, headers: { "Content-Type": "application/json" } };
};

/**
 * One POST. A non-2xx is a failure with the body in the message — the function answers
 * 4xx on a refused payload. The n8n door answers 200 on every outcome, so its refusal
 * arrives as `status: "error"` in the body and is judged by the outcome table instead.
 */
export const deliverOver =
  (target: DoorTarget, fetchImpl: typeof fetch = fetch): Deliver =>
  async (inbound) => {
    const response = await fetchImpl(target.url, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(inbound),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} de ${target.url}: ${text.slice(0, 500)}`);
    try {
      return JSON.parse(text) as TurnBody;
    } catch {
      throw new Error(`corpo não é JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
    }
  };

// ---------------------------------------------------------------------------
// Database reads and the cleanup

export interface Db {
  conversationFor: (phone: string) => Promise<{ id: string; stage: string | null; cost_brl: number | null } | null>;
  /** Outbound bodies of the conversation, oldest first. */
  outbound: (conversationId: string) => Promise<string[]>;
  gateTraces: (conversationId: string) => Promise<unknown[]>;
  deleteLeadsByPrefix: (prefix: string) => Promise<number>;
}

/**
 * The only DELETE the runner can build. Anything but the synthetic prefix throws before
 * a request exists — there is no path to an unfiltered delete.
 */
export const cleanupPath = (prefix: string): string => {
  if (prefix !== SYNTHETIC_PHONE_PREFIX || !/^\d{7,}$/.test(prefix)) {
    throw new Error(`limpeza recusada: prefixo "${prefix}" não é o sintético ${SYNTHETIC_PHONE_PREFIX}`);
  }
  return `leads?phone=like.${prefix}*`;
};

/**
 * PostgREST over the service key. Indexes: `leads.phone` unique (lookup by phone);
 * `conversations_lead_idx`; `messages_conversation_idx (conversation_id, created_at)`;
 * `gate_traces_conversation_idx (conversation_id, created_at)`. The cleanup `like` on
 * `leads.phone` does NOT use the unique btree (non-C collation) — a sequential scan
 * over `leads`, run once per invocation and only with `--cleanup`. Deleting the lead
 * cascades to conversations, messages, followups, gate_traces, llm_calls, turn_outcomes
 * and orders.
 */
export const postgrestDb = (options: { url: string; key: string; fetchImpl?: typeof fetch }): Db => {
  const doFetch = options.fetchImpl ?? fetch;
  const rest = async (path: string, init: RequestInit = {}): Promise<any[]> => {
    const response = await doFetch(`${options.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: options.key,
        Authorization: `Bearer ${options.key}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`supabase ${response.status} em ${path}: ${text.slice(0, 300)}`);
    return text ? (JSON.parse(text) as any[]) : [];
  };

  return {
    async conversationFor(phone) {
      const leads = await rest(`leads?phone=eq.${encodeURIComponent(phone)}&select=id`);
      if (!leads[0]) return null;
      const conversations = await rest(
        `conversations?lead_id=eq.${leads[0].id}&select=id,stage,cost_brl&order=created_at.desc&limit=1`,
      );
      return conversations[0] ?? null;
    },
    async outbound(conversationId) {
      const rows = await rest(
        `messages?conversation_id=eq.${conversationId}&direction=eq.outbound&select=body&order=created_at.asc`,
      );
      return rows.map((r) => String(r.body ?? ""));
    },
    async gateTraces(conversationId) {
      return rest(
        `gate_traces?conversation_id=eq.${conversationId}&select=gate,verdict,detail,created_at&order=created_at.asc`,
      );
    },
    async deleteLeadsByPrefix(prefix) {
      const path = cleanupPath(prefix);
      const rows = await rest(path, { method: "DELETE", headers: { Prefer: "return=representation" } });
      return rows.length;
    },
  };
};

export const syntheticPhone = (random: () => number = Math.random): string =>
  SYNTHETIC_PHONE_PREFIX + String(Math.floor(random() * 1_000_000)).padStart(6, "0");

// ---------------------------------------------------------------------------
// The loop

export interface PersonaModel {
  next: (system: string, messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>) => Promise<string>;
}

export interface TranscriptEntry {
  from: "persona" | "valen";
  text: string;
  status?: string;
  body?: TurnBody;
}

export interface Report {
  persona: string;
  door: Door;
  doorNote: string;
  phone: string;
  runId: string;
  transcript: TranscriptEntry[];
  /** `persona_finished`, `persona_left`, `max_turns`, a terminal status, or `error`. */
  endReason: string;
  failure: string | null;
  costBrl: number | null;
  stage: string | null;
  gateTraces: unknown[];
  /** Some body carried `orderReady: true` or a non-null `order` — see the file header. */
  orderReady: boolean;
}

/** The conversation goes on after these. */
const CONTINUES = new Set(["ok", "fallback", "resume_moot"]);
/** The conversation is over, and that is a legitimate result, not a runner failure. */
const ENDS = new Set(["handoff", "stopped", "opted_out", "already_opted_out", "already_handed_off", "deferred"]);

class RunFailure extends Error {
  constructor(message: string, readonly endReason = "error") {
    super(message);
  }
}

export interface RunOptions {
  persona: Persona;
  door: Door;
  deliver: Deliver;
  model: PersonaModel;
  db: Db;
  phone: string;
  runId: string;
  maxTurns: number;
  sleep?: (ms: number) => Promise<void>;
  /** n8n door only: how often to look for the post-welcome reply. */
  pollMs?: number;
}

export const runPersona = async (options: RunOptions): Promise<Report> => {
  const { persona, door, deliver, model, db, phone, runId, maxTurns } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = options.pollMs ?? 10_000;

  if (!phone.startsWith(SYNTHETIC_PHONE_PREFIX)) throw new Error(`telefone não sintético: ${phone}`);

  const history: Array<{ role: "user" | "assistant"; content: string }> = [{ role: "user", content: KICKOFF }];
  const transcript: TranscriptEntry[] = [];
  let endReason = "max_turns";
  let failure: string | null = null;
  let costBrl: number | null = null;
  let conversationId: string | null = null;
  let orderReady = false;

  const judge = (body: TurnBody): "continue" | "end" => {
    if (typeof body.costBrl === "number") costBrl = body.costBrl;
    // Flagged only. The runner never forwards anything to checkout or Coinzz.
    if (body.orderReady === true || (body.order !== undefined && body.order !== null)) orderReady = true;
    const status = body.status;
    if (status && CONTINUES.has(status)) return "continue";
    if (status && ENDS.has(status)) return "end";
    if (status === "error") throw new RunFailure(`status error no corpo: ${JSON.stringify(body.error ?? body)}`);
    if (status === "duplicate") throw new RunFailure("status duplicate: o runner reenviou um externalId");
    if (status === "resume_without_welcome") {
      throw new RunFailure("status resume_without_welcome: a recepção não ficou gravada em welcomed_at");
    }
    throw new RunFailure(`status desconhecido: ${JSON.stringify(status ?? null)}`);
  };

  const valenSays = (body: TurnBody, text?: string) => {
    const said = text ?? (typeof body.reply === "string" ? body.reply : "");
    transcript.push({ from: "valen", text: said, ...(body.status ? { status: body.status } : {}), body });
    return said;
  };

  /** One persona message in, everything Valen said back out. */
  const exchange = async (inbound: Inbound): Promise<{ said: string[]; verdict: "continue" | "end" }> => {
    const first = await deliver(inbound);
    if (first.status !== "welcomed") {
      const verdict = judge(first);
      return { said: [valenSays(first)], verdict };
    }

    const said = [valenSays(first)];
    if (door !== "n8n") {
      // Simulate n8n's `Wait` node: same payload, `resume: true`, right away.
      const resumed = await deliver({ ...inbound, resume: true });
      const verdict = judge(resumed);
      said.push(valenSays(resumed));
      return { said, verdict };
    }

    // n8n resumes by itself; the real reply only shows up in `messages`.
    const conversation = await db.conversationFor(phone);
    if (!conversation) throw new RunFailure("webhook respondeu welcomed sem linha em conversations");
    conversationId = conversation.id;
    const deadline = ((first.resumeInSeconds ?? 120) + 90) * 1000;
    for (let waited = 0; waited <= deadline; waited += pollMs) {
      const outbound = await db.outbound(conversation.id);
      if (outbound.length >= 2) {
        for (const text of outbound.slice(1)) said.push(valenSays({ status: "resumed_by_n8n" }, text));
        return { said, verdict: "continue" };
      }
      await sleep(pollMs);
    }
    throw new RunFailure("o n8n não fez o resume: nenhuma resposta depois da recepção (nó Wait ausente?)");
  };

  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      const { text, ended } = parsePersonaReply(await model.next(persona.system, history));
      if (!text) {
        endReason = "persona_left";
        break;
      }
      transcript.push({ from: "persona", text });
      history.push({ role: "assistant", content: text });

      const { said, verdict } = await exchange({ externalId: `${runId}-${turn}`, from: phone, body: text });

      if (turn === 1 && !conversationId) {
        const conversation = await db.conversationFor(phone);
        if (!conversation) throw new RunFailure("a porta respondeu sem criar linha em conversations");
        conversationId = conversation.id;
      }

      if (verdict === "end") {
        endReason = transcript.at(-1)?.status ?? "end";
        break;
      }
      if (ended) {
        endReason = "persona_finished";
        break;
      }
      const joined = said.filter(Boolean).join("\n");
      history.push({ role: "user", content: joined || NO_REPLY });
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    endReason = error instanceof RunFailure ? error.endReason : "error";
  }

  let stage: string | null = null;
  let gateTraces: unknown[] = [];
  const conversation = await db.conversationFor(phone).catch(() => null);
  if (conversation) {
    stage = conversation.stage;
    costBrl ??= conversation.cost_brl;
    gateTraces = await db.gateTraces(conversation.id).catch(() => []);
  }

  return {
    persona: persona.name,
    door,
    doorNote: DOOR_NOTES[door],
    phone,
    runId,
    transcript,
    endReason,
    failure,
    costBrl,
    stage,
    gateTraces,
    orderReady,
  };
};

export const renderMarkdown = (report: Report): string => {
  const lines = [
    `# ${report.persona} — ${report.failure ? "FALHOU" : "concluída"}`,
    "",
    ...(report.orderReady
      ? [
          "> **ORDER_READY** — a função sinalizou pedido pronto (`orderReady` ou `order`). O runner não " +
            "repassou nada a checkout/Coinzz; confira que nenhum pedido real nasceu.",
          "",
        ]
      : []),
    `- Porta: \`${report.door}\` — ${report.doorNote}`,
    `- Telefone sintético: \`${report.phone}\` · execução \`${report.runId}\``,
    `- Fim: \`${report.endReason}\`${report.failure ? ` — **${report.failure}**` : ""}`,
    `- Estágio: \`${report.stage ?? "—"}\` · custo: ${report.costBrl === null ? "—" : `R$ ${report.costBrl.toFixed(4)}`}`,
    `- Gates que vetaram: ${
      report.gateTraces
        .filter((t) => (t as { verdict?: string }).verdict === "block")
        .map((t) => `\`${(t as { gate?: string }).gate}\``)
        .join(", ") || "nenhum"
    }`,
    "",
    "## Conversa",
    "",
  ];
  for (const entry of report.transcript) {
    const who = entry.from === "persona" ? "**Cliente**" : `**Valen** (\`${entry.status ?? "?"}\`)`;
    lines.push(`${who}: ${entry.text || "_(sem texto)_"}`, "");
  }
  return lines.join("\n");
};
