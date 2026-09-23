---
name: prompt-nao-e-coberto-por-teste
description: O system prompt é o texto que mais decide o comportamento do sistema e nenhum teste o toca — ele já se contradizia sobre desconto e afirmava frete grátis sem ler o config que o gate lia.
metadata:
  type: feedback
---

`systemPrompt()` vive inline em `supabase/functions/turn/index.ts` e **nenhum teste do
repositório o executa ou lê**. `tests/function-drift.test.ts` prende as cópias espelhadas
e a tabela `PRICES`; não prende uma linha do prompt.

O que isso permitiu, e ficou escondido de 2026-09-10 a 2026-09-22: o prompt afirmava, no
mesmo texto, *"Nunca ofereça desconto ali: os dois caminhos custam o mesmo"* (escrito
quando R2.1 zerou o desconto) **e** *"Quem prefere pagar antes leva 10% de desconto"*
(correto por R10.5, nove linhas abaixo). E declarava *"O FRETE É GRÁTIS nos dois
caminhos"* como texto fixo, enquanto o gate `shipping_promise` já lia
`delivery.freeShipping` do config.

A Frente 4 atualizou config, comentários e testes — e não o prompt. Ninguém notou porque
não havia o que quebrar.

**A regra que sai disso:** toda regra de negócio citada no prompt tem que **ler o config**,
com o mesmo teste que o gate correspondente usa, e com a chave ausente lida como a verdade
de hoje (ela nasce ausente no `BUSINESS_CONFIG`). Para `freeShipping` isso foi `!== false`
até 2026-09-22 e é `=== true` desde então — o operador decidiu que não há frete grátis.
Desde 22/09 o prompt tem teste (`tests/prompt.test.ts`), que prova que toda frase ensinada
passa a cadeia de gates. Prompt e gate discordando é o pior defeito
possível: o gate veta a frase que o prompt mandou escrever, em toda conversa, queimando uma
reescrita por turno até cair na resposta segura.

**Antes de mudar qualquer regra de preço, frete ou prazo, leia o prompt junto do gate.**
Os dois são a mesma promessa escrita duas vezes.
