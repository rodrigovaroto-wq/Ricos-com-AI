/**
 * The daily follow-up (pipeline, phase 6, item 23), as a pure function over the rows of the
 * evaluation views (migration 0018). No I/O here, so a test holds what the operator reads;
 * `painel.ts` fetches the rows and prints.
 *
 * Only absolute facts raise an alert — a conversation above the cost ceiling, a cost counter
 * that disagrees with `llm_calls`, a handoff waiting for a person. Rates are shown, never
 * judged: the floor that says when a rate may be judged is the operator's, written before
 * the first number (docs/agente-ia/05-plano/08-piso-de-amostra.md).
 */

export interface OutcomeRow {
  turns: number;
  sent: number;
  fallbacks: number;
  handoffs: number;
  deferred: number;
  stopped: number;
  opted_out: number;
  fallback_rate: number | null;
  handoff_rate: number | null;
  avg_rewrites: number | null;
  cost_brl: number | null;
}
export interface GateRow {
  gate: string;
  checks: number;
  blocks: number;
  warns: number;
}
export interface CostRow {
  conversation_id: string;
  stage: string;
  model_calls: number;
  cost_brl: number;
  counter_drift_brl: number;
}
export interface FunnelRow {
  origin: string;
  stage: string;
  stage_order: number | null;
  conversations: number;
}
export interface AttributionRow {
  ad: string;
  headline: string | null;
  leads: number;
  leads_ordered: number;
  leads_delivered: number;
  leads_opted_out: number;
}

export interface PainelData {
  day: string;
  outcomes: OutcomeRow | null;
  gates: GateRow[];
  costs: CostRow[];
  funnel: FunnelRow[];
  attribution: AttributionRow[];
}

/** PostgREST returns `numeric` as a string; everything numeric goes through here. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const brl = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;
const pct = (v: number | null): string => (v === null ? "—" : `${(num(v) * 100).toFixed(1).replace(".", ",")}%`);

/** The São Paulo calendar day before `now`, as `YYYY-MM-DD` — the day the operator calls "ontem". */
export const yesterdayInSaoPaulo = (now: Date): string => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export interface Painel {
  text: string;
  /** Absolute facts only; a non-empty list makes the command exit 1. */
  alerts: string[];
}

export const renderPainel = (data: PainelData, ceilingBrl: number | null): Painel => {
  const alerts: string[] = [];
  const lines: string[] = [`Painel do dia ${data.day} (dia de São Paulo)`, ""];

  const o = data.outcomes;
  lines.push("Turnos");
  if (!o || num(o.turns) === 0) lines.push("  nenhum turno registrado neste dia");
  else {
    lines.push(
      `  ${num(o.turns)} turnos: ${num(o.sent)} enviados, ${num(o.fallbacks)} fallback, ${num(o.handoffs)} handoff, ` +
        `${num(o.deferred)} adiados, ${num(o.stopped)} parados, ${num(o.opted_out)} opt-out`,
      `  fallback ${pct(o.fallback_rate)} · handoff ${pct(o.handoff_rate)} · reescritas por turno ${num(o.avg_rewrites).toFixed(2).replace(".", ",")}`,
      `  custo dos turnos ${brl(num(o.cost_brl))}`,
    );
    if (num(o.handoffs) > 0) alerts.push(`${num(o.handoffs)} handoff(s) no dia: conferir se alguém respondeu cada cliente`);
  }

  lines.push("", "Gates que vetaram");
  const blocking = data.gates.filter((g) => num(g.blocks) > 0).sort((a, b) => num(b.blocks) - num(a.blocks));
  if (blocking.length === 0) lines.push("  nenhum veto");
  for (const g of blocking) lines.push(`  ${g.gate}: ${num(g.blocks)} de ${num(g.checks)} (${pct(num(g.blocks) / num(g.checks))})`);

  lines.push("", "Custo por conversa (conversas iniciadas no dia)");
  if (data.costs.length === 0) lines.push("  nenhuma conversa");
  else {
    const costs = data.costs.map((c) => num(c.cost_brl));
    const total = costs.reduce((a, b) => a + b, 0);
    lines.push(`  ${costs.length} conversas · total ${brl(total)} · média ${brl(total / costs.length)} · maior ${brl(Math.max(...costs))}`);
    if (ceilingBrl === null) lines.push("  teto não conferido: sem BUSINESS_CONFIG nem config/business.json");
    else {
      const above = data.costs.filter((c) => num(c.cost_brl) > ceilingBrl);
      lines.push(`  teto com folga ${brl(ceilingBrl)}: ${above.length} acima`);
      for (const c of above) alerts.push(`conversa ${c.conversation_id} custou ${brl(num(c.cost_brl))}, acima do teto ${brl(ceilingBrl)}`);
    }
    const drift = data.costs.filter((c) => Math.abs(num(c.counter_drift_brl)) >= 0.0001);
    for (const c of drift)
      alerts.push(`conversa ${c.conversation_id}: contador de custo difere de llm_calls em ${brl(num(c.counter_drift_brl))}`);
  }

  lines.push("", "Funil (conversas iniciadas no dia, estágio de agora)");
  if (data.funnel.length === 0) lines.push("  vazio");
  for (const origin of ["ad", "organic"]) {
    const rows = data.funnel.filter((f) => f.origin === origin).sort((a, b) => num(a.stage_order) - num(b.stage_order));
    if (rows.length === 0) continue;
    lines.push(`  ${origin === "ad" ? "anúncio" : "orgânico"}: ${rows.map((r) => `${r.stage} ${num(r.conversations)}`).join(" · ")}`);
  }
  const lost = data.funnel.filter((f) => f.stage === "perdido").reduce((a, f) => a + num(f.conversations), 0);
  lines.push(`  perdido: ${lost}`);

  lines.push("", "Atribuição (desde o início)");
  if (data.attribution.length === 0) lines.push("  nenhum lead");
  for (const a of [...data.attribution].sort((x, y) => num(y.leads) - num(x.leads)))
    lines.push(
      `  ${a.ad}${a.headline ? ` (${a.headline})` : ""}: ${num(a.leads)} leads, ${num(a.leads_ordered)} com pedido, ` +
        `${num(a.leads_delivered)} entregues, ${num(a.leads_opted_out)} opt-out`,
    );

  lines.push("", alerts.length ? "ALERTAS" : "Sem alertas.");
  for (const a of alerts) lines.push(`  - ${a}`);
  return { text: lines.join("\n"), alerts };
};
