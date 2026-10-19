-- The last region lookup of each conversation (grafo §111, 2026-10-19): what the CEP lookup answered — delivery here (`cod`),
-- none here (`no_cod`), a CEP nobody knows (`not_found`) or "could not tell" (`failed`). The health job reads the last hour:
-- when `failed` is a third of the conversations (at least five of them) the operator is e-mailed, so a source that goes down
-- (the Logzz, the ViaCEP) is seen in minutes and not by the sales that did not happen.
-- One row per conversation (the turn upserts it), so one lead repeating a CEP that fails is one failure, not one per message.
-- No personal data: the conversation's own id, never the CEP or the phone.
create table if not exists public.coverage_lookups (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  outcome text not null check (outcome in ('cod', 'no_cod', 'not_found', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists coverage_lookups_created_idx on public.coverage_lookups(created_at);

-- The same pattern as the other tables: RLS on and no policy. Only the `service_role` the Edge Function uses reads and writes it.
alter table public.coverage_lookups enable row level security;

-- Same body as 0020, plus the last step: the table only matters for the last hour, a day is plenty. One place for retention.
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
  update public.hermes_proposals set evidence = evidence - 'evidencias', evidence_redacted_at = now()
   where expires_at < now() and evidence_redacted_at is null;
  get diagnostics n = row_count; table_name:='hermes_proposals.evidencias'; rows_deleted:=n; return next;
  delete from public.coverage_lookups where created_at < now() - interval '1 day';
  get diagnostics n = row_count; table_name:='coverage_lookups'; rows_deleted:=n; return next;
end; $$;
