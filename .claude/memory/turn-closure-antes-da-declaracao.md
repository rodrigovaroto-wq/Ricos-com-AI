---
name: turn-closure-antes-da-declaracao
description: Em supabase/functions/turn/index.ts, uma função definida cedo (sendFixed, lateGuard…) que lê uma const declarada depois quebra com 500 só no caminho que a chama cedo; antes de usar uma variável dentro dela, ache TODAS as chamadas e confira que vêm depois da declaração.
metadata:
  type: architecture
---

`handleTurn` é uma função de ~3 000 linhas com closures definidas no meio (`sendFixed` ~2935, `lateGuard`, `deferDraft`, `draftWith`)
e consts declaradas bem depois (`recentOutbound` ~3604, `recent`, `turns`). Em JS, ler a const antes da declaração lança
`ReferenceError: Cannot access 'X' before initialization` — mas **só quando a closure é chamada antes**, então os testes de texto e o
caminho feliz passam.

Mordeu em 2026-10-15 (grafo §96): desde `ac56e82` (12/10) `sendFixed` passava `recentOutbound` à régua, e cinco chamadas vêm antes dela
(limite do kit, troca pela Logzz, status do pedido, entregue, resposta ao "paguei"). Ficou no ar da v17 à v23; quem achou foram as
personas de cobertura, não a revisão Opus — que conferiu só a chamada nova.

Como evitar: ao pôr uma variável dentro de uma closure de `index.ts`, `grep -n "nomeDaClosure(" ` e compare cada linha com a da
declaração. Se alguma vem antes, leia o dado de outro jeito (o `outboundBefore()` de `sendFixed` lê as 3 últimas mensagens quando o
histórico do turno ainda não existe). Guarda: mutação `G96-sendfixed-antes-do-historico`.
