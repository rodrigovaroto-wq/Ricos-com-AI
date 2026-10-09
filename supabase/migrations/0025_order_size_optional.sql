-- A paid order is recorded even when its size cannot be read (2026-10-09). The test webhooks of both
-- platforms carry no size in the complement — Coinzz sends the size's product code, Logzz the variations
-- she picked — and a sale dropped for its size is a payment the agent never sees: "paguei" with no
-- payment, the silence ruler chasing a buyer, no confirmation. n8n now reads the product code and the
-- variations, and when nothing names the size the order goes in without it and the operator is told.
--
-- Relaxing only: `size` keeps its check (one size, or one per piece), null now allowed. The post-order
-- touches already read a missing size as "—" or the lead's size. Apply BEFORE the n8n workflow that
-- sends orders without a size.
alter table public.orders alter column size drop not null;

comment on column public.orders.size is
  'One size, or one per piece ("M,G"). Null = the webhook named no size (read it in the platform panel).';
