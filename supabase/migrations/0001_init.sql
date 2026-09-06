-- Schema do agente Encorpa. Aplicado no projeto "Ricos com AI"
-- (org OFERTA ENCORPA, ref hbmkgakzrqmdlsvszjeo, região sa-east-1) em 2026-09-06.
-- Este arquivo é a fonte versionada: recria o banco do zero.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  size text check (size in ('P','M','G','GG','XGG')),
  address jsonb,
  source jsonb,                                   -- atribuição do primeiro toque; nunca sobrescrever
  opted_out_at timestamptz,
  handoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null default 'discovery',
  cost_brl numeric(10,4) not null default 0,      -- teto R$ 0,80 + 25% de folga
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists conversations_lead_idx on public.conversations(lead_id);
create index if not exists conversations_open_idx on public.conversations(last_inbound_at) where closed_at is null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  media jsonb,
  external_id text unique,                        -- idempotência da recepção
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  external_id text unique,
  checkout_url text,
  payment_method text not null check (payment_method in ('cod','prepay')),
  size text not null check (size in ('P','M','G','GG','XGG')),
  amount_brl numeric(10,2) not null,
  status text not null default 'created',
  scheduled_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists orders_lead_idx on public.orders(lead_id);
create index if not exists orders_status_idx on public.orders(status);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','claimed','done','failed')),
  run_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists jobs_claimable_idx on public.jobs(run_at) where status = 'pending';

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null,                             -- silence_1..3 · order_confirmed/rota/vespera/pos
  run_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','canceled')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, kind)
);
create index if not exists followups_due_idx on public.followups(run_at) where status = 'scheduled';

create table if not exists public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  purpose text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_tokens int not null default 0,
  cost_brl numeric(10,6) not null default 0,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists llm_calls_conversation_idx on public.llm_calls(conversation_id);

create table if not exists public.gate_traces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  gate text not null,
  verdict text not null check (verdict in ('pass','block','rewrite')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists gate_traces_conversation_idx on public.gate_traces(conversation_id, created_at);

create table if not exists public.hermes_proposals (
  id uuid primary key default gen_random_uuid(),
  target text not null,
  rationale text not null,
  diff text,
  evidence jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected')),
  leads_seen int,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Claim atômico da fila, sem Redis.
create or replace function public.claim_jobs(p_limit int default 10)
returns setof public.jobs language sql
set search_path = public, pg_catalog as $$
  update public.jobs j set status='claimed', claimed_at=now(), attempts=j.attempts+1
   where j.id in (select id from public.jobs where status='pending' and run_at <= now()
                  order by run_at limit p_limit for update skip locked)
  returning j.*;
$$;

-- Retenção de 90 dias (R6.3): rotina automática, chamada por cron do n8n.
create or replace function public.purge_expired()
returns table (table_name text, rows_deleted bigint) language plpgsql
set search_path = public, pg_catalog as $$
declare n bigint;
begin
  delete from public.leads where expires_at < now();
  get diagnostics n = row_count; table_name:='leads'; rows_deleted:=n; return next;
  delete from public.conversations where expires_at < now();
  get diagnostics n = row_count; table_name:='conversations'; rows_deleted:=n; return next;
  delete from public.messages where expires_at < now();
  get diagnostics n = row_count; table_name:='messages'; rows_deleted:=n; return next;
  delete from public.orders where expires_at < now();
  get diagnostics n = row_count; table_name:='orders'; rows_deleted:=n; return next;
  delete from public.jobs where status in ('done','failed') and created_at < now() - interval '30 days';
  get diagnostics n = row_count; table_name:='jobs'; rows_deleted:=n; return next;
end; $$;

-- A janela de 90 dias conta do último contato, não do primeiro.
create or replace function public.touch_retention(p_lead_id uuid)
returns void language sql
set search_path = public, pg_catalog as $$
  update public.leads set expires_at = now() + interval '90 days', updated_at = now() where id = p_lead_id;
  update public.conversations set expires_at = now() + interval '90 days' where lead_id = p_lead_id;
  update public.messages set expires_at = now() + interval '90 days'
   where conversation_id in (select id from public.conversations where lead_id = p_lead_id);
$$;

-- RLS ligada em tudo, sem política: só a service_role do backend entra.
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.jobs enable row level security;
alter table public.followups enable row level security;
alter table public.llm_calls enable row level security;
alter table public.gate_traces enable row level security;
alter table public.hermes_proposals enable row level security;
