-- Instrumentação do funil e do desfecho do turno (R11.8, achados C e D de 2026-09-22).
--
-- Duas coisas que o sistema decidia bem e não registrava. Ambas precisam existir ANTES
-- do primeiro cliente real: conversa que já aconteceu não se instrumenta depois.

-- ── C. O funil ───────────────────────────────────────────────────────────────
-- `conversations.stage` nascia 'discovery' — valor que não existe em `STAGES`
-- (src/agent/state-machine.ts) — e nunca era escrito por ninguém. A máquina de estados
-- rodava em teste e no simulador; a produção não sabia em que ponto cada conversa parou.
--
-- Ordem obrigatória: corrigir as linhas existentes, depois o default, e só então a
-- constraint. Invertendo, a constraint recusa as linhas com 'discovery' e a migração
-- falha no meio.
update public.conversations set stage = 'novo' where stage = 'discovery';

alter table public.conversations alter column stage set default 'novo';

alter table public.conversations drop constraint if exists conversations_stage_check;
alter table public.conversations add constraint conversations_stage_check
  check (stage in (
    'novo','conversando','tamanho_definido','endereco_coletado','pedido_criado',
    'em_rota','entregue_pago','recusado','perdido','bloqueado'
  ));

-- O funil é lido por estágio o tempo todo; sem isto, toda pergunta de funil é seq scan.
create index if not exists conversations_stage_idx on public.conversations(stage);

-- ── D. O desfecho do turno ───────────────────────────────────────────────────
-- Os cinco desfechos (`send`, `fallback`, `deferred`, `handoff`, `stopped`, mais o
-- `opted_out` que nem chega ao modelo) viajavam no corpo HTTP da resposta e morriam ali.
-- `gate_traces` guarda qual gate vetou e `llm_calls` guarda o custo de cada tentativa —
-- o que não dava para reconstruir é se a cliente recebeu a resposta do modelo ou a
-- resposta enlatada. É a métrica de qualidade mais importante do sistema, porque
-- fallback é a agente desistindo de vender.
--
-- Tabela própria, e não coluna em `messages`, porque dois dos seis desfechos não
-- produzem mensagem nenhuma: `deferred` escreve um followup e `stopped` não escreve nada.
create table if not exists public.turn_outcomes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  outcome text not null check (outcome in (
    'send','fallback','deferred','handoff','stopped','opted_out'
  )),
  -- Por que o desfecho foi esse: o motivo do fallback, a porta do handoff. Nulo em
  -- `send`, que não precisa de explicação.
  reason text,
  -- Quantas reescritas este turno gastou antes de concluir. Junto com `outcome` é o que
  -- responde "quanto custa um gate que dispara demais" — `llm_calls` tem o custo por
  -- chamada e nenhuma noção de turno.
  rewrites int not null default 0,
  cost_brl numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);
-- Sem `expires_at`: a retenção vem do `on delete cascade` de `conversations`, do mesmo
-- jeito que `gate_traces` e `llm_calls` já fazem. Uma coluna a mais aqui seria uma
-- segunda verdade sobre retenção, e `purge_expired()` não a leria.
create index if not exists turn_outcomes_conversation_idx
  on public.turn_outcomes(conversation_id, created_at);
create index if not exists turn_outcomes_outcome_idx on public.turn_outcomes(outcome, created_at);
