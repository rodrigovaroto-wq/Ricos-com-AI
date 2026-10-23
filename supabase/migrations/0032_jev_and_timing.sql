-- Jev beside Hermes, and the timing of the conversation in SQL (plan of 2026-10-22, P3.1–P3.3, P5.2; operator).
--
-- 1. `jev_judgments`: every answer Jev gave in a production Hermes run, by conversation and Malu's reply — never the text
--    (the text stays in `messages`, under its own 90-day retention; this table cascades with the conversation). `label` is the
--    operator's verdict on a flag, null until given: the precision of each question is measured from it, and the gate keeps
--    the last word until it is (P3.2).
-- 2. Timing views (P3.3: "SQL, porque o JEV erra em tempo"): the reply latency, the ruler touch that brings her back, the hour
--    a touch is answered, and Malu's last word before a lead went silent. Counts and Malu's own text only — no message of hers;
--    but Malu's checkout link carries the lead's name, phone and CPF in its query, so `renderTiming` masks it (`maskPii`).
-- 3. `hermes_runs.jev_*`: what Jev cost a run and how many calls it made (P3.3: weigh the analysis at scale).
--
-- Idempotent. Applied before or after the code: the code swallows a missing table or view (the run goes on without it).
-- RLS on, no policy: only the service role reads and writes, as every table here.

create table if not exists public.jev_judgments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.hermes_runs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- 1-based among Malu's replies (the receipt not counted); 0 for a whole-conversation question.
  message_index int not null,
  question text not null,
  questions_version int not null,
  model text not null,
  answer jsonb not null,
  flagged boolean not null,
  label boolean,
  labeled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists jev_judgments_conversation_idx on public.jev_judgments(conversation_id);
create index if not exists jev_judgments_question_idx on public.jev_judgments(question, created_at);
alter table public.jev_judgments enable row level security;

alter table public.hermes_runs add column if not exists jev_cost_usd numeric;
alter table public.hermes_runs add column if not exists jev_calls int;

-- How fast Malu answers, by day (São Paulo): from each message of hers to the next outbound message, inside one conversation.
create or replace view public.eval_reply_latency with (security_invoker = true) as
select
  (i.created_at at time zone 'America/Sao_Paulo')::date as day,
  count(*)::int as replies,
  percentile_cont(0.5) within group (order by extract(epoch from (o.created_at - i.created_at)))::int as p50_seconds,
  percentile_cont(0.9) within group (order by extract(epoch from (o.created_at - i.created_at)))::int as p90_seconds
from public.messages i
join public.conversations c on c.id = i.conversation_id
join public.leads l on l.id = c.lead_id
join lateral (
  select m.created_at from public.messages m
  where m.conversation_id = i.conversation_id and m.direction = 'outbound' and m.created_at > i.created_at
  order by m.created_at limit 1
) o on true
where i.direction = 'inbound' and l.phone not like '5500099%'
  -- Not her first message: its "reply" is the automatic receipt, sent in about a second (code review).
  and i.created_at > (select min(m.created_at) from public.messages m where m.conversation_id = i.conversation_id and m.direction = 'outbound')
  -- The last message of a burst only: the reply answers the burst, timed from her last word.
  and not exists (
    select 1 from public.messages b
    where b.conversation_id = i.conversation_id and b.direction = 'inbound' and b.created_at > i.created_at and b.created_at < o.created_at
  )
group by 1;

-- Which ruler touch brings her back: of the touches sent, how many got a message of hers within 24 h.
create or replace view public.eval_ruler_returns with (security_invoker = true) as
select
  f.kind,
  count(*)::int as sent,
  count(*) filter (where exists (
    select 1 from public.messages m
    where m.conversation_id = f.conversation_id and m.direction = 'inbound'
      and m.created_at > f.sent_at and m.created_at <= f.sent_at + interval '24 hours'
  ))::int as answered_24h
from public.followups f
join public.conversations c on c.id = f.conversation_id
join public.leads l on l.id = c.lead_id
where f.status = 'sent' and f.sent_at is not null and l.phone not like '5500099%'
  and f.kind in ('still_there', 'silence_1', 'silence_2', 'silence_3', 'checkout_reminder')
group by f.kind;

-- The hour (São Paulo) a touch goes out and whether it is answered within 24 h: when to touch.
create or replace view public.eval_returns_by_hour with (security_invoker = true) as
select
  extract(hour from (f.sent_at at time zone 'America/Sao_Paulo'))::int as hour,
  count(*)::int as sent,
  count(*) filter (where exists (
    select 1 from public.messages m
    where m.conversation_id = f.conversation_id and m.direction = 'inbound'
      and m.created_at > f.sent_at and m.created_at <= f.sent_at + interval '24 hours'
  ))::int as answered_24h
from public.followups f
join public.conversations c on c.id = f.conversation_id
join public.leads l on l.id = c.lead_id
where f.status = 'sent' and f.sent_at is not null and l.phone not like '5500099%'
  and f.kind in ('still_there', 'silence_1', 'silence_2', 'silence_3', 'checkout_reminder')
group by 1;

-- Malu's last word before a lead with no order went silent for a day: the message that "killed" the conversation, Malu's own
-- text only. One row per conversation; `after_ruler` says whether the last word was a ruler touch.
create or replace view public.eval_last_word with (security_invoker = true) as
select
  c.id as conversation_id,
  last.created_at,
  left(last.body, 200) as body,
  exists (
    select 1 from public.followups f
    where f.conversation_id = c.id and f.status = 'sent' and abs(extract(epoch from (f.sent_at - last.created_at))) < 120
  ) as after_ruler
from public.conversations c
join public.leads l on l.id = c.lead_id
join lateral (
  select m.body, m.created_at, m.direction from public.messages m
  where m.conversation_id = c.id order by m.created_at desc limit 1
) last on true
where l.phone not like '5500099%'
  and last.direction = 'outbound'
  and last.created_at < now() - interval '24 hours'
  and not exists (select 1 from public.orders o where o.lead_id = l.id);
