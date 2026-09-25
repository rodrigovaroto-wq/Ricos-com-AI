-- Hermes, the offline supervisor (R5.7, R6.2, R11.2, R11.6). `hermes_proposals` exists since
-- 0001; what was missing is the run itself. Without it a run that found nothing leaves no
-- trace, the "every 50 leads" cadence (R6.2) has nothing to count from, and the cost of the
-- supervisor is invisible next to the cost of the agent it supervises.
create table if not exists public.hermes_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- 'supabase' or 'personas:<run dir>'
  model text not null,
  conversations_seen int not null,
  leads_seen int not null,
  proposals_ok int not null,
  proposals_rejected int not null,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
alter table public.hermes_runs enable row level security;

alter table public.hermes_proposals add column if not exists run_id uuid references public.hermes_runs(id);

-- R6.2: Hermes runs every 50 leads served, not by the calendar. The scheduled job reads this
-- and runs only when `due` is true. Only production runs count; persona runs do not.
create or replace view public.hermes_backlog with (security_invoker = true) as
select
  count(l.id)::int as leads_since_last_run,
  (select max(created_at) from public.hermes_runs where source = 'supabase') as last_run_at,
  count(l.id) >= 50 as due
from public.leads l
where l.created_at > coalesce(
  (select max(created_at) from public.hermes_runs where source = 'supabase'),
  '-infinity'::timestamptz
);
