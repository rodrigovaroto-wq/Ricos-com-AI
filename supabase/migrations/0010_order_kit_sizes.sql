-- A kit order carries one size per piece ("M,G"), and orders.size still only accepted one
-- letter (0001): every kit sale would fail the insert with a check violation, recordOrder
-- would throw, and the ruler would keep chasing a woman who had bought (code review,
-- 2026-09-25). One letter, or a comma-separated list of them.
alter table public.orders drop constraint if exists orders_size_check;
alter table public.orders add constraint orders_size_check
  check (size ~ '^(P|M|G|GG|XGG)(,(P|M|G|GG|XGG))*$');
