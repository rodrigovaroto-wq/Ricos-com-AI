---
name: desfecho-do-turno-nao-persistido
description: O desfecho de cada turno (send, fallback, deferred, handoff, stopped) e o motivo do fallback viajam só no corpo HTTP e nunca chegam ao banco — a taxa de fallback é irrecuperável depois do fato.
metadata:
  type: architecture
---

O turno em `supabase/functions/turn/index.ts` termina em `json(200, { status: ... })` com
um de cinco desfechos: `send`, `fallback`, `deferred`, `handoff`, `stopped`. O n8n lê o
corpo, manda a mensagem, e o desfecho **morre ali**. `outcome.reason` — o motivo pelo qual
a cadeia desistiu e mandou `SAFE_FALLBACK_REPLY` em vez do que o modelo escreveu — existe
só em runtime.

`gate_traces` guarda qual gate vetou e `llm_calls` guarda o custo de cada tentativa,
incluindo as reescritas (`purpose='rewrite'`). O que **não** dá para reconstruir a partir
delas é se a cliente acabou recebendo a resposta do modelo ou a resposta enlatada — e essa
é a métrica de qualidade mais importante que o sistema tem, porque fallback é a agente
desistindo de vender.

**Não confunda com o handoff:** esse sim deixa rastro (`leads.handoff_at`). O fallback não
deixa nenhum.

**Como ler isso numa sessão futura:** se alguém pedir "qual a taxa de fallback", a resposta
honesta hoje é "não dá para saber", não um número estimado a partir de `gate_traces`.
Decidido corrigir em R11.8, antes do primeiro cliente real.
