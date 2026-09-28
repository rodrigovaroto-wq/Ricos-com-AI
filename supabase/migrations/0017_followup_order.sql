-- Two orders on one lead (HANDOFF, 2026-09-26): a post-order touch keeps the order that armed
-- it, so it speaks of THAT order's total, pieces and sizes, and one order's cancellation does
-- not silence the other's delivery. Additive and nullable: older rows read the latest order,
-- as before. Apply BEFORE deploying the `turn` function that selects `order_id`.
alter table public.followups
  add column if not exists order_id uuid references public.orders(id) on delete set null;

comment on column public.followups.order_id is
  'Order that armed the post-order touch; null for silence touches and rows before 0017.';
