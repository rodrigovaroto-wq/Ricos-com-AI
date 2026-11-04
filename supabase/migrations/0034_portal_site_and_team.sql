-- Encorpa Portal (operator, 2026-11-04): site visits for "Site ao vivo" and the checkout funnel, and the team page of the portal's
-- settings. Only the portal reads and writes these tables, with the service_role key (RLS on, no policy: nobody else gets in).
-- Apply in the Supabase SQL editor; the portal shows an empty state until then (the tables are optional in lib/build.mjs).

-- One row per visit to encorpa-fashion.com.br, written by the portal's collector (public/track.js → api/track.js): a random id the
-- browser keeps for 30 minutes, the device class and when she saw the product and opened the checkout. No IP, name, e-mail or
-- phone, so no personal data (LGPD) and no retention rule beyond the cleanup below.
create table if not exists public.site_sessions (
  id          text primary key check (id ~ '^[a-z0-9]{16,40}$'),
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  device      text not null default 'desktop' check (device in ('phone', 'desktop')),
  path        text check (char_length(path) <= 200),
  from_ad     boolean not null default false,
  product_at  timestamptz,
  checkout_at timestamptz
);
create index if not exists site_sessions_created_idx on public.site_sessions (created_at);
create index if not exists site_sessions_last_idx on public.site_sessions (last_at);
alter table public.site_sessions enable row level security;
comment on table public.site_sessions is 'Visitas ao site (Encorpa Portal, 2026-11-04): uma linha por visita, sem dado pessoal. Apagadas depois de 400 dias.';

-- The portal's team: name, job title and phone per login e-mail. The login and the access role stay in the PORTAL_USERS variable on
-- Vercel (the password never touches the database); this table only describes the person.
create table if not exists public.portal_users (
  email      text primary key check (email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 200),
  name       text check (char_length(name) <= 120),
  title      text check (char_length(title) <= 120),
  phone      text check (char_length(phone) <= 40),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.portal_users enable row level security;

-- What the team changed in the portal's settings, newest first: who, what, when. The "Atividade" list of Configurações › Dados.
create table if not exists public.portal_activity (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text not null check (char_length(actor) <= 200),
  action text not null check (char_length(action) <= 300)
);
create index if not exists portal_activity_at_idx on public.portal_activity (at desc);
alter table public.portal_activity enable row level security;

-- Cleanup without touching purge_expired: visits older than 400 days (13 months keep the same month of the year before).
create or replace function public.purge_site_sessions() returns bigint language sql set search_path = public, pg_catalog as $$
  with d as (delete from public.site_sessions where created_at < now() - interval '400 days' returning 1) select count(*) from d;
$$;
