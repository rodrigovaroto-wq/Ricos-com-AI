-- E2, measurement (docs/agente-ia/05-plano/13-plano-pratico-conversao.md §E2): every L3 lead leaves
-- how long each turn took, where in the funnel she stopped, and which experiment arm she is in.
--
-- DEPLOY ORDER: apply BEFORE the `turn` that writes these columns. Every `turn_outcomes` insert now
-- carries `duration_ms`; without the column it fails with 400 and the outcome is lost in silence (the
-- `.catch` swallows it). `leads.arm` is written by a separate PATCH whose failure costs only the label.
-- Idempotent: every step can run twice.

-- ── E2.1 Latency ───────────────────────────────────────────────────────────────
-- `llm_calls.latency_ms` exists since 0001 and the turn now writes it. This is the turn's own wait:
-- from the turn's start to the reply ready. Null = a turn written before this migration.
alter table public.turn_outcomes add column if not exists duration_ms int;

-- ── E2.3 A/B arm ───────────────────────────────────────────────────────────────
-- `{"A": 0|1, "B": 0|1}`: two independent sorts from her phone (src/agent/experiments.ts), written once
-- by the turn (`arm=is.null`). Null = a lead from before this migration, until her next turn. Read and
-- written by primary key only; no index.
alter table public.leads add column if not exists arm jsonb;

-- ── E2.2 The real funnel stages ────────────────────────────────────────────────
-- `endereco_coletado` needed an address she confirmed read back, and the link flow never reads it back:
-- it was never reached. Three stages the conversation does cross take its place, between
-- `tamanho_definido` and `pedido_criado`: `cobertura_conhecida` (her region lookup answered),
-- `caminho_escolhido` (her payment path stored), `link_enviado` (a checkout link went out).
--
-- Rows already at `endereco_coletado` are re-read from the facts their lead holds — the same facts the
-- turn now reads (`reachedStage`), never a guess: a stored path, then a known region, then a size. A
-- link sent cannot be told from the lead, so none is mapped there; the next turn raises it if true.
-- Order matters: the old check refuses the new values, so it goes first, and the new one last.
alter table public.conversations drop constraint if exists conversations_stage_check;

update public.conversations c
set stage = case
  when l.payment_choice is not null then 'caminho_escolhido'
  when jsonb_typeof(l.address -> 'codAvailable') = 'boolean' then 'cobertura_conhecida'
  when l.size is not null then 'tamanho_definido'
  else 'conversando'
end
from public.leads l
where l.id = c.lead_id and c.stage = 'endereco_coletado';

alter table public.conversations add constraint conversations_stage_check
  check (stage in (
    'novo','conversando','tamanho_definido','cobertura_conhecida','caminho_escolhido','link_enviado',
    'pedido_criado','em_rota','entregue_pago','recusado','perdido','bloqueado'
  ));

-- Same columns as 0018; only the order array follows the new `STAGES`.
create or replace view public.eval_funnel with (security_invoker = true) as
select
  (c.created_at at time zone 'America/Sao_Paulo')::date as day,
  case when ld.source ? 'ctwa_clid' then 'ad' else 'organic' end as origin,
  c.stage,
  array_position(
    array['novo', 'conversando', 'tamanho_definido', 'cobertura_conhecida', 'caminho_escolhido',
          'link_enviado', 'pedido_criado', 'em_rota', 'entregue_pago', 'recusado', 'perdido', 'bloqueado'],
    c.stage
  ) as stage_order,
  count(*)::int as conversations
from public.conversations c
join public.leads ld on ld.id = c.lead_id
group by 1, 2, 3;

-- ── By arm ─────────────────────────────────────────────────────────────────────
-- `eval_funnel` and `eval_turn_outcomes` keep their grain: the panel reads one row per day and
-- origin/stage from them (src/dev/painel.ts). The arm views are new views beside them, joined through
-- `leads.arm`; `arm_a`/`arm_b` null = a lead with no arm yet. Full scans of `turn_outcomes` and
-- `conversations`, joined by primary key (conversations_pkey, leads_pkey) — one read per report.

-- Turn latency, p50 and p90, per São Paulo day and arm. Only the turns that answered her now (`send`,
-- `fallback`, `handoff`): a `deferred` reply leaves hours later, and `stopped`/`opted_out` send nothing.
create or replace view public.eval_latency with (security_invoker = true) as
select
  (o.created_at at time zone 'America/Sao_Paulo')::date as day,
  (ld.arm ->> 'A')::int as arm_a,
  (ld.arm ->> 'B')::int as arm_b,
  count(*)::int as turns,
  round((percentile_cont(0.5) within group (order by o.duration_ms))::numeric) as p50_ms,
  round((percentile_cont(0.9) within group (order by o.duration_ms))::numeric) as p90_ms
from public.turn_outcomes o
join public.conversations c on c.id = o.conversation_id
join public.leads ld on ld.id = c.lead_id
where o.duration_ms is not null and o.outcome in ('send', 'fallback', 'handoff')
group by 1, 2, 3;

-- Outcomes per day and arm, with the rates of `eval_turn_outcomes` (0018).
create or replace view public.eval_arm_outcomes with (security_invoker = true) as
select
  (o.created_at at time zone 'America/Sao_Paulo')::date as day,
  (ld.arm ->> 'A')::int as arm_a,
  (ld.arm ->> 'B')::int as arm_b,
  count(*)::int as turns,
  count(*) filter (where o.outcome = 'send')::int as sent,
  count(*) filter (where o.outcome = 'fallback')::int as fallbacks,
  count(*) filter (where o.outcome = 'handoff')::int as handoffs,
  round(
    count(*) filter (where o.outcome = 'fallback')::numeric
      / nullif(count(*) filter (where o.outcome in ('send', 'fallback', 'handoff')), 0),
    4
  ) as fallback_rate,
  round(
    count(*) filter (where o.outcome = 'handoff')::numeric
      / nullif(count(*) filter (where o.outcome in ('send', 'fallback', 'handoff')), 0),
    4
  ) as handoff_rate
from public.turn_outcomes o
join public.conversations c on c.id = o.conversation_id
join public.leads ld on ld.id = c.lead_id
group by 1, 2, 3;

-- The funnel of `eval_funnel`, per arm instead of per origin.
create or replace view public.eval_arm_funnel with (security_invoker = true) as
select
  (c.created_at at time zone 'America/Sao_Paulo')::date as day,
  (ld.arm ->> 'A')::int as arm_a,
  (ld.arm ->> 'B')::int as arm_b,
  c.stage,
  array_position(
    array['novo', 'conversando', 'tamanho_definido', 'cobertura_conhecida', 'caminho_escolhido',
          'link_enviado', 'pedido_criado', 'em_rota', 'entregue_pago', 'recusado', 'perdido', 'bloqueado'],
    c.stage
  ) as stage_order,
  count(*)::int as conversations
from public.conversations c
join public.leads ld on ld.id = c.lead_id
group by 1, 2, 3, 4;
