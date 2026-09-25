-- Kits of 2 and 3 pieces (operator, 2026-09-25). The Coinzz checkout sells a fixed
-- quantity, so how many pieces she wants picks the link, and each piece carries its own
-- size, written by her in the checkout complement. Both are durable facts of the lead
-- (R11.5: a column, written by deterministic code), and the order keeps the quantity the
-- sale webhook reported.
alter table public.leads add column if not exists units int check (units between 1 and 50);
alter table public.leads add column if not exists unit_sizes text[];
alter table public.orders add column if not exists units int check (units between 1 and 50);
