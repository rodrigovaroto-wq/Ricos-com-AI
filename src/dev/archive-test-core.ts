/**
 * Real test rounds (operator, 2026-10-13): three people test per round; when the round is done every conversation is
 * kept in the repository with its analysis, and only then are the test numbers deleted so the next round starts from
 * zero. This file is the pure part — the rows of one tester rendered as a readable transcript. IO is in archive-test.ts.
 */
import { maskPii } from "./hermes-core.js";

export interface TesterRows {
  label: string;
  phone: string;
  lead: Record<string, unknown> & { id: string; created_at: string };
  conversations: Array<{ id: string; stage: string | null; created_at: string }>;
  messages: Array<{ conversation_id: string; direction: string; body: string | null; created_at: string }>;
  outcomes: Array<{ conversation_id: string; outcome: string; reason: string | null; rewrites: number | null; cost_brl: number | null; duration_ms: number | null; agent_version: number | null; created_at: string }>;
  vetoes: Array<{ conversation_id: string; gate: string; verdict: string; detail: unknown; created_at: string }>;
  followups: Array<{ conversation_id: string; kind: string; status: string; run_at: string; sent_at: string | null }>;
  orders: Array<{ status: string; payment_method: string | null; size: string | null; units: number | null; amount_brl: number | null; created_at: string }>;
}

/** Only the last four digits of a phone go into the repository. */
export const phoneTail = (phone: string): string => `…${phone.replace(/\D/g, "").slice(-4)}`;

const spTime = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** The lead without the data that identifies her: identity and address stay out, the rest is the funnel. */
export const leadFacts = (lead: TesterRows["lead"]): Record<string, unknown> => {
  const { identity: _identity, address, phone: _phone, name: _name, ...rest } = lead;
  const a = (address ?? {}) as { codAvailable?: unknown; city?: unknown; state?: unknown };
  return { ...rest, region: { codAvailable: a.codAvailable ?? null, city: a.city ?? null, state: a.state ?? null } };
};

/** One tester's whole test as Markdown: messages and, under each Malu turn, its outcome and the vetoes it took. */
export const renderTester = (r: TesterRows): string => {
  const lines = [`## ${r.label} (${phoneTail(r.phone)})`, ""];
  const f = leadFacts(r.lead);
  lines.push(
    `- Lead criado: ${spTime(r.lead.created_at)} · braço: \`${JSON.stringify(f.arm ?? null)}\` · tamanho: ${f.size ?? "—"} · caminho: ${f.payment_choice ?? "—"}` +
      ` · região com pagamento na entrega: ${JSON.stringify((f.region as { codAvailable: unknown }).codAvailable)} · pessoa chamada: ${f.handoff_at ? spTime(String(f.handoff_at)) : "não"}` +
      ` · opt-out: ${f.opted_out_at ? "sim" : "não"}`,
  );
  for (const o of r.orders) lines.push(`- Pedido: ${o.status} · ${o.payment_method ?? "—"} · ${o.units ?? 1} peça(s) ${o.size ?? ""} · R$ ${o.amount_brl ?? "—"}`);
  for (const c of r.conversations) {
    lines.push("", `### Conversa ${c.id.slice(0, 8)} — estágio final \`${c.stage ?? "—"}\``, "");
    const events = [
      ...r.messages.filter((m) => m.conversation_id === c.id).map((m) => ({ at: m.created_at, kind: "m" as const, m })),
      ...r.outcomes.filter((o) => o.conversation_id === c.id).map((o) => ({ at: o.created_at, kind: "o" as const, o })),
      ...r.vetoes.filter((v) => v.conversation_id === c.id && v.verdict !== "pass").map((v) => ({ at: v.created_at, kind: "v" as const, v })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    for (const e of events) {
      if (e.kind === "m") {
        const who = e.m.direction === "inbound" ? "**Cliente**" : "**Malu**";
        lines.push(`${spTime(e.at)} ${who}: ${maskPii(e.m.body ?? "").replace(/\n+/g, " / ")}`, "");
      } else if (e.kind === "v") {
        lines.push(`  - veto \`${e.v.gate}\` (${e.v.verdict}): ${maskPii(String(typeof e.v.detail === "string" ? e.v.detail : JSON.stringify(e.v.detail ?? "")).slice(0, 240))}`);
      } else {
        const o = e.o;
        lines.push(
          `  - desfecho \`${o.outcome}\`${o.reason ? ` — ${maskPii(o.reason)}` : ""} · reescritas ${o.rewrites ?? 0} · R$ ${(o.cost_brl ?? 0).toFixed(4)}` +
            `${o.duration_ms != null ? ` · ${(o.duration_ms / 1000).toFixed(1)} s` : ""} · v${o.agent_version ?? "?"}`,
        );
      }
    }
    const touches = r.followups.filter((t) => t.conversation_id === c.id);
    if (touches.length) {
      lines.push("", "Toques da régua:");
      for (const t of touches) lines.push(`- ${t.kind}: ${t.status} · marcado ${spTime(t.run_at)}${t.sent_at ? ` · enviado ${spTime(t.sent_at)}` : ""}`);
    }
  }
  const cost = r.outcomes.reduce((s, o) => s + (o.cost_brl ?? 0), 0);
  lines.push("", `Custo total da Malu: R$ ${cost.toFixed(4)}`, "");
  return lines.join("\n");
};

/** The round's file: every tester, then the sections the analysis fills (found, cause, fix, status). */
export const renderRound = (round: string, testers: readonly TesterRows[], scripts: string | null): string =>
  [
    `# Teste real — rodada ${round}`,
    "",
    `> Arquivado por \`pnpm dev:arquivar-teste\` em ${new Date().toISOString().slice(0, 10)}. CPF, e-mail, CEP e telefone mascarados;`,
    `> nome e endereço ficam fora. Os dados brutos (sem identidade) estão no \`.json\` ao lado.`,
    "",
    ...(scripts ? ["## Roteiro desta rodada", "", scripts, ""] : []),
    "## Conversas",
    "",
    ...testers.map(renderTester),
    "## Análise",
    "",
    "_Preenchida depois de ler as conversas, pelo roteiro de `docs/operacao/auditar-conversa-real.md` §3._",
    "",
    "## Achados → conserto → guarda",
    "",
    "| # | Achado (frase literal) | Causa | Conserto | Guarda | Estado |",
    "|---|---|---|---|---|---|",
    "",
  ].join("\n");
