-- The lead's profile and readiness score (docs/agente-ia/05-plano/16-plano-execucao-pesquisas.md §4.1–§4.3,
-- operator, 2026-10-21). `profile` is the jsonb that `mergeProfile` (src/agent/profile.ts) folds every
-- message into; `score`/`score_band` are `scoreOf`/`bandOf` over the conversation's facts.
--
-- DEPLOY ORDER: apply BEFORE the `turn` that writes these columns. A PATCH naming a missing column fails
-- with 400 and the write is lost. Idempotent: every step can run twice.
--
-- Retention: these are columns of `leads`, so `purge_expired` deletes them with the row at 90 days.
-- `profile.pain` can be health data: it never leaves Supabase (no Conversions API, no ad audience).
-- Read and written by primary key only; no index.
alter table public.leads add column if not exists profile jsonb;
alter table public.leads add column if not exists score smallint check (score between 0 and 100);
alter table public.leads add column if not exists score_band text check (score_band in ('quente', 'morna', 'fria'));
alter table public.leads add column if not exists score_at timestamptz;

-- One row per lead, for the operator and the portal: never phone, name, identity or address — the view
-- names its columns, so a column added to `leads` later does not leak through it. `security_invoker`, as
-- every view here (0018): it obeys the RLS of `leads`, so only `service_role` sees a row.
-- `stage` is her latest conversation's: one lookup per lead on conversations_lead_idx, then a sort of
-- that lead's few conversations. The view itself is a full scan of `leads` — one read per report.
-- Persona leads (SYNTHETIC_PHONE_PREFIX, src/dev/persona-run-core.ts) are left out here: the view hides
-- the phone, so its reader cannot tell them apart.
create or replace view public.lead_profiles_v with (security_invoker = true) as
select
  l.id,
  l.created_at,
  (select c.stage from public.conversations c where c.lead_id = l.id order by c.created_at desc limit 1) as stage,
  l.score,
  l.score_band,
  l.score_at,
  -- `pain` and `hook` are her free text, possibly health data: never out through the view (compliance review of plan 16).
  l.profile - 'pain' - 'hook' as profile,
  l.units,
  l.payment_choice
from public.leads l
where l.phone not like '5500099%';
