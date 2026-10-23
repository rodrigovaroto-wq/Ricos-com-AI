/**
 * The timing of the conversations, for Hermes (P3.3, operator 2026-10-22): read from the SQL views of 0032, never computed by a
 * model ("SQL, porque o JEV erra em tempo"). Pure: rows in, markdown out.
 */
import { maskPii } from "./hermes-core.js";

type Row = Record<string, unknown>;
const n = (x: unknown) => (typeof x === "number" ? x : Number(x ?? 0));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

export const renderTiming = (t: { latency: Row[]; ruler: Row[]; byHour: Row[]; lastWord: Row[] }): string => {
  const kinds: Record<string, string> = {
    still_there: "\"Ainda está aí?\" (10 min)",
    silence_1: "1º lembrete de silêncio",
    silence_2: "2º lembrete",
    silence_3: "3º lembrete",
    checkout_reminder: "lembrete do checkout",
  };
  const answered = t.byHour.filter((r) => n(r.sent) >= 3).sort((a, b) => n(b.answered_24h) / n(b.sent) - n(a.answered_24h) / n(a.sent));
  const words = new Map<string, number>();
  for (const r of t.lastWord) {
    // Malu's checkout link carries her name, phone and CPF in the query: masked like the conversations (security review, 2026-10-22).
    const k = maskPii(String(r.body ?? "")).replace(/\s+/g, " ").slice(0, 120);
    words.set(k, (words.get(k) ?? 0) + 1);
  }
  return [
    "# O tempo das conversas (views do banco, nunca conta de modelo)",
    "",
    "Use estes números como estão; não recalcule. Eles dizem **quando** falar e **qual** toque traz a cliente de volta.",
    "",
    "## Quanto a Malu demora para responder",
    ...(t.latency.length ? t.latency.slice(-7).map((r) => `- ${r.day}: mediana ${n(r.p50_seconds)} s · 90% em até ${n(r.p90_seconds)} s (${n(r.replies)} respostas)`) : ["- (sem dado)"]),
    "",
    "## Qual toque da régua traz a cliente de volta (resposta em 24 h)",
    ...(t.ruler.length ? t.ruler.map((r) => `- ${kinds[String(r.kind)] ?? r.kind}: ${n(r.answered_24h)} de ${n(r.sent)} (${pct(n(r.answered_24h), n(r.sent))})`) : ["- (sem dado)"]),
    "",
    "## Horário do toque e retorno (hora de São Paulo, só horas com 3 toques ou mais)",
    ...(answered.length ? answered.map((r) => `- ${n(r.hour)}h: ${n(r.answered_24h)} de ${n(r.sent)} (${pct(n(r.answered_24h), n(r.sent))})`) : ["- (sem dado)"]),
    "",
    "## A última mensagem da Malu antes de a cliente sumir (sem pedido, 24 h de silêncio)",
    ...(words.size
      ? [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, k]) => `- ${k}× "${w}"`)
      : ["- (sem dado)"]),
    "",
  ].join("\n");
};
