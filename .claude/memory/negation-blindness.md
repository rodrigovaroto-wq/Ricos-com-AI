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

**2026-09-22 — três rodadas de conserto no mesmo dia, e cada uma abriu um furo novo.** Os
gates de frete (`shipping_promise`, `price_promise`) foram consertados três vezes em
sequência; cada conserto passou nos testes que o próprio implementador escreveu e cada um
foi reprovado pela revisão seguinte com uma frase concreta passando. O exemplo mais caro:
restringir a busca de negação à frase entre vírgulas fez *"O frete não é, de jeito nenhum,
cobrado à parte"* virar ressalva válida — e a vírgula decimal de "R$ 12,99" também contava
como fronteira. **Duas regras que saíram disso:** (1) todo conserto de heurística de
texto passa por uma segunda revisão independente **antes** de ser dado como resolvido —
os testes do implementador provam o que ele imaginou, não o que ele não imaginou;
(2) negação que cancela um predicado é a que está **entre o sujeito e o predicado**
("frete … não … cobrado"), não a que está em qualquer lugar da frase ou só na mesma
vírgula. E vírgula entre dígitos nunca é fronteira.

**O método que converge (definido na quarta rodada, 22/09).** O custo de erro de gate é
assimétrico: falso positivo (frase honesta vetada) custa uma reescrita — e
`tests/prompt.test.ts` garante que as frases que o prompt ensina passam; falso negativo
(mentira liberada) custa o frete na porta. Cada rodada que **afrouxou** um gate para liberar
frase honesta abriu mentira nova; as que só **apertaram** não abriram. Então: (1) conserto
de gate separa aperto de afrouxamento, e afrouxamento só entra com motivo forte e revisão
própria; (2) o critério de aceite é mecânico — rode `runGates` sobre o corpus inteiro (toda
frase citada nos testes e no `simulate.ts`, mais as frases das revisões), antes e depois,
nas configs e nos dois caminhos: **nenhum veredito pode ir de barrado para liberado** sem
que isso seja a intenção declarada daquela mudança. Isso transforma "revisei e parece
certo" em uma tabela verificável.
