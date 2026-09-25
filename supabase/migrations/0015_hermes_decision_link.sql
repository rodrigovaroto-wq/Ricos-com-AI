-- The operator decides each Hermes proposal from a link in an e-mail (operator,
-- 2026-09-25): an n8n form that writes the decision here. The link carries the row id and
-- this token; the form updates only the row whose token matches and that is still
-- 'proposed', so a leaked or old link cannot flip a decided proposal. RLS stays on with no
-- policy: only the service role (n8n, the Hermes job) reads or writes the table.
alter table public.hermes_proposals
  add column if not exists decision_token text not null default replace(gen_random_uuid()::text, '-', '');
-- When the e-mail with the links went out; null means n8n still owes it.
alter table public.hermes_proposals add column if not exists notified_at timestamptz;
