-- Undue premise per Hermes run (L3 pause criterion: above 5% of conversations). Hermes lists the conversations it saw one
-- in (`premissa_indevida` in propostas.json); src/dev/hermes-run.ts counts only names in the batch (`premiseCount`).
-- Nullable: a run before this migration, or of the older skill, has no count — not zero. Read by the operator's portal
-- against `conversations_seen`.
alter table public.hermes_runs
  add column if not exists premise_conversations int check (premise_conversations >= 0);
