---
name: nao-relembrar-pendencias-do-operador
description: O operador pediu (2026-09-25) para não ser lembrado de revogar PAT nem de trocar o CONVERSATION_MODEL — ele sabe e faz; não repita isso em resposta nenhuma. Desde 11/10 também não se levanta a LGPD do -contributor com cliente real.
metadata:
  type: feedback
---

Em 2026-09-25 o operador pediu, com todas as letras, para parar de lembrar a cada resposta
de dois itens que ele já sabe e vai fazer: revogar o PAT do Supabase usado no deploy e trocar
`CONVERSATION_MODEL` para o modelo sem `-contributor`. Os dois ficam registrados no
`HANDOFF.md`; nas respostas, não mencione nenhum dos dois a menos que ele pergunte ou que
uma ação sua dependa disso (ex.: rodar algo sobre cliente real com `-contributor` ainda ativo).
A troca do `CONVERSATION_MODEL` foi feita em 2026-10-01 (L1.2); a regra de não repetir pendência
reconhecida continua valendo para as outras (PAT, rotação da service_role).
Regra geral: pendência que o operador já reconheceu não vira fecho de toda resposta.

**O modelo é do operador (2026-10-06).** Quem troca `CONVERSATION_MODEL` /
`CONVERSATION_MODEL_PRICE` (padrão ↔ `-contributor` para testes) é o operador, à mão, no painel.
O Claude nunca grava esses segredos nem escreve código que escolha modelo por número/lead —
no máximo passa os valores exatos para ele colar.

**O `-contributor` com cliente real e a LGPD: assunto encerrado (2026-10-11).** Na análise de
arquitetura de 11/10 o ponto foi levantado (o `pricing.ts` e o Hermes dizem que o `-contributor`
"nunca fala com cliente real"); o operador respondeu que não é necessário e que **não se volta
nisso**. Não levante em análise, plano, revisão nem fecho de resposta, nem mande ao
`compliance-reviewer` por conta própria.
