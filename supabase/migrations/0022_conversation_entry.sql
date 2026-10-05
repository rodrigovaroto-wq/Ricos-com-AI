-- Silence ruler inside the free entry point window (plan month 1, §4a, 2026-10-02): `silence_3`
-- goes out 63–71 h after HER ENTRY by an ad, the instant the 72-hour free window opens. The turn
-- never closes a conversation (a lead keeps one forever), so `created_at` only marks the first
-- entry; a later click on an ad brings Meta's `referral` (`payload.source`) and the turn stamps
-- that message's instant here. The ruler reads `entry_at ?? created_at`.
--
-- Additive and nullable: the turn reads conversations with `select=*` and falls back to
-- `created_at` while this column does not exist, so deploy order does not matter. An organic
-- re-contact keeps the old anchor: its band is past, and there is no `silence_3` (no free window).
alter table public.conversations add column if not exists entry_at timestamptz;

comment on column public.conversations.entry_at is
  'Instant of her latest message that came from an ad (CTWA referral). Null = only the entry that created the conversation, read from created_at. Anchors silence_3 (63-71 h after it).';
