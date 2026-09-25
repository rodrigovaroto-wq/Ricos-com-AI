---
name: grafo-de-decisoes
description: Antes de mexer em gate de preço/prazo, estado da conversa (kit, caminho, retry) ou handoff de pós-venda, leia o grafo — cada atalho óbvio já foi tentado e falhou
metadata:
  type: architecture
---

`docs/documentacao/decisoes/04-grafo-de-decisoes.md` guarda, por problema, as tentativas
que falharam e por quê (2026-09-25, nove passadas de revisão): isentar preço de comparação
liberou "menos do que R$ 272,79"; adivinhar a quantidade pelas palavras quebrou três vezes
(o gate agora recebe `ctx.units`); "zerar kit na conversa nova" era código morto (nada fecha
conversa); exigir pergunta para o handoff perdeu reclamações (use lista de permissão para o
caminho feliz). Regra: toda isenção é afrouxamento — escreva a mentira que ela libera e
prove que continua vetada.
