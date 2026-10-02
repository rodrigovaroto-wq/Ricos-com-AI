/**
 * The pure half of the Hermes supervisor run (R11.2, R11.6): the evidence bundle Hermes
 * reads, and the validation its proposals go through before anyone sees them.
 *
 * Hermes is a model, and a model's proposal is a claim. Two claims are checked here
 * mechanically instead of trusted: that every excerpt it cites is really in the
 * conversation (a proposal built on an invented quote is worse than none), and that it
 * proposes nothing this project decided not to do (CLAUDE.md, "Cinco coisas").
 */
import { scoreRun, type Conversation, type Entry } from "./persona-scorecard.js";
import { SYNTHETIC_PHONE_PREFIX } from "./persona-run-core.js";

/** LGPD: what leaves the database for a model is masked first — the supervisor needs the
 * sentence, never the phone, CPF, CEP or e-mail in it. */
export function maskPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\b\d{5}-?\d{3}\b/g, "[cep]")
    .replace(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]");
}

/** One conversation as Hermes reads it: every Malu reply with the vetoes it took first.
 * `versions`: the agent versions its turns ran under (production), so a premise the model
 * judges can be set against the previous version (L3 item 8). */
export function renderConversation(c: Conversation, versions: readonly number[] = []): string {
  const lines = [`# ${c.persona}`, ""];
  if (versions.length) lines.push(`${versions.length > 1 ? "versões" : "versão"} da Malu: ${versions.map((v) => `v${v}`).join(", ")}`, "");
  let n = 0;
  for (const e of c.transcript) {
    const text = maskPii(e.text ?? "").trim();
    if (e.from === "persona") {
      lines.push(`**cliente:** ${text}`, "");
      continue;
    }
    if (e.status === "welcomed") {
      lines.push(`**recepção automática:** ${text}`, "");
      continue;
    }
    n += 1;
    lines.push(`**Malu ${n}${e.status && e.status !== "replied" ? ` (${e.status})` : ""}:** ${text}`);
    // The vetoed drafts are not stored — only which gate refused them. Saying so matters:
    // the first calibration read the vetoes as aimed at the final text, which had passed.
    for (const v of e.vetoes ?? []) lines.push(`  - veto num rascunho anterior (o texto vetado não foi gravado; o texto acima passou): ${v.gate}${v.detail ? ` — ${v.detail}` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The rows `--source=supabase` reads, as PostgREST returns them. */
export interface SupabaseRows {
  conversations: Array<{ id: string; lead_id: string; welcomed_at: string | null; cost_brl: number | string | null; leads?: { phone: string } | null }>;
  messages: Array<{ conversation_id: string; direction: string; body: string | null; created_at: string }>;
  /** Blocks only: a veto belongs to the next reply that went out. */
  traces: Array<{ conversation_id: string; gate: string; detail: string | null; created_at: string }>;
  outcomes: Array<{ conversation_id: string; outcome: string; created_at: string }>;
}

/** How the persona runner spells what `turn_outcomes` records, so one scorecard reads both. */
const STATUS_OF: Record<string, string> = { send: "replied", fallback: "fallback", handoff: "handoff" };

/**
 * Production rows into the shape the scorecard and Hermes read. `messages` has no status
 * column, so the turn's outcome is joined here: the turn writes its message first and the
 * outcome right after (supabase/functions/turn/index.ts), so an outcome belongs to the
 * latest reply before it — and never to one from before the previous outcome, because
 * `deferred` and `stopped` write no message and must not take the last turn's. The welcome
 * is the first reply of a conversation with `welcomed_at`. Persona conversations
 * (SYNTHETIC_PHONE_PREFIX) are dropped: they are tests, not customers.
 */
export function rowsToConversations(rows: SupabaseRows): { conversations: Conversation[]; leads: number } {
  const at = (s: string) => Date.parse(s);
  const real = rows.conversations.filter((c) => !c.leads?.phone?.startsWith(SYNTHETIC_PHONE_PREFIX));
  const conversations = real.map((c): Conversation => {
    const mine = rows.messages.filter((m) => m.conversation_id === c.id).sort((a, b) => at(a.created_at) - at(b.created_at));
    let pending = rows.traces.filter((t) => t.conversation_id === c.id);
    const replies: Array<{ entry: Entry; t: number }> = [];
    const transcript = mine.map((m): Entry => {
      if (m.direction === "inbound") return { from: "persona", text: m.body ?? "" };
      const vetoes = pending.filter((t) => at(t.created_at) <= at(m.created_at)).map((t) => ({ gate: t.gate, detail: t.detail }));
      pending = pending.filter((t) => at(t.created_at) > at(m.created_at));
      const entry: Entry = { from: "valen", text: m.body ?? "", vetoes };
      replies.push({ entry, t: at(m.created_at) });
      return entry;
    });
    if (c.welcomed_at && replies[0]) replies[0].entry.status = "welcomed";
    // A turn answers an inbound message: its reply is after the latest one she sent before
    // the outcome. Without this bound, a handoff that wrote no message (vetoed receipt, a
    // hold that failed) would take a ruler touch sent while she was silent.
    const inbound = mine.filter((m) => m.direction === "inbound").map((m) => at(m.created_at));
    let since = -Infinity;
    const outcomes = rows.outcomes.filter((o) => o.conversation_id === c.id).sort((a, b) => at(a.created_at) - at(b.created_at));
    for (const o of outcomes) {
      const status = STATUS_OF[o.outcome];
      const floor = Math.max(since, ...inbound.filter((t) => t <= at(o.created_at)));
      const reply = status ? [...replies].reverse().find((r) => r.t <= at(o.created_at) && r.t > floor && !r.entry.status) : undefined;
      if (reply && status) reply.entry.status = status;
      since = at(o.created_at);
    }
    return { persona: `conversa-${c.id.slice(0, 8)}`, transcript, costBrl: c.cost_brl == null ? null : Number(c.cost_brl) };
  });
  return { conversations, leads: new Set(real.map((c) => c.lead_id)).size };
}

export interface Evidence {
  conversa: string;
  mensagem?: number;
  trecho: string;
  /** Today's gates on this excerpt (annotateWithGates), kept with it so the e-mail shows it. */
  hoje?: string[];
}

/** The skill's cost order (SKILL.md): what kind of problem a proposal is about. */
export const CLASSES = ["mentira", "resposta_pronta", "venda_perdida", "tom"] as const;

export interface Proposal {
  alvo: string;
  o_que: string;
  por_que: string;
  evidencias: Evidence[];
  objetivo: string;
  como_medir: string;
  mentira_vizinha?: string;
  registro?: string;
  severidade: "alta" | "media" | "baixa";
  classe: (typeof CLASSES)[number];
  /** For a lie: the sentence of the prompt (prompt.md in the bundle) that the excerpt contradicts. */
  fato_contradito?: string;
}

export interface Checked {
  proposal: Proposal;
  ok: boolean;
  problems: string[];
  /** Each cited excerpt run through today's gates: does the code already refuse it? */
  today?: Array<{ trecho: string; blockedBy: string[] }>;
}

/**
 * A proposal about a gate is a claim about code, and code can be asked. Every excerpt is
 * run through the current gate chain, so the operator sees at once whether the lie is
 * already refused today (then the leak is the path, not the gate — or it was fixed after
 * the round) and whether an "honest sentence vetoed" still is.
 */
export function annotateWithGates(checked: Checked[], blockedBy: (text: string) => string[]): Checked[] {
  return checked.map((c) =>
    c.ok ? { ...c, today: c.proposal.evidencias.map((e) => ({ trecho: e.trecho, blockedBy: blockedBy(e.trecho) })) } : c,
  );
}

export const ALREADY_VETOED = "já vetada hoje pelos gates (config de teste)";

/**
 * A lie whose every excerpt today's gates already refuse is not news for the operator: the
 * leak was fixed after the conversation (or the path, not the gate, let it out — the
 * operator can still read it among the discarded). Only lies: an honest sentence vetoed is
 * exactly a proposal that SHOULD cite a vetoed excerpt.
 */
export function discardAlreadyVetoed(checked: Checked[]): Checked[] {
  return checked.map((c) =>
    c.ok && c.proposal.classe === "mentira" && c.today?.length && c.today.every((t) => t.blockedBy.length > 0)
      ? { ...c, ok: false, problems: [ALREADY_VETOED] }
      : c,
  );
}

const TARGET = /^(?:gate:[a-z_]+|prompt|config:[\w.]+|regua|interpretador|tamanho|n8n:[\w\s—-]+|operador|reverter:v[1-9]\d*)$/;

/**
 * The five things this project decided not to do (R11.1, R11.4, R11.5, R11.2, R11.6),
 * plus the one the operator refused in R13.6. A proposal that asks for one is rejected
 * here, with the reason, before the operator spends time on it.
 */
const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/\btool[- ]?calling\b|\bfunction[- ]?calling\b|\bchamada de ferramenta/i, "tool-calling na conversa (R11.1)"],
  [/\bRAG\b|\bembedding|\bpgvector\b|\bbusca (?:por )?similaridade/i, "RAG (R11.4)"],
  [/\bvector ?store\b|\bbanco vetorial/i, "vector store para memória (R11.5)"],
  [/hermes\s+(?:dentro|no|durante)\s+(?:do\s+|o\s+)?turno/i, "Hermes dentro do turno (R11.2)"],
  [/\b(?:aplic\w+|publica\w*|deploy\w*)\s+(?:automaticamente|sozinh\w*|sem\s+(?:o\s+)?operador)/i, "auto-aplicar em produção (R11.6)"],
  [/[uú]ltimas?\s+unidades|\bestoque\s+acabando|\brestam\s+\d+|\d+\s*%\s+(?:das\s+clientes\s+)?recomend/i, "escassez ou prova social inventada (R13.6)"],
];

/** Asking a gate to let something through, in the words a model uses for it (security review, 2026-09-29). */
const LOOSENS = /afrouxa|liberar|deixar passar|remov|desativ|desliga|relax|\bisent(?:ar|e|em|ando)\b|permiti|aceitar|flexibiliz|toler|abrand|suaviz|menos r[ií]gid/i;
/** Loosening said as a negated veto: "não vetar", "não deve mais bloquear", "deixar de barrar". */
const STOP_VETO = /(?:parar|deixar) de (?:vetar|barrar|bloquear)|n[ãa]o\s+(?:(?:deve|pode|vai|precisa)\s+)?(?:mais\s+)?(?:vetar|barrar|bloquear)/i;
/** A negated verb ("o gate não deve aceitar…") asks for the opposite: read without it. */
const NEGATED = /\bn[ãa]o\s+(?:deve\s+|pode\s+|vai\s+|precisa\s+)?\S+/gi;

/** Does this text ask a gate to let more through? Both ways of saying it, and not its negation. */
export const asksToLoosen = (text: string): boolean => STOP_VETO.test(text) || LOOSENS.test(text.replace(NEGATED, " "));

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/** Every excerpt must be a verbatim substring of the conversation it names. */
/**
 * `facts` is the system prompt as the bundle carries it (prompt.md): a lie is only a lie
 * against a rule, and the rule it breaks must be quoted from there, verbatim — the same
 * check the excerpts get. Without it (older callers), the rule is required but not matched.
 */
export function checkProposals(raw: unknown, conversations: ReadonlyMap<string, string>, facts?: string): Checked[] {
  const list = (raw as { propostas?: unknown })?.propostas;
  if (!Array.isArray(list)) throw new Error("propostas.json sem a lista `propostas`");
  return list.slice(0, 5).map((p: Proposal) => {
    const problems: string[] = [];
    for (const k of ["alvo", "o_que", "por_que", "objetivo", "como_medir"] as const)
      if (typeof p?.[k] !== "string" || !p[k].trim()) problems.push(`campo ${k} vazio`);
    if (typeof p?.alvo === "string" && !TARGET.test(p.alvo.trim())) problems.push(`alvo desconhecido: ${p.alvo}`);
    if (!["alta", "media", "baixa"].includes(p?.severidade)) problems.push("severidade inválida");
    if (!CLASSES.includes(p?.classe)) problems.push("classe inválida");
    if (p?.classe === "mentira") {
      if (typeof p.fato_contradito !== "string" || !p.fato_contradito.trim()) problems.push("mentira sem o fato contradito");
      else if (facts !== undefined && !norm(facts).includes(norm(p.fato_contradito)))
        problems.push(`fato contradito não está no prompt: "${p.fato_contradito.slice(0, 60)}"`);
    }
    if (!Array.isArray(p?.evidencias) || p.evidencias.length === 0) problems.push("sem evidência");
    for (const e of Array.isArray(p?.evidencias) ? p.evidencias : []) {
      const text = conversations.get(e?.conversa);
      if (!text) problems.push(`conversa inexistente: ${e?.conversa}`);
      else if (!e?.trecho || !norm(text).includes(norm(e.trecho))) problems.push(`trecho não está na conversa ${e.conversa}: "${String(e?.trecho).slice(0, 60)}"`);
    }
    if (typeof p?.alvo === "string" && p.alvo.startsWith("gate:") && asksToLoosen(`${p.o_que} ${p.objetivo}`) && !p.mentira_vizinha?.trim())
      problems.push("afrouxa gate sem a mentira vizinha que deve continuar vetada");
    // Only what the proposal asks for: the evidence may quote a lie it wants removed.
    const asks = [p?.o_que, p?.objetivo, p?.como_medir].join(" ");
    for (const [re, why] of FORBIDDEN) if (re.test(asks)) problems.push(`propõe o que foi decidido não fazer: ${why}`);
    return { proposal: p, ok: problems.length === 0, problems };
  });
}

/** One row of the ledger (`hermes_proposals`, migration 0014). */
export interface LedgerRow {
  code: string | null;
  target: string;
  rationale: string;
  status: "proposed" | "accepted" | "rejected" | "implementing" | "published" | "failed";
  decision_reason: string | null;
  execution_ref: string | null;
  result: string | null;
  created_at: string;
  decided_at: string | null;
}

const STATUS_PT: Record<LedgerRow["status"], string> = {
  proposed: "aguardando o operador",
  accepted: "aprovada, na fila de implementação",
  rejected: "RECUSADA",
  implementing: "aprovada, sendo implementada",
  published: "aprovada e publicada",
  failed: "aprovada, mas a implementação não passou nos testes (nada foi publicado)",
};

/**
 * What Hermes reads before proposing (operator, 2026-09-25): every earlier proposal with
 * the operator's decision and reason, and the result measured after. Refused ones first —
 * they are the criterion Hermes most needs to learn, and the reason is the lesson.
 */
export function renderLedger(rows: readonly LedgerRow[]): string {
  const lines = [
    "# Decisões anteriores do operador",
    "",
    "Tudo o que você já propôs e o que o operador decidiu. **Não proponha de novo o que foi",
    "recusado**, nem com outras palavras: o motivo dele é o critério que vale daqui pra frente.",
    "Se uma proposta aprovada não atingiu o resultado, diga isso e proponha o ajuste citando o código dela.",
    "",
  ];
  if (rows.length === 0) return [...lines, "(nenhuma decisão registrada ainda)", ""].join("\n");
  const order: LedgerRow["status"][] = ["rejected", "failed", "published", "implementing", "accepted", "proposed"];
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.created_at.localeCompare(a.created_at),
  );
  for (const r of sorted) {
    lines.push(
      `## ${r.code ?? "H-?"} · ${r.target} · ${STATUS_PT[r.status]} (${(r.decided_at ?? r.created_at).slice(0, 10)})`,
      `- **Proposta:** ${maskPii(r.rationale)}`,
      ...(r.decision_reason ? [`- **Motivo do operador:** ${maskPii(r.decision_reason)}`] : []),
      ...(r.execution_ref ? [`- **Implementação:** ${r.execution_ref}`] : []),
      ...(r.result ? [`- **Resultado medido:** ${maskPii(r.result)}`] : []),
      "",
    );
  }
  return lines.join("\n");
}

