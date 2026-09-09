---
name: business-config-sobrescreve
description: O secret BUSINESS_CONFIG substitui o fallback do código inteiro — chave nova nasce ausente em produção, então todo campo novo tem de ser opcional com o padrão correto.
metadata:
  type: architecture
---

`index.ts` monta o `CONFIG` assim:

```ts
JSON.parse(Deno.env.get("BUSINESS_CONFIG") ?? JSON.stringify({ /* fallback */ }))
```

O `??` é sobre a variável inteira, não campo a campo. **Com o secret setado — e ele
está — o objeto do código nunca é lido.** Uma chave adicionada ao fallback existe
em todo teste daqui e em lugar nenhum na produção, até alguém editar o secret.

Isso já mordeu em 2026-09-09. O `freeShipping` foi criado obrigatório; ausente em
produção, leu como `false` e reinstalou o veto que a onda 1 tinha acabado de
inverter — com 2.738 testes verdes e o deploy dado como concluído. Só a sonda pela
porta de produção mostrou.

**Regra:** campo novo em `BusinessConfig` nasce **opcional**, e o padrão para
ausente tem de ser o comportamento certo de hoje. `freeShipping?: boolean`, lido
como `!== false`, é o modelo.

A mesma armadilha explica divergências de valor: em 2026-09-09 a produção aceitou
"entrega entre 3 e 5 dias" enquanto o repositório fixa 1 a 3 — o secret carrega
outros números. Antes de debugar um guardrail que "não funciona em produção",
lembre que o config de lá pode não ser o daqui. O valor do secret não é legível
pela API de gerência (vem hasheado); só o operador consegue conferir no painel.
