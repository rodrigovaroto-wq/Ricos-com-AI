-- The payment path she chose (loop round, 2026-09-25): it was read per message, so the
-- turn after "quero no pix" fell back to cash on delivery and sent the wrong checkout.
alter table public.leads add column if not exists payment_choice text
  check (payment_choice in ('cod', 'prepay'));
