---
name: verificar-pela-porta-de-producao
description: Sonda contra a Edge Function prova o código, não o caminho — o webhook do n8n passou meses devolvendo 200 sem criar conversa nenhuma.
metadata:
  type: architecture
---

Toda verificação de produção deste projeto, até 2026-09-08, foi feita chamando a Edge
Function direto. Isso prova que **o código** funciona. Não prova que a **entrada**
funciona — e ela não funcionava.

O nó `Cerebro do turno`, no workflow `Encorpa — Turno da agente`, autenticava na
Supabase com a credencial `Gemini API`. A Supabase recusava com
`UNAUTHORIZED_INVALID_JWT_FORMAT`. Nenhuma conversa era criada, nenhuma mensagem era
respondida. A credencial já tinha se chamado "Header Auth account": foi renomeada e teve
o valor trocado quando as APIs de modelo foram cadastradas, e levou o turno junto.

E era **silencioso por configuração**: o nó estava com `neverError`, então o erro da
Edge Function voltava como **HTTP 200 com o erro dentro do corpo**. Webhook verde,
execução verde, banco vazio. O `neverError` foi desligado.

**A regra que fica.** Uma mudança só está verificada quando a sonda entra pela mesma
porta que a cliente: `POST https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound`
com `{ externalId, from, body }`. Depois de sondar, confira o **banco** — se nenhum lead
nasceu, não importa o que o HTTP devolveu.

Corolário sobre credencial: **uma por destino**, nunca reaproveitada. Foi a mistura de
propósitos numa credencial só que criou isso, e o custo de errar aqui é a operação
inteira parada parecendo saudável.
