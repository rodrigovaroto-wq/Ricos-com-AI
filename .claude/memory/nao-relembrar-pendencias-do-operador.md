---
name: nao-relembrar-pendencias-do-operador
description: O operador pediu (2026-09-25) para não ser lembrado de revogar PAT nem de trocar o CONVERSATION_MODEL — ele sabe e faz; não repita isso em resposta nenhuma.
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
