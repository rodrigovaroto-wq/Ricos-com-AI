-- The Hermes ledger (operator, 2026-09-25): every proposal carries the operator's decision
-- and reason, what was done with it and what it measured afterwards, and Hermes reads the
-- whole ledger before its next run — so a refused idea is not proposed again, the reason
-- teaches the criterion, and an accepted one is checked against its result.
--
-- Additive: the running function never reads this table.
alter table public.hermes_proposals add column if not exists code text;             -- 'H-2', as the operator saw it
alter table public.hermes_proposals add column if not exists decision_reason text;  -- the operator's words
alter table public.hermes_proposals add column if not exists execution_ref text;    -- PR or session that implemented it
alter table public.hermes_proposals add column if not exists executed_at timestamptz;
alter table public.hermes_proposals add column if not exists result text;           -- what the measurement said after

-- The life of a proposal after the click: accepted → implementing → published, or failed
-- (CI, personas or the gate diff said no — nothing reached production).
alter table public.hermes_proposals drop constraint if exists hermes_proposals_status_check;
alter table public.hermes_proposals add constraint hermes_proposals_status_check
  check (status in ('proposed', 'accepted', 'rejected', 'implementing', 'published', 'failed'));