const REDACTED = "(trecho guardado só em hermes_proposals, expira em 90 dias)";
/** Every quoted span of a free text replaced by the marker (the model's summary quotes too). */
export const unquote = (s: unknown) => (typeof s === "string" ? s.replace(/"[^"]*"|“[^”]*”|'[^']*'|‘[^’]*’/g, `"${REDACTED}"`) : s);

/**
 * The copy of a production run that goes to git (hermes.yml opens a PR with it), which
 * never expires — LGPD retention is 90 days (R6.3). Every excerpt and every quoted text
 * (double, single or curly quotes: over-redacting an apostrophe is the safe side) is
 * replaced; the operator reads the originals in the e-mail, from `hermes_proposals`, whose
 * `evidence` the purge clears at 90 days (migration 0020). Returns a copy.
 */
const TEXT = ["alvo", "o_que", "por_que", "objetivo", "como_medir", "mentira_vizinha", "registro", "severidade", "classe", "fato_contradito"] as const;
const LABEL = /^(?:conversa|persona)-[\w-]+$/;
/** The validator's problem names (checkProposals); anything after the name may echo the model. */
const PROBLEMS = ["campo", "alvo desconhecido", "severidade inválida", "classe inválida", "mentira sem o fato contradito", "fato contradito não está no prompt", "sem evidência", "conversa inexistente", "trecho não está na conversa", "afrouxa gate", "propõe o que foi decidido não fazer", ALREADY_VETOED, "reversão pendente"];

/**
 * Only what a proposal is — the known text keys and the evidence as {conversa, mensagem,
 * trecho} — for what `hermes_proposals.evidence` stores: a key the model invented would not
 * be reached by the purge of `evidencias` at 90 days (migration 0020).
 */
export function proposalFields(p: Proposal): Proposal {
  const r = (p ?? {}) as unknown as Record<string, unknown>;
  const out = Object.fromEntries(TEXT.filter((k) => typeof r[k] === "string").map((k) => [k, r[k]])) as unknown as Proposal;
  out.evidencias = (Array.isArray(r.evidencias) ? r.evidencias : []).map((e: Partial<Evidence> | null) => ({
    conversa: String(e?.conversa ?? ""),
    ...(typeof e?.mensagem === "number" ? { mensagem: e.mensagem } : {}),
    trecho: String(e?.trecho ?? ""),
  }));
  return out;
}

/** What the database stores for a valid proposal: its fields, each excerpt with today's gates on it. */
export function storedEvidence(c: Checked): Proposal {
  const p = proposalFields(c.proposal);
  p.evidencias = p.evidencias.map((e, i) => ({ ...e, hoje: c.today?.[i]?.blockedBy ?? [] }));
  return p;
}

export function withoutQuotes(checked: readonly Checked[]): Checked[] {
  // Only the keys a proposal has, and only as text: a rejected proposal can be anything the
  // model wrote, and its unknown keys, nested objects or string evidence would reach git.
  return checked.map((c) => {
    const p = (c.proposal ?? {}) as unknown as Record<string, unknown>;
    const proposal = Object.fromEntries(TEXT.filter((k) => typeof p[k] === "string").map((k) => [k, unquote(p[k])])) as unknown as Proposal;
    proposal.evidencias = (Array.isArray(p.evidencias) ? p.evidencias : []).map((e: Partial<Evidence> | null) => ({
      conversa: typeof e?.conversa === "string" && LABEL.test(e.conversa) ? e.conversa : "(conversa)",
      ...(typeof e?.mensagem === "number" ? { mensagem: e.mensagem } : {}),
      trecho: REDACTED,
    }));
    return {
      ok: c.ok,
      // The validator's own words, never what it echoes of the model's text.
      problems: c.problems.map((x) => PROBLEMS.find((name) => x.startsWith(name)) ?? "problema"),
      proposal,
      ...(c.today ? { today: c.today.map((t) => ({ trecho: REDACTED, blockedBy: t.blockedBy })) } : {}),
    };
  });
}

/** The operator reads this: accepted proposals first, rejected ones with the reason. */
export function renderProposals(title: string, summary: string, checked: readonly Checked[]): string {
  const lines = [`# ${title}`, "", summary.trim(), ""];
  const ok = checked.filter((c) => c.ok);
  const bad = checked.filter((c) => !c.ok);
  lines.push(`## Propostas para decidir (${ok.length})`, "");
  ok.forEach(({ proposal: p, today }, i) => {
    lines.push(
      `### H-${i + 1} · ${p.alvo} · ${p.severidade}${p.registro ? ` · retoma ${p.registro}` : ""}`,
      `- **O quê:** ${p.o_que}`,
      `- **Por quê:** ${p.por_que}`,
      `- **Objetivo:** ${p.objetivo}`,
      `- **Como medir:** ${p.como_medir}`,
      ...(p.mentira_vizinha ? [`- **Mentira vizinha que continua vetada:** ${p.mentira_vizinha}`] : []),
      `- **Evidência:**`,
      ...p.evidencias.map((e, j) => {
        const t = today?.[j];
        const now = t ? ` — **hoje:** ${t.blockedBy.length ? `vetada por ${t.blockedBy.join(", ")}` : "passa pelos gates"}` : "";
        return `  - ${e.conversa}${e.mensagem ? `, Malu ${e.mensagem}` : ""}: "${e.trecho}"${now}`;
      }),
      "",
    );
  });
  if (bad.length) {
    lines.push(`## Descartadas pela validação (${bad.length})`, "");
    for (const { proposal: p, problems } of bad) lines.push(`- ${p?.o_que ?? "(sem texto)"} — ${problems.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** One row of the `hermes_sample` view (migration 0020): a conversation and its signals. */
export interface SampleRow {
  conversation_id: string;
  created_at: string;
  fallbacks: number;
  handoffs: number;
  opt_outs: number;
  blocks: number;
  cost_brl: number | string;
}

/**
 * Which conversations Hermes reads: the ones where something went wrong first, then a
 * control of plain ones. Reading the last 50 spends most of the tokens on conversations
 * with nothing to find; reading only the flagged ones never finds the lie no signal marks
 * (a lie that passed the gates leaves no trace) — so the control is never zero.
 *
 * Order among flagged: opt-out and canned reply first (the irreversible error and the
 * agent giving up), then handoff, then vetoes, then cost; newest first on a tie.
 */
export function pickSample(rows: readonly SampleRow[], limit: number, control = Math.max(1, Math.round(limit / 5))): string[] {
  const score = (r: SampleRow) => r.opt_outs * 1000 + r.fallbacks * 100 + r.handoffs * 10 + Math.min(r.blocks, 9);
  const newest = (a: SampleRow, b: SampleRow) => Date.parse(b.created_at) - Date.parse(a.created_at);
  const flagged = rows.filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a) || Number(b.cost_brl) - Number(a.cost_brl) || newest(a, b));
  const plain = rows.filter((r) => score(r) === 0).sort((a, b) => Number(b.cost_brl) - Number(a.cost_brl) || newest(a, b));
  const plainTake = Math.min(plain.length, Math.max(control, limit - flagged.length));
  const take = [...flagged.slice(0, limit - plainTake), ...plain.slice(0, plainTake)];
  return take.slice(0, limit).map((r) => r.conversation_id);
}

/**
 * A token has no business in a document that goes to a pull request: Hermes reads customer
 * text that may carry instructions, and writes free text (security review, 2026-09-29).
 */
export function scrubSecrets(text: string): string {
  return text.replace(
    /\b(?:gh[posu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b|\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g,
    "[segredo removido]",
  );
}

/** The scorecard check a proposal names in `como_medir`, if it names one. */
export function checkIdOf(comoMedir: string | undefined): string | null {
  const ids = scoreRun([]).checks.map((c) => c.id).sort((a, b) => b.length - a.length);
  return ids.find((id) => (comoMedir ?? "").includes(id)) ?? null;
}

/**
 * The measured result of a published proposal (R14.14's "resultado medido", which until
 * 2026-09-29 was only "publicada: <url>"): the check it named, on real conversations before
 * and after it went live. A reading, not a verdict — the sample floor
 * (05-plano/08-piso-de-amostra.md §4) is the operator's to sign, and until then the text says so.
 */
export function measureEffect(comoMedir: string | undefined, before: readonly Conversation[], after: readonly Conversation[]): string {
  const id = checkIdOf(comoMedir);
  if (!id) return "sem medida automática: o como_medir não nomeia uma checagem do placar — medir à mão";
  const read = (cs: readonly Conversation[]) => {
    const c = scoreRun(cs).checks.find((x) => x.id === id)!;
    return { text: `${c.value} (meta ${c.target}, ${c.pass ? "atingida" : "não atingida"}) em ${cs.length} conversas`, n: cs.length };
  };
  const [b, a] = [read(before), read(after)];
  const note = a.n === 0 ? " — ainda sem conversa depois da publicação" : " — piso de amostra não assinado: leitura, não veredito";
  return `${id}: antes ${b.text}; depois ${a.text}${note}`;
}

/**
 * The new `result` of a published proposal: the deploy's "publicada: <run url>" stays in
 * front (it is the only link from the row to the run that published it), the reading after.
 */
export function withMeasure(previous: string | null, measure: string): string {
  const link = /^publicada: \S+/.exec(previous ?? "")?.[0];
  return link ? `${link} · medida: ${measure}` : `medida: ${measure}`;
}

/** One row of `agent_versions` (migration 0021): a publication of the turn. */
export interface AgentVersionRow {
  version: number;
  git_sha: string;
  published_at: string;
  hermes_proposal_id: string | null;
  note: string | null;
}

/**
 * The evaluation views (0018) as the bundle carries them: every count and rate is SQL's,
 * never the model's (it is weak at arithmetic, and the operator reads the same views).
 * Since 0021 also per agent version (`eval_version_outcomes`) and the version on air, so a
 * proposal can compare the newest version with the one before it.
 */
export function renderNumbers(
  outcomes: ReadonlyArray<Record<string, unknown>>,
  blocks: ReadonlyArray<Record<string, unknown>>,
  byVersion: ReadonlyArray<Record<string, unknown>> = [],
  latest: AgentVersionRow | null = null,
): string {
  const table = (rows: ReadonlyArray<Record<string, unknown>>, cols: string[]) =>
    rows.length === 0
      ? ["(sem linhas no período)"]
      : [`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${cols.map((c) => String(r[c] ?? "")).join(" | ")} |`)];
  const onAir = latest
    ? `Versão no ar: v${latest.version} (commit ${latest.git_sha.slice(0, 7)}, publicada em ${latest.published_at}, ${latest.hermes_proposal_id ? `proposta ${latest.hermes_proposal_id}` : "deploy manual, sem proposta"})`
    : "Nenhuma versão registrada em `agent_versions`: não atribua turno a versão nenhuma.";
  return [
    "# Números do período (views SQL — não recalcule)",
    "",
    "Estes números vêm do banco. Cite-os; nunca conte, some ou calcule taxa você mesmo.",
    "",
    "## Desfecho dos turnos por dia (`eval_turn_outcomes`)",
    "",
    ...table(outcomes, ["day", "turns", "sent", "fallbacks", "handoffs", "deferred", "stopped", "opted_out", "fallback_rate", "handoff_rate", "avg_rewrites", "cost_brl"]),
    "",
    "## Vetos por gate e dia (`eval_gate_blocks`)",
    "",
    ...table(blocks, ["day", "gate", "checks", "blocks", "warns", "block_rate"]),
    "",
    "## Desfecho dos turnos por versão da Malu (`eval_version_outcomes`)",
    "",
    onAir,
    "",
    ...table(
      byVersion.map((r) => ({ ...r, agent_version: r.agent_version ?? "sem versão" })),
      ["agent_version", "first_at", "last_at", "turns", "sent", "fallbacks", "handoffs", "fallback_rate", "handoff_rate", "avg_rewrites", "cost_brl"],
    ),
    "",
  ].join("\n");
}

// ── Rollback (L3 item 8 of 09-pipeline-ate-producao.md) ──────────────────────────────
/** Code prefix of a revert proposal: there is no severity column, and the decision Routine
 * (hermes/DECIDIR.md) shows every row whose code starts with it first. */
export const REVERT_CODE = "REVERTER-";
/**
 * Decided turns (send + fallback + handoff, the denominator of `handoff_rate`) each version
 * needs before the comparison runs: a run reads 50 leads (R6.2), so this is about four
 * decided turns per lead of one batch. Below it a handful of handoffs swings the rate by
 * whole points, and a revert would chase noise.
 */
export const REVERT_MIN_TURNS = 200;
/** One-sided 95% for a pooled two-proportion z: worse beyond what chance between two
 * samples of that size explains. Turns of one conversation are not independent, so this
 * is lenient, not strict — and a revert is a proposal the operator still decides. */
const REVERT_Z = 1.645;

export interface Revert {
  version: number;
  previous: number;
  latestRate: number;
  previousRate: number;
  latestTurns: number;
  previousTurns: number;
  z: number;
}

/**
 * The version on air against the newest earlier version with turns, from
 * `eval_version_outcomes` (0021): handoff worse with enough sample → revert it. Null when
 * no version is registered, either side is under REVERT_MIN_TURNS, or the rise is within
 * chance. Equal or better never fires.
 */
export function revertCheck(byVersion: ReadonlyArray<Record<string, unknown>>, latest: AgentVersionRow | null): Revert | null {
  if (!latest) return null;
  const read = (r: Record<string, unknown>) => {
    const handoffs = Number(r.handoffs ?? 0);
    const turns = Number(r.sent ?? 0) + Number(r.fallbacks ?? 0) + handoffs;
    return { version: Number(r.agent_version), handoffs, turns };
  };
  const rows = byVersion.filter((r) => r.agent_version != null).map(read);
  const cur = rows.find((r) => r.version === latest.version);
  const prev = rows.filter((r) => r.version < latest.version).sort((a, b) => b.version - a.version)[0];
  if (!cur || !prev || cur.turns < REVERT_MIN_TURNS || prev.turns < REVERT_MIN_TURNS) return null;
  const [p1, p0] = [cur.handoffs / cur.turns, prev.handoffs / prev.turns];
  const pool = (cur.handoffs + prev.handoffs) / (cur.turns + prev.turns);
  const se = Math.sqrt(pool * (1 - pool) * (1 / cur.turns + 1 / prev.turns));
  if (!(p1 > p0) || se === 0) return null;
  const z = (p1 - p0) / se;
  return z >= REVERT_Z
    ? { version: cur.version, previous: prev.version, latestRate: p1, previousRate: p0, latestTurns: cur.turns, previousTurns: prev.turns, z }
    : null;
}

const isRevertCode = (code: string | null) => code?.startsWith(REVERT_CODE) ?? false;

/** One revert per version: none when the ledger already has one for it — pending, decided
 * or published. A failed one (its implementation did not pass) is tried again. */
export function revertToWrite(r: Revert | null, ledger: readonly LedgerRow[]): Revert | null {
  if (!r) return null;
  const mine = `${REVERT_CODE}v${r.version} `;
  return ledger.some((l) => l.code?.startsWith(mine) && l.status !== "failed") ? null : r;
}

/**
 * "Nenhuma proposta nova entra antes disso" (L3 item 8): a revert waiting for the operator
 * or being implemented, or one this run writes. Not after it is published (the corrected
 * change comes back as a proposal), rejected (the operator kept the version) or failed.
 */
export function revertPending(ledger: readonly LedgerRow[], writing: boolean): boolean {
  return writing || ledger.some((l) => isRevertCode(l.code) && ["proposed", "accepted", "implementing"].includes(l.status));
}

const isRevert = (alvo: unknown) => typeof alvo === "string" && /^reverter:v\d+$/.test(alvo.trim());

/** While a revert is pending, only revert proposals are written. */
export function holdForRevert(checked: Checked[], pending: boolean): Checked[] {
  if (!pending) return checked;
  return checked.map((c) =>
    c.ok && !isRevert(c.proposal.alvo) ? { ...c, ok: false, problems: ["reversão pendente: nenhuma proposta nova entra antes dela (L3 item 8)"] } : c,
  );
}

/** The code the operator reads: H-numbers restart every run, so the day goes with them. */
export function proposalCode(alvo: string, day: string, n: number): string {
  return isRevert(alvo) ? `${REVERT_CODE}${alvo.trim().slice("reverter:".length)} ${day} H-${n}` : `${day} H-${n}`;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

/** What the deterministic revert says, in the ledger and in the bundle. */
export function revertRationale(r: Revert): string {
  return (
    `Reverter v${r.version} — handoff subiu de ${pct(r.previousRate)} em ${r.previousTurns} turnos (v${r.previous}) ` +
    `para ${pct(r.latestRate)} em ${r.latestTurns} turnos (v${r.version}), acima do que o acaso explica (z ${r.z.toFixed(2).replace(".", ",")} ≥ 1,645).`
  );
}

/** `reverter.md` in the bundle: Hermes reads it first. */
export function renderRevert(fired: Revert | null, pending: boolean): string {
  const head = "# Reversão da versão nova (L3 item 8)";
  if (!pending)
    return [
      head,
      "",
      "Nenhuma reversão pendente. Compare as conversas da versão mais nova com as da anterior",
      "(cada conversa diz `versão da Malu: vN`): se a nova mostra **premissa indevida** que a anterior",
      "não mostrava, proponha `alvo: reverter:vN` (ver a skill).",
      "",
    ].join("\n");
  return [
    head,
    "",
    `**CRÍTICO — ${fired ? `reverter v${fired.version}` : "há uma reversão aguardando o operador"}.**`,
    "",
    ...(fired ? [revertRationale(fired), "", "O sistema já gravou essa proposta de reversão; não a repita.", ""] : []),
    "Enquanto a reversão não for decidida, **só proposta de reversão** entra: nenhuma outra mudança.",
    "Qualquer outra proposta desta rodada é descartada. Sem premissa indevida nova para reverter,",
    'entregue `"propostas": []`.',
    "",
  ].join("\n");
}
