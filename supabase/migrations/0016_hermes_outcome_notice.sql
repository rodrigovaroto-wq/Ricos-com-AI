-- The operator hears how each approved proposal ended — published, or failed and why —
-- by e-mail from the same n8n workflow that sent the proposal (R14.14). Null means the
-- e-mail is still owed.
alter table public.hermes_proposals add column if not exists outcome_notified_at timestamptz;
