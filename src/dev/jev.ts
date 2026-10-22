/**
 * TypeSafe's Jev, the decision model (P2.1, operator 2026-10-22): typed questions about a text, answered with probabilities.
 * It never writes text and never runs in a conversation turn (R11.2): only here, in the offline supervisor's batch, beside
 * Hermes, in shadow — what it answers informs Hermes and the operator and changes nothing by itself (R11.6). Where it and a gate
 * disagree, the gate has the last word until Jev's reliability is measured (P3.2).
 *
 * Direct API (one `fetch`, no SDK): `POST https://api.typesafe.ai/v1/systemone` with `{ model, state, questions }`, answered
 * `{ model, answers, usage: { input_tokens, output_tokens } }` (docs.typesafe.ai, quickstart). The version is PINNED — the
 * `jev-latest` alias moves without notice and the thresholds were measured on one version (docs.typesafe.ai/models).
 *
 * Fails open: no key, a timeout, an HTTP error or the run's ceiling reached → `null`, and the caller goes on without Jev.
 * Price: US$ 0.042 per million input tokens, output free (docs, 2026-10-22). The ceiling is US$ 0.15 a run (operator, P2.5).
 * What goes: the original text of the messages (operator decision P2.3, 2026-10-22: not masked) — never the phone, the name
 * field, the CPF field or the address of the lead, which no question reads.
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** Pinned (docs: pin a versioned id when thresholds were tuned on it). Changing it means running `pnpm jev:avaliar` again. */
export const JEV_MODEL = "jev-1.13.0";
export const JEV_USD_PER_M_INPUT = 0.042;
/** The operator's ceiling per run (P2.5, 2026-10-22). */
export const JEV_MAX_USD = 0.15;

export type JevQuestion =
  | { readonly type: "noul"; readonly instructions: string }
  | { readonly type: "choice"; readonly instructions: string; readonly criteria: Readonly<Record<string, string>> }
  | { readonly type: "score"; readonly instructions: string; readonly criteria: readonly string[] };

export type JevAnswer =
  | { readonly type: "noul"; readonly noul: number }
  | { readonly type: "choice"; readonly choice: string; readonly confidence: number; readonly probabilities: Readonly<Record<string, number>> }
  | { readonly type: "score"; readonly score: number; readonly confidence: number; readonly probabilities: Readonly<Record<string, number>> };

export interface JevResult {
  readonly model: string;
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly inputTokens: number;
  readonly costUsd: number;
}

export type JevFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** One answer as the API wrote it, or null when its shape is not the type asked (never trusted blindly). */
export const readAnswer = (q: JevQuestion, a: unknown): JevAnswer | null => {
  const o = a as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (q.type === "noul") return num(o.noul) && o.noul >= 0 && o.noul <= 1 ? { type: "noul", noul: o.noul } : null;
  const probabilities = o.probabilities && typeof o.probabilities === "object" ? (o.probabilities as Record<string, number>) : null;
  if (!probabilities || !num(o.confidence)) return null;
  if (q.type === "choice") return typeof o.choice === "string" && o.choice in q.criteria ? { type: "choice", choice: o.choice, confidence: o.confidence, probabilities } : null;
  return num(o.score) && o.score >= 0 && o.score <= q.criteria.length - 1 ? { type: "score", score: o.score, confidence: o.confidence, probabilities } : null;
};

/**
 * The run's budget: every call adds its cost, and once the ceiling is reached no further call goes out (the rest of the run
 * goes on without Jev). The ceiling is checked before a call with the estimate of what it will cost, so one call cannot jump it.
 */
export class JevBudget {
  spentUsd = 0;
  calls = 0;
  refused = 0;
  constructor(readonly maxUsd: number = JEV_MAX_USD) {}
  /** ~4 characters a token for Portuguese text, rounded up: a guard, not the bill (the bill is `usage.input_tokens`). */
  allows(chars: number): boolean {
    const estimate = (Math.ceil(chars / 3) * JEV_USD_PER_M_INPUT) / 1e6;
    return this.spentUsd + estimate <= this.maxUsd;
  }
}

export const askJev = async (
  state: string,
  questions: Readonly<Record<string, JevQuestion>>,
  opts: { apiKey: string | undefined; budget: JevBudget; fetch?: JevFetch; model?: string; timeoutMs?: number },
): Promise<JevResult | null> => {
  if (!opts.apiKey || Object.keys(questions).length === 0) return null;
  const body = JSON.stringify({ model: opts.model ?? JEV_MODEL, state, questions });
  if (!opts.budget.allows(body.length)) {
    opts.budget.refused += 1;
    return null;
  }
  const f = opts.fetch ?? (globalThis.fetch as unknown as JevFetch);
  try {
    const res = await f(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { model?: unknown; answers?: Record<string, unknown>; usage?: { input_tokens?: unknown } };
    const inputTokens = num(j.usage?.input_tokens) ? j.usage!.input_tokens as number : Math.ceil(body.length / 3);
    const costUsd = (inputTokens * JEV_USD_PER_M_INPUT) / 1e6;
    opts.budget.spentUsd += costUsd;
    opts.budget.calls += 1;
    const answers: Record<string, JevAnswer> = {};
    for (const [id, q] of Object.entries(questions)) {
      const a = readAnswer(q, j.answers?.[id]);
      if (a) answers[id] = a;
    }
    return { model: typeof j.model === "string" ? j.model : (opts.model ?? JEV_MODEL), answers, inputTokens, costUsd };
  } catch {
    return null;
  }
};
