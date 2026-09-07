-- Uma resposta adiada precisa guardar o próprio texto.
--
-- As duas réguas regeneram a copy a partir do `kind`, e por isso a tabela nunca
-- precisou de um corpo. Uma resposta que o modelo já escreveu é diferente: é única,
-- custou uma chamada, e some se não for gravada. É o que acontece quando o guardrail
-- de horário barra um envio às 3h: a resposta está certa, só não pode sair agora.
alter table public.followups add column if not exists body text;

comment on column public.followups.body is
  'Texto já escrito, para respostas adiadas. Nulo nas réguas, que regeneram a copy pelo kind.';

-- A unicidade por (conversa, kind) FICA como está, e vale também para a resposta
-- adiada: se ela silenciar de madrugada e escrever de novo, a resposta mais nova
-- substitui a anterior — que é a pergunta viva quando a janela abrir.
--
-- A tentação aqui é trocar a constraint por um índice único parcial, para permitir
-- várias respostas adiadas na mesma conversa. NÃO FAÇA: o handler agenda a régua de
-- silêncio com `on_conflict=conversation_id,kind`, e o Postgres recusa `ON CONFLICT`
-- contra índice parcial ("there is no unique or exclusion constraint matching the
-- ON CONFLICT specification"). Trocar quebra o agendamento inteiro, em silêncio,
-- porque a chamada é tolerante a erro. Verificado na marra neste banco.

create index if not exists followups_due_idx
  on public.followups (run_at)
  where status = 'scheduled';
