---
name: stage-nunca-e-escrito
description: `conversations.stage` nasce 'discovery' — valor que nem existe em STAGES — e nunca é escrito; a máquina de estados roda em teste e simulador, não em produção, e por isso não existe funil.
metadata:
  type: architecture
---

`supabase/migrations/0001_init.sql:22` cria `conversations.stage` com
`default 'discovery'`. `src/agent/state-machine.ts` declara dez estágios — `novo`,
`conversando`, `tamanho_definido`, `endereco_coletado`, `pedido_criado`, `em_rota`,
`entregue_pago`, `recusado`, `perdido`, `bloqueado` — e **`'discovery'` não é nenhum
deles**.

Pior que o valor errado: **a coluna nunca é escrita.** O único `stage` que o handler
grava é o de `gate_traces` (`"presale"` / `"logistics"`), que é outro campo com o mesmo
nome. `canTransition` e `transition` são exercitados por `tests/state-machine.test.ts` e
pelo simulador `src/dev/engine.ts`, e não pelo turno de produção.

**A consequência prática:** não existe funil. Não dá para perguntar quantas conversas
chegaram em `tamanho_definido` e morreram antes de `endereco_coletado` — a pergunta que
qualquer decisão de script ou de anúncio precisa responder.

**E não é recuperável depois:** conversa que já aconteceu não se instrumenta. Se você está
prestes a abrir tráfego real, escrever o `stage` vem antes. Decidido em R11.8.
