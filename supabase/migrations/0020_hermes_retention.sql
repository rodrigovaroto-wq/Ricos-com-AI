-- Hermes and the 90-day retention (R6.3, R8.2), from the Hermes v1 analysis of 2026-09-29
-- (docs/agente-ia/05-plano/06-analise-hermes-v1.md, §e G1).
--
-- `hermes_proposals.evidence` holds the whole proposal, with the customer's sentences it
-- cites copied verbatim (src/dev/hermes-run.ts). The table had no `expires_at`, no foreign
-- key to `conversations` and was not in `purge_expired()`, so those sentences outlived the
-- conversation they came from, forever. Now the excerpts (`evidence -> 'evidencias'`) are
-- removed 90 days after the proposal. The rest of `evidence` stays: `objetivo` and
-- `como_medir` live only there, and an approved proposal implemented after day 90 still
-- needs them (hermes/IMPLEMENTAR.md §3). So do the operator's decision, reason and result —
-- the ledger Hermes reads before proposing (0014). The e-mail that shows the excerpts goes
-- out within minutes of the run, long before that.
--
-- Additive: a new column with a default, and a function and a view replaced with the same
-- signature. The running turn reads none of them.

alter table public.hermes_proposals
  add column if not exists expires_at timestamptz not null default now() + interval '90 days';
-- Rows already there count from when they were proposed, not from this migration.
update public.hermes_proposals set expires_at = created_at + interval '90 days';
-- When the excerpts were removed; null = still there.
alter table public.hermes_proposals add column if not exists evidence_redacted_at timestamptz;

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
  update public.hermes_proposals set evidence = evidence - 'evidencias', evidence_redacted_at = now()
   where expires_at < now() and evidence_redacted_at is null;
  get diagnostics n = row_count; table_name:='hermes_proposals.evidencias'; rows_deleted:=n; return next;
end; $$;

-- Audit of each run (the JEV idea of pinned versions): which skill text, which commit, which
-- conversations. Ids only, no text — they dangle harmlessly once the purge removes the
-- conversation. Nullable: a run before this migration has none.
-- `started_at`: when the run read its sample. The next run reads activity after it — the
-- row is inserted at the end, minutes later, and a conversation that moved in between would
-- otherwise never be read.
alter table public.hermes_runs
  add column if not exists started_at timestamptz,
  add column if not exists skill_sha text,
  add column if not exists commit_sha text,
  add column if not exists conversation_ids uuid[];

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
  -- From when the last run started reading (0020), not from when it finished writing.
  and l.created_at > coalesce(
    (select max(coalesce(started_at, created_at)) from public.hermes_runs where source = 'supabase'),
    '-infinity'::timestamptz
  );

-- ── What Hermes reads, and what it proves (conclusion of the analysis, items 2–4) ──────

-- When the deploy published an approved proposal (deploy-hermes.yml). The next production
-- runs measure the proposal's own check on conversations before and after this instant and
-- write the reading into `result` — until now `result` said only "publicada: <url>".
alter table public.hermes_proposals add column if not exists published_at timestamptz;


-- One row per real conversation with the signals that say where to look
-- (src/dev/hermes-core.ts › pickSample): opt-outs and canned replies first, then handoffs,
-- vetoes and cost. Counts only — no customer text. Persona phones are left out, as in
-- `hermes_backlog`.
create or replace view public.hermes_sample with (security_invoker = true) as
select
  c.id as conversation_id,
  c.created_at,
  -- The last thing that happened in it: a conversation that began before the last run and
  -- got a reply (or a ruler touch) after it is read again.
  greatest(c.created_at, (select max(m.created_at) from public.messages m where m.conversation_id = c.id)) as last_activity,
  c.cost_brl,
  (select count(*) from public.turn_outcomes o where o.conversation_id = c.id and o.outcome = 'fallback')::int as fallbacks,
  (select count(*) from public.turn_outcomes o where o.conversation_id = c.id and o.outcome = 'handoff')::int as handoffs,
  (select count(*) from public.turn_outcomes o where o.conversation_id = c.id and o.outcome = 'opted_out')::int as opt_outs,
  (select count(*) from public.gate_traces t where t.conversation_id = c.id and t.verdict = 'block')::int as blocks
from public.conversations c
join public.leads l on l.id = c.lead_id
where l.phone not like '5500099%';
