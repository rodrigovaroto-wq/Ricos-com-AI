/**
 * The pure half of the Hermes supervisor run (R11.2, R11.6): the evidence bundle Hermes
 * reads, and the validation its proposals go through before anyone sees them.
 *
 * Hermes is a model, and a model's proposal is a claim. Two claims are checked here
 * mechanically instead of trusted: that every excerpt it cites is really in the
 * conversation (a proposal built on an invented quote is worse than none), and that it
 * proposes nothing this project decided not to do (CLAUDE.md, "Cinco coisas").
 */
import type { Conversation } from "./persona-scorecard.js";

/** LGPD: what leaves the database for a model is masked first — the supervisor needs the
 * sentence, never the phone, CPF, CEP or e-mail in it. */
export function maskPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\b\d{5}-?\d{3}\b/g, "[cep]")
    .replace(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]");
}

/** One conversation as Hermes reads it: every Malu reply with the vetoes it took first. */
export function renderConversation(c: Conversation): string {
  const lines = [`# ${c.persona}`, ""];
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

export interface Evidence {
  conversa: string;
  mensagem?: number;
  trecho: string;
}

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

const TARGET = /^(?:gate:[a-z_]+|prompt|config:[\w.]+|regua|interpretador|tamanho|n8n:[\w\s—-]+|operador)$/;

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

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/** Every excerpt must be a verbatim substring of the conversation it names. */
export function checkProposals(raw: unknown, conversations: ReadonlyMap<string, string>): Checked[] {
  const list = (raw as { propostas?: unknown })?.propostas;
  if (!Array.isArray(list)) throw new Error("propostas.json sem a lista `propostas`");
  return list.slice(0, 5).map((p: Proposal) => {
    const problems: string[] = [];
    for (const k of ["alvo", "o_que", "por_que", "objetivo", "como_medir"] as const)
      if (typeof p?.[k] !== "string" || !p[k].trim()) problems.push(`campo ${k} vazio`);
    if (typeof p?.alvo === "string" && !TARGET.test(p.alvo.trim())) problems.push(`alvo desconhecido: ${p.alvo}`);
    if (!["alta", "media", "baixa"].includes(p?.severidade)) problems.push("severidade inválida");
    if (!Array.isArray(p?.evidencias) || p.evidencias.length === 0) problems.push("sem evidência");
    for (const e of Array.isArray(p?.evidencias) ? p.evidencias : []) {
      const text = conversations.get(e?.conversa);
      if (!text) problems.push(`conversa inexistente: ${e?.conversa}`);
      else if (!e?.trecho || !norm(text).includes(norm(e.trecho))) problems.push(`trecho não está na conversa ${e.conversa}: "${String(e?.trecho).slice(0, 60)}"`);
    }
    if (typeof p?.alvo === "string" && p.alvo.startsWith("gate:") && /afrouxa|liberar|deixar passar/i.test(`${p.o_que} ${p.objetivo}`) && !p.mentira_vizinha?.trim())
      problems.push("afrouxa gate sem a mentira vizinha que deve continuar vetada");
    // Only what the proposal asks for: the evidence may quote a lie it wants removed.
    const asks = [p?.o_que, p?.objetivo, p?.como_medir].join(" ");
    for (const [re, why] of FORBIDDEN) if (re.test(asks)) problems.push(`propõe o que foi decidido não fazer: ${why}`);
    return { proposal: p, ok: problems.length === 0, problems };
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
