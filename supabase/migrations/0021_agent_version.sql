-- The agent (Malu) version on every turn (§5 of docs/agente-ia/05-plano/10-execucao-mes-1.md,
-- L3 item 8 of 09-pipeline-ate-producao.md). Without it neither Hermes nor the panel can tell
-- the turns before a change from the turns after it.
--
-- Who numbers: the deploy. `pnpm deploy:turn` and deploy-hermes.yml insert the next row here
-- (max + 1, the commit, the proposal if any) and set the secret `AGENT_VERSION` BEFORE they
-- publish `turn`; the turn reads the secret once and writes it on each `turn_outcomes` and
-- `llm_calls` row (supabase/functions/turn/agent-version.ts). Absent secret → null.
--
-- ORDER OF DEPLOY — this migration goes first, applied by the operator. The turn built with
-- this change writes `agent_version` in every `turn_outcomes` and `llm_calls` insert; against
-- a schema without the column PostgREST answers 400, and the turn swallows that error
-- (`.catch(() => undefined)`), so every outcome and every model-call cost row would be LOST
-- in silence while the conversation goes on. Both deploy paths fail closed: their first
-- write is into `agent_versions`, which does not exist before this file runs.
--
-- Additive and idempotent: a new table, two nullable columns, one view replaced with the same
-- columns plus one at the end, one new view. The running turn reads none of them.

create table if not exists public.agent_versions (
  version int primary key,
  git_sha text not null,
  published_at timestamptz not null default now(),
  hermes_proposal_id uuid references public.hermes_proposals(id),
  note text
);
-- Same as every table here: RLS on, no policy; only `service_role` reads or writes.
alter table public.agent_versions enable row level security;

-- No foreign key to `agent_versions`, on purpose: a secret that names a version with no row
-- (a deploy by hand that skipped the script) must never make the turn's insert fail.
-- No index either: the evaluation views below read the whole table anyway.
alter table public.turn_outcomes add column if not exists agent_version int;
alter table public.llm_calls add column if not exists agent_version int;

-- ── Turn outcomes per version ──────────────────────────────────────────────────
-- Same counts and rates as `eval_turn_outcomes` (0018), one row per version instead of per
-- day, so the rollback rule (Hermes compares the new version with the one before) reads a
-- rate SQL computed. `eval_turn_outcomes` keeps its day grain: the panel reads one row per
-- day from it (src/dev/painel.ts). Null = turns written before this migration or under no
-- secret. Full scan of `turn_outcomes` (no index serves a group by version): one read per
-- Hermes run.
create or replace view public.eval_version_outcomes with (security_invoker = true) as
select
  o.agent_version,
  min(o.created_at) as first_at,
  max(o.created_at) as last_at,
  count(*)::int as turns,
  count(*) filter (where o.outcome = 'send')::int as sent,
  count(*) filter (where o.outcome = 'fallback')::int as fallbacks,
  count(*) filter (where o.outcome = 'handoff')::int as handoffs,
  count(*) filter (where o.outcome = 'deferred')::int as deferred,
  count(*) filter (where o.outcome = 'stopped')::int as stopped,
  count(*) filter (where o.outcome = 'opted_out')::int as opted_out,
  round(
    count(*) filter (where o.outcome = 'fallback')::numeric
      / nullif(count(*) filter (where o.outcome in ('send', 'fallback', 'handoff')), 0),
    4
  ) as fallback_rate,
  round(
    count(*) filter (where o.outcome = 'handoff')::numeric
      / nullif(count(*) filter (where o.outcome in ('send', 'fallback', 'handoff')), 0),
    4
  ) as handoff_rate,
  round(avg(o.rewrites), 2) as avg_rewrites,
  round(sum(o.cost_brl), 4) as cost_brl
from public.turn_outcomes o
group by 1;

-- ── Cost per conversation, with the versions that spent it ─────────────────────
-- Same body as 0018 plus `agent_versions` at the end (create or replace accepts only that).
-- An array, not a group by: a conversation can cross a deploy, and splitting its row per
-- version would break `counter_drift_brl`, which compares the whole counter. Null = no call
-- recorded with a version. Uses `llm_calls_conversation_idx` for the join, as before.
create or replace view public.eval_conversation_cost with (security_invoker = true) as
select
  c.id as conversation_id,
  c.lead_id,
  c.stage,
  (c.created_at at time zone 'America/Sao_Paulo')::date as day,
  count(l.id)::int as model_calls,
  coalesce(sum(l.input_tokens), 0)::int as input_tokens,
  coalesce(sum(l.output_tokens), 0)::int as output_tokens,
  round(coalesce(sum(l.cost_brl), 0), 4) as cost_brl,
  round(c.cost_brl - coalesce(sum(l.cost_brl), 0), 4) as counter_drift_brl,
  array_agg(distinct l.agent_version order by l.agent_version) filter (where l.agent_version is not null) as agent_versions
from public.conversations c
left join public.llm_calls l on l.conversation_id = c.id
group by c.id;
