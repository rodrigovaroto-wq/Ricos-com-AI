---
name: stage-nunca-e-escrito
description: `conversations.stage` nascia 'discovery' e nunca era escrito — hoje todos os dez estágios têm quem escreva (turno, webhook de venda desde a v38, varredura para perdido desde 26/09, não deployado); o `perdido` só marca a linha que a varredura realmente fechou.
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

**Atualização de 2026-09-22 à tarde.** Migração `0006` aplicada (default `'novo'`, `check`
contra `STAGES`), `furthest` em `state-machine.ts` (nono espelho), e o turno passou a gravar
`novo` → `conversando` → `tamanho_definido` → `endereco_coletado` → `pedido_criado`, mais
`bloqueado` no opt-out. **Não deployado até a v33.**

**O que continua sem ninguém que escreva:** `em_rota`, `entregue_pago` e `recusado` (o
webhook de venda `job: "order"` não toca o estágio) e `perdido` (o sweep da régua não marca
fim sem resposta). Itens 5.8 e 7.4 do plano v2. **Até eles fecharem, o funil para em
`pedido_criado`** — e "entregue e pago" é a métrica que o operador compra.

**Atualização de 2026-09-26.** `em_rota`, `entregue_pago` e `recusado` já eram escritos
pelo webhook de venda (`stageForOrder`, no ar desde a v38). O operador confirmou que Logzz
e Coinzz disparam o webhook a cada mudança de status. `perdido` passou a ser escrito
pela varredura quando o `silence_3` sai da fila sem venda (grafo §15), **ainda não deployado**.
Armadilha: com o cupom inativo o `silence_3` renderiza `null` — qualquer lógica de "fim da
régua" tem de cobrir o ramo vazio, não só o envio.
