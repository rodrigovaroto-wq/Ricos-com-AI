-- Marketing opt-in (decision of 2026-09-28, option B of
-- docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template
-- (`silence_2` and `silence_3` outside the 24-hour window) only to someone who agreed to
-- receive it from a named business; a click on the ad is not that, and LGPD puts the proof
-- of consent on us (art. 8º §2º). These columns are that proof.
--
-- Additive and nullable: null means no opt-in, and no marketing template goes out. Nothing
-- writes them until the turn and the sweep read them (after the ruler PR merges), so applying
-- this first changes no behaviour. On `leads`, so the 90-day retention (`purge_expired`,
-- `touch_retention`) already covers them — no second truth about retention.
alter table public.leads
  add column if not exists marketing_opt_in_asked_at timestamptz,
  add column if not exists marketing_opt_in_question_id uuid references public.messages(id) on delete set null,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_message_id text;

comment on column public.leads.marketing_opt_in_asked_at is
  'When the opt-in question went out, as a message of its own after the after_price touch (src/agent/opt-in.ts). Asked once.';
comment on column public.leads.marketing_opt_in_question_id is
  'The outbound message that carried the question. Her yes counts only if it answers THIS message: the last one sent to her, by id — never by text, which the model could repeat.';
comment on column public.leads.marketing_opt_in_at is
  'When she answered yes to that question; null = no marketing template. Cleared by WhatsApp error 131050.';
comment on column public.leads.marketing_opt_in_message_id is
  'The inbound message (messages.external_id) that said yes: the record of consent (LGPD art. 8º §2º).';
