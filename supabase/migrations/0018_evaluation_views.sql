-- The Evaluation Layer (R11.3): SQL views over what the turn already records, read by the
-- operator and by the daily follow-up (pipeline, phase 6, items 21 and 23). No new table,
-- no new write path — a view that reads nothing new cannot break a turn.
--
-- Same pattern as `hermes_backlog` (0008): `security_invoker`, so each view obeys the RLS of
-- the tables it reads. Those tables have RLS on and no policy, so only `service_role` sees a
-- row; without `security_invoker` the view would run as its owner and hand customer phones,
-- costs and ad ids to the anon key through PostgREST.
--
-- Days are São Paulo days: the operator reads "yesterday" on the São Paulo calendar, and a
-- UTC day moves every conversation after 21h into the next one.
--
-- The cost ceiling is NOT here. It lives in `BUSINESS_CONFIG` (`cost.conversationCapBrl` ×
-- (1 + `cost.overrunTolerance`)); a number copied into SQL would be a second truth the
-- operator has to remember to change. The views give the cost; the reader holds the cap.
--
-- Only rows written by a turn that records them count: `turn_outcomes` exists since the
-- v33 deploy (2026-09-25), so no rate here starts before that
-- (`.claude/memory/desfecho-do-turno-nao-persistido.md`).

-- ── Gate blocks: which gate vetoes, how often ──────────────────────────────────
-- One row per São Paulo day and gate. `checks` counts every verdict the chain wrote, so
-- `block_rate` is blocks per judged attempt, not per turn — a turn that rewrote twice was
-- judged three times.
create or replace view public.eval_gate_blocks with (security_invoker = true) as
select
  (t.created_at at time zone 'America/Sao_Paulo')::date as day,
  t.gate,
  count(*)::int as checks,
  count(*) filter (where t.verdict = 'block')::int as blocks,
  count(*) filter (where t.verdict = 'warn')::int as warns,
  round(count(*) filter (where t.verdict = 'block')::numeric / nullif(count(*), 0), 4) as block_rate
from public.gate_traces t
group by 1, 2;

-- ── Turn outcomes: how often the agent gives up ────────────────────────────────
-- A fallback is the canned reply after the rewrites ran out: the agent giving up on the
-- sale. `fallback_rate` and `handoff_rate` are over the turns that reached the model
-- (`opted_out` never does, `stopped` writes nothing to her), so a wave of opt-outs does
-- not dilute them.
create or replace view public.eval_turn_outcomes with (security_invoker = true) as
select
  (o.created_at at time zone 'America/Sao_Paulo')::date as day,
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

-- ── Cost per conversation ───────────────────────────────────────────────────────
-- From `llm_calls`, the one record of every model call — `conversations.cost_brl` is the
-- running counter the cap reads, and the two should agree; `counter_drift_brl` shows when
-- they do not (a call recorded but not counted, or the reverse).
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
  round(c.cost_brl - coalesce(sum(l.cost_brl), 0), 4) as counter_drift_brl
from public.conversations c
left join public.llm_calls l on l.conversation_id = c.id
group by c.id;

-- ── Funnel by stage ────────────────────────────────────────────────────────────
-- Where each conversation stands now, by the day it started and by where the lead came
-- from: `ad` when the first touch carried a click-to-WhatsApp id, `organic` otherwise.
-- `stage_order` follows `STAGES` (src/agent/state-machine.ts) for sorting; the three exits
-- (`recusado`, `perdido`, `bloqueado`) sit after the happy path.
create or replace view public.eval_funnel with (security_invoker = true) as
select
  (c.created_at at time zone 'America/Sao_Paulo')::date as day,
  case when ld.source ? 'ctwa_clid' then 'ad' else 'organic' end as origin,
  c.stage,
  array_position(
    array['novo', 'conversando', 'tamanho_definido', 'endereco_coletado', 'pedido_criado',
          'em_rota', 'entregue_pago', 'recusado', 'perdido', 'bloqueado'],
    c.stage
  ) as stage_order,
  count(*)::int as conversations
from public.conversations c
join public.leads ld on ld.id = c.lead_id
group by 1, 2, 3;

-- ── Attribution: which ad produced which sale ──────────────────────────────────
-- `leads.source` is written once, on the first touch, from the WhatsApp `referral`
-- (`src/channel/whatsapp.ts` › `sourceOf`) and never overwritten. One row per ad
-- (`source_id`); leads without a click id are one `organic` row. A lead counts as ordered
-- or delivered once, however many orders she has.
--
-- No revenue column, on purpose: with two orders on one lead, `entregue_pago` on the
-- conversation does not say WHICH order was paid, and reading `orders.status` here would
-- copy `stageForOrder`'s platform-status regex into SQL — a second truth to drift. Revenue
-- is read in Logzz and Coinzz, where the money is.
create or replace view public.eval_attribution with (security_invoker = true) as
select
  coalesce(ld.source ->> 'source_id', case when ld.source ? 'ctwa_clid' then 'desconhecido' else 'organic' end) as ad,
  max(ld.source ->> 'headline') as headline,
  count(*)::int as leads,
  count(*) filter (where exists (select 1 from public.orders o where o.lead_id = ld.id))::int as leads_ordered,
  count(*) filter (
    where exists (select 1 from public.conversations c where c.lead_id = ld.id and c.stage = 'entregue_pago')
  )::int as leads_delivered,
  count(*) filter (where ld.opted_out_at is not null)::int as leads_opted_out
from public.leads ld
group by 1;
