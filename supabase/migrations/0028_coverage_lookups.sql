-- One row per region lookup of a conversation (grafo §111, 2026-10-19): what the CEP lookup answered — delivery here (`cod`),
-- none here (`no_cod`), a CEP nobody knows (`not_found`) or "could not tell" (`failed`). The health job reads the last hour:
-- when `failed` is a third of the lookups (at least five of them) the operator is e-mailed, so a source that goes down
-- (the Logzz, the ViaCEP) is seen in minutes and not by the sales that did not happen. No personal data: no CEP, no phone.
create table if not exists public.coverage_lookups (
  id bigint generated always as identity primary key,
  outcome text not null check (outcome in ('cod', 'no_cod', 'not_found', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists coverage_lookups_created_idx on public.coverage_lookups(created_at);

-- The same pattern as the other tables: RLS on and no policy. Only the `service_role` the Edge Function uses reads and writes it.
alter table public.coverage_lookups enable row level security;
