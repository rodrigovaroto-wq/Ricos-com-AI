/**
 * Daily follow-up over the evaluation views (pipeline, phase 6, item 23). Read-only.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... pnpm dev:painel             # yesterday, São Paulo
 *   SUPABASE_SERVICE_ROLE_KEY=... pnpm dev:painel 2026-10-02  # a given day
 *
 * Needs migration 0018 applied. Exits 1 when an absolute alert fires (cost above the
 * ceiling, cost counter drift, handoff), so a cron can mail on failure.
 *
 * The URL is Encorpa's by default and is NOT read from `SUPABASE_URL`: in the Claude Code
 * cloud container that variable points to another project. Override with
 * PAINEL_SUPABASE_URL only on purpose. A legacy JWT key whose `ref` is another project is
 * refused before any request.
 */
import { existsSync } from "node:fs";
import { costCeilingBrl, loadBusinessConfig, type BusinessConfig } from "../config/business.js";
import { renderPainel, yesterdayInSaoPaulo, type PainelData } from "./painel-core.js";

const BASE = process.env.PAINEL_SUPABASE_URL ?? "https://hbmkgakzrqmdlsvszjeo.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente (a service_role do projeto da Encorpa)");

const ref = new URL(BASE).hostname.split(".")[0];
const claims = KEY.split(".").length === 3 ? JSON.parse(Buffer.from(KEY.split(".")[1]!, "base64url").toString()) : null;
if (claims?.ref && claims.ref !== ref) throw new Error(`a chave é do projeto ${claims.ref}, não de ${ref}`);

const day = process.argv[2] ?? yesterdayInSaoPaulo(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`dia inválido: ${day} (use AAAA-MM-DD)`);

const get = async <T>(path: string): Promise<T[]> => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
};

const config: BusinessConfig | null = process.env.BUSINESS_CONFIG
  ? (JSON.parse(process.env.BUSINESS_CONFIG) as BusinessConfig)
  : existsSync("config/business.json")
    ? loadBusinessConfig()
    : null;

const weekBefore = new Date(`${day}T12:00:00Z`);
weekBefore.setUTCDate(weekBefore.getUTCDate() - 6);
const since = weekBefore.toISOString().slice(0, 10);

const [outcomes, gates, costs, watch, funnel, attribution] = await Promise.all([
  get<PainelData["outcomes"] & object>(`eval_turn_outcomes?day=eq.${day}`),
  get<PainelData["gates"][number]>(`eval_gate_blocks?day=eq.${day}`),
  get<PainelData["costs"][number]>(`eval_conversation_cost?day=eq.${day}`),
  get<PainelData["watch"][number]>(`eval_conversation_cost?day=gte.${since}&day=lte.${day}`),
  get<PainelData["funnel"][number]>(`eval_funnel?day=eq.${day}`),
  get<PainelData["attribution"][number]>("eval_attribution"),
]);

const painel = renderPainel(
  { day, outcomes: outcomes[0] ?? null, gates, costs, watch, funnel, attribution },
  config ? costCeilingBrl(config) : null,
);
console.log(painel.text);
process.exitCode = painel.alerts.length ? 1 : 0;
