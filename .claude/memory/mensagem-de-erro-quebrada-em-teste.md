---
name: mensagem-de-erro-quebrada-em-teste
description: tests/function-drift.test.ts faz .toContain no texto BRUTO do arquivo — uma mensagem de erro escrita como duas linhas de template literal concatenadas quebra o teste no ponto da quebra de linha, mesmo com a string final correta em runtime.
metadata:
  type: feedback
---

`tests/function-drift.test.ts` lê `supabase/functions/turn/index.ts` com
`readFileSync` e roda `.toContain("frase inteira")` no texto **como está no disco** —
não na string que o template literal produz em runtime. Uma mensagem escrita assim:

```ts
`CONVERSATION_MODEL=${m} não é servido por nenhuma das duas APIs ` +
`que esta função fala. ...`
```

produz em runtime a frase contínua "não é servido por nenhuma das duas APIs que esta
função fala", mas o **arquivo fonte** tem uma quebra de linha e indentação exatamente
ali — `source.toContain("...duas APIs que esta função fala")` falha, porque essa
sequência de caracteres nunca existe como substring contígua no arquivo, só no valor
avaliado.

Aconteceu ao reescrever a mensagem de `MODEL_CONFIG_ERROR` para o provedor não
implementado (2026-09-10, troca de modelo para Muse Spark).

**Quando se aplica:** ao editar qualquer mensagem de erro dentro de
`supabase/functions/turn/index.ts` que um teste de `function-drift.test.ts` verifica por
`.toContain`. Ou quebre a asserção do teste nos mesmos pontos onde a string quebra de
linha no arquivo, ou escreva a frase inteira numa linha só.
