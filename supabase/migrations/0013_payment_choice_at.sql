-- When she chose the payment path (fourth review, 2026-09-25): a choice made a month ago
-- must not open today's checkout, the same way an abandoned kit expires.
alter table public.leads add column if not exists payment_choice_at timestamptz;
