---
name: on-conflict-partial-index
description: Não troque a unique constraint de `followups` por índice parcial — o upsert `on_conflict` do handler quebra em silêncio, porque a chamada é tolerante a erro.
metadata:
  type: architecture
---

`followups` tem `unique (conversation_id, kind)`, e o handler agenda a régua de
silêncio via PostgREST com `followups?on_conflict=conversation_id,kind` +
`Prefer: resolution=merge-duplicates`.

Isso gera `ON CONFLICT (conversation_id, kind)`, e o Postgres **só aceita** essa
forma contra uma constraint ou índice único **total**. Um índice único parcial
(`... where kind <> 'deferred_reply'`, por exemplo) faz o Postgres recusar com:

```
42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

**Por que isso é perigoso e não óbvio:** a chamada de agendamento no handler termina
em `.catch(() => undefined)`. O turno continua respondendo normalmente, ninguém vê
erro, e a régua de silêncio simplesmente **para de agendar**. O sintoma aparece dias
depois, como "os follow-ups sumiram".

Aconteceu em 2026-09-07: a migração da resposta adiada trocou a constraint por um
índice parcial para permitir várias respostas adiadas por conversa. Quebrou em
produção e foi revertida na hora. A decisão final foi manter a unicidade total — a
resposta adiada mais nova substitui a anterior, que é a pergunta viva quando a
janela reabre.

Se um dia for mesmo necessário permitir várias linhas do mesmo `kind`, o upsert do
handler precisa mudar junto (ler-e-inserir, ou `ON CONFLICT` nomeando o índice
parcial com o mesmo predicado) — nunca só a migração.
