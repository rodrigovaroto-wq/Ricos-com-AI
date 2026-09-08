---
name: negation-blindness
description: Toda heurística de texto deste repositório já errou em negação, nos dois sentidos — antes de escrever ou mexer numa, sonde a frase negada e a negativa que não nega.
metadata:
  type: architecture
---

Quatro módulos deste repositório leem português com regex — `guardrails.ts`,
`sizing.ts`, `address.ts` e o que vier depois. **Todos** já tiveram o mesmo par de
erros, e cada um só apareceu quando alguém sondou de propósito:

1. **Vetar a frase honesta.** O gate vê o token e não a negação: `"não emagrece"`,
   `"não consigo oferecer 30% de desconto"`, `"não sou uma pessoa, sou a assistente
   virtual"`, `"não temos cupom"`. Custa reescrita paga e termina em handoff para um
   turno que a agente já tinha acertado.
2. **Liberar a promessa por causa de uma negativa qualquer.** A negativa não nega a
   alegação: `"sem juros, sai por R$ 59,90"`, `"sem esperar muito, chega amanhã"`,
   `"não uso 40, uso 46"` lido como 40.

O segundo é o mais caro e o mais fácil de não ver, porque o teste que você escreveria
naturalmente é o do primeiro.

**O que fazer.** Ao tocar em qualquer uma dessas heurísticas, escreva os dois casos
antes de mudar o código: a frase honesta que precisa passar e a promessa disfarçada de
negativa que precisa barrar. `negatedAt` (em `guardrails.ts`) e `NEGATED_CUE` (em
`sizing.ts`) são as duas implementações; a fronteira de cláusula (`:;.!?` e a vírgula)
é o que separa os dois casos, e `sem` só conta dentro da própria locução — ele nega o
substantivo ao lado, não tudo o que vem depois.
