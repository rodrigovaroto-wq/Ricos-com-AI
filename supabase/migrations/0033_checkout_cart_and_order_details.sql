-- The Coinzz checkout's own touches (operator, 2026-10-27, grafo §134). Apply BEFORE deploying the `turn` that reads them: the
-- sweep reads `leads.cart` only for a `cart_recovery` row and `orders.details` only for a `pix_pending` row (their own requests,
-- so a missing column fails only those rows), and the order webhook writes `details` (missing, every Coinzz sale would 400).
--
-- `leads.cart`: the cart she abandoned in the checkout, the last one wins — `at`, her first name, the offer, the quantity, the
-- price and the checkout URL. One per lead, read with the lead (leads_pkey): no table of its own. No CPF, e-mail or address is
-- kept, though the webhook carries them. Retention: the lead's own 90 days (`purge_expired`).
alter table public.leads add column if not exists cart jsonb;
comment on column public.leads.cart is
  'Carrinho abandonado no checkout da Coinzz (webhook, 2026-10-27): at, firstName, offerName, quantity, offerPriceBrl, checkoutUrl. O último vence.';

-- `orders.details`: what the Coinzz webhook says beyond the columns — the order number, her first name, the offer, and the Pix
-- (`pixCode`, the copy-and-paste line; `pixUrl`) while it waits. Merged per webhook. Retention: the order's 90 days.
alter table public.orders add column if not exists details jsonb;
comment on column public.orders.details is
  'Detalhes do webhook da Coinzz (2026-10-27): orderNumber, firstName, offerName, pixCode, pixUrl. Mesclado a cada webhook.';

-- `followups.kind` is free text (0001) and keeps the unique (conversation_id, kind): `cart_recovery` and `pix_pending` are one
-- row per conversation each, upserted by that key — never a partial index (memory: on-conflict-partial-index).
