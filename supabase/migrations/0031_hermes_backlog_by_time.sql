-- When the production Hermes runs (operator, 2026-10-22, P1.2): 50 new leads, as before (R6.2), OR 25 new leads once 10
-- days have passed — a slow week no longer leaves the supervisor silent (it never ran: 42 leads in 5 days, and `due` waited
-- for 50). The 10 days count from the last production run's start (0020), or, before the first run, from the first lead
-- of the window. Same columns as 0018 plus `window_start`, so `hermes-run.ts` reads it unchanged.
--
-- Idempotent (create or replace, same column order with one appended). Applied before or after the code: the code reads
-- only `due`, `leads_since_last_run` and `last_run_at`.
create or replace view public.hermes_backlog with (security_invoker = true) as
with last_run as (
  select max(coalesce(started_at, created_at)) as started from public.hermes_runs where source = 'supabase'
), fresh as (
  select l.id, l.created_at
  from public.leads l
  where l.phone not like '5500099%'
    and l.created_at > coalesce((select started from last_run), '-infinity'::timestamptz)
)
select
  (select count(*) from fresh)::int as leads_since_last_run,
  (select max(created_at) from public.hermes_runs where source = 'supabase') as last_run_at,
  (select count(*) from fresh) >= 50
    or ((select count(*) from fresh) >= 25
        and coalesce((select started from last_run), (select min(created_at) from fresh)) <= now() - interval '10 days') as due,
  coalesce((select started from last_run), (select min(created_at) from fresh)) as window_start;
