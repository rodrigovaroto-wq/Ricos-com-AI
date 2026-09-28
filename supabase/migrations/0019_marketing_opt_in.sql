-- Marketing opt-in (decision of 2026-09-28, option B of
-- docs/agente-ia/05-plano/07-opt-in-marketing.md). Meta sends a MARKETING template
-- (`silence_2` and `silence_3` outside the 24-hour window) only to someone who agreed to
-- receive it from a named business; a click on the ad is not that, and LGPD puts the proof
-- of consent on us (art. 8º §2º). These columns are that proof, and its way back.
--
-- The states are the ones `src/agent/opt-in.ts` decides: consent only by a tap on the
-- question's "yes" button (never by text), refusal by a structured no (final), and her text
-- only suspending — which lets the question be asked again, once, with the buttons.
--
-- Additive and nullable: null means no opt-in, and no marketing template goes out. Nothing
-- writes them until the turn and the sweep read them (after the ruler PR merges), so applying
-- this first changes no behaviour. On `leads`, so the 90-day retention (`purge_expired`,
-- `touch_retention`) already covers them — no second truth about retention.
alter table public.leads
  add column if not exists marketing_opt_in_asked_at timestamptz,
  add column if not exists marketing_opt_in_nonce text,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_message_id text,
  add column if not exists marketing_opt_in_suspended_at timestamptz,
  add column if not exists marketing_opt_in_declined_at timestamptz;

comment on column public.leads.marketing_opt_in_asked_at is
  'When the last opt-in question went out (reply buttons, inside the window).';
comment on column public.leads.marketing_opt_in_nonce is
  'The last question''s nonce, inside its button ids (optin:yes:<nonce>): a tap on an older question''s yes is not a yes to this one.';
comment on column public.leads.marketing_opt_in_at is
  'Consent in force: a tap on the current question''s yes, within 24h. Never set from typed text. Null = no marketing template.';
comment on column public.leads.marketing_opt_in_message_id is
  'The inbound tap (messages.external_id) that gave the consent: the record LGPD art. 8º §2º asks for.';
comment on column public.leads.marketing_opt_in_suspended_at is
  'Her typed text mentioned marketing: consent cleared, and the question may be asked once more.';
comment on column public.leads.marketing_opt_in_declined_at is
  'A structured no — the no button, WhatsApp''s own marketing switch (user_preferences stop), error 131050 or the general opt-out. Final: never asked again.';
