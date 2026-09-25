---
name: guarda-testada-por-mutacao
description: Toda guarda nova (teste, regra de CI, checagem) ganha uma mutação em src/dev/verify-guards.ts que reinstala o bug de origem — guarda que não fica vermelha com o próprio bug não protege nada.
metadata:
  type: architecture
---

Em 25/09 as correções desta sessão ganharam guardas (dev:gates, fuzz, dev:n8n, testes de
provedor, 5.8, validação do Hermes). O loop de verificação reinstalou cada bug de origem
numa worktree descartável e exigiu que a guarda falhasse: 10 de 11 pegaram de primeira;
a que escapou era a **própria mutação** que não reproduzia o bug inteiro (faltava o
`[^,;:]*$` da recusa larga) — ou seja, sem esse loop ninguém saberia se a guarda da recusa
funcionava.

A regra: consertou um bug e escreveu a guarda → acrescente a mutação em
`src/dev/verify-guards.ts` (arquivo, texto de volta, comando que tem de falhar) e rode
`pnpm verificar:guardas`. O CI roda todas; uma guarda editada até ficar inofensiva deixa
o build vermelho. Mutação que "não se aplicou" significa que o código mudou: atualize o
texto de origem, não apague a mutação.
