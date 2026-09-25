-- Kits (loop review, 2026-09-25): when the quantity and sizes were last written.
-- Nothing closes a conversation, so "new conversation" cannot expire an abandoned kit;
-- time does. It also tells a retry whether the first attempt already merged the sizes.
alter table public.leads add column if not exists units_at timestamptz;
