-- Hermes and the 90-day retention (R6.3, R8.2), from the Hermes v1 analysis of 2026-09-29
-- (docs/agente-ia/05-plano/06-analise-hermes-v1.md, §e G1).
--
-- `hermes_proposals.evidence` holds the whole proposal, with the customer's sentences it
-- cites copied verbatim (src/dev/hermes-run.ts). The table had no `expires_at`, no foreign
-- key to `conversations` and was not in `purge_expired()`, so those sentences outlived the
-- conversation they came from, forever. Now `evidence` is cleared 90 days after the
-- proposal: what was proposed (`target`, `rationale`), the operator's decision and reason,
-- and the result stay — they are the ledger Hermes reads before proposing (0014). The
-- e-mail that shows the excerpts goes out within minutes of the run, long before that.
--
-- Additive: a new column with a default, and a function and a view replaced with the same
-- signature. The running turn reads none of them.

alter table public.hermes_proposals
  add column if not exists expires_at timestamptz not null default now() + interval '90 days';
-- Rows already there count from when they were proposed, not from this migration.
update public.hermes_proposals set expires_at = created_at + interval '90 days';

-- Same body as 0001, plus the last step. One place for retention, so the pg_cron job of 0002
-- keeps being the only thing that expires customer data.
create or replace function public.purge_expired()
returns table (table_name text, rows_deleted bigint) language plpgsql
set search_path = public, pg_catalog as $$
declare n bigint;
begin
  delete from public.leads where expires_at < now();
  get diagnostics n = row_count; table_name:='leads'; rows_deleted:=n; return next;
  delete from public.conversations where expires_at < now();
  get diagnostics n = row_count; table_name:='conversations'; rows_deleted:=n; return next;
  delete from public.messages where expires_at < now();
  get diagnostics n = row_count; table_name:='messages'; rows_deleted:=n; return next;
  delete from public.orders where expires_at < now();
  get diagnostics n = row_count; table_name:='orders'; rows_deleted:=n; return next;
  delete from public.jobs where status in ('done','failed') and created_at < now() - interval '30 days';
  get diagnostics n = row_count; table_name:='jobs'; rows_deleted:=n; return next;
  update public.hermes_proposals set evidence = null where expires_at < now() and evidence is not null;
  get diagnostics n = row_count; table_name:='hermes_proposals.evidence'; rows_deleted:=n; return next;
end; $$;

-- R6.2 counts leads served. A persona round kept in the database (`--keep-data`, or a buy
-- that stops at ORDER_READY) is not one: its phones start with SYNTHETIC_PHONE_PREFIX
-- (src/dev/persona-run-core.ts), and without this a test round could trigger the
-- production run on its own.
create or replace view public.hermes_backlog with (security_invoker = true) as
select
  count(l.id)::int as leads_since_last_run,
  (select max(created_at) from public.hermes_runs where source = 'supabase') as last_run_at,
  count(l.id) >= 50 as due
from public.leads l
where l.phone not like '5500099%'
  and l.created_at > coalesce(
    (select max(created_at) from public.hermes_runs where source = 'supabase'),
    '-infinity'::timestamptz
  );
