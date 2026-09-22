-- Estágio 0 e o timer de 2 minutos (opção "a" — n8n chama a função duas vezes com um
-- `Wait` node no meio, ver HANDOFF.md §Recepção automática e o timer de 2 minutos).
--
-- `welcomed_at` marca quando a recepção automática fixa (`WELCOME_AUTO_REPLY`) foi
-- enviada para um lead novo. É o que separa a chamada de retomada (`resume: true`) de
-- uma chamada que nunca teve boas-vindas — sem ele, a retomada não teria como saber se
-- deve rodar.
--
-- A idempotência da retomada não usa `messages.external_id`, porque ela não insere
-- mensagem nenhuma: compara `last_outbound_at` (já existente, atualizado a cada resposta
-- real da Valen) contra `welcomed_at`. Se uma resposta de verdade já saiu depois das boas-
-- vindas — porque ela mandou uma segunda mensagem e foi respondida antes do timer disparar
-- — a retomada está obsoleta e não gera resposta duplicada.
alter table public.conversations add column if not exists welcomed_at timestamptz;

comment on column public.conversations.welcomed_at is
  'Quando a recepção automática do Estágio 0 foi enviada para este lead. Nulo em toda conversa que não passou por um lead novo. A chamada de retomada (resume: true) só produz resposta se last_outbound_at ainda não for mais recente que este campo.';
