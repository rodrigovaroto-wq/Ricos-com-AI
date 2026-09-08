---
name: edge-function-drift
description: A Edge Function no ar pode divergir do repositório nos dois sentidos — nada compara os dois lados; sempre ler o que está deployado antes de deployar.
metadata:
  type: architecture
---

O deploy da Edge Function `turn` é manual e não tem nenhuma verificação
automática contra o repositório. Não existe `.github/workflows/`, e o
`tests/function-drift.test.ts` compara apenas `src/` com
`supabase/functions/` — nunca com o que está efetivamente rodando na
Supabase.

**A divergência acontece nos dois sentidos, e já aconteceu.** Em 2026-09-06,
comparando a versão 5 (no ar) com o `main`:

- O `followups.ts` em produção ainda apontava para o caminho antigo
  `docs/agente/...`. A correção de caminho do PR #8 foi commitada e nunca
  deployada — **o repositório estava à frente**.
- O `index.ts` em produção tinha um docblock melhor, documentando as duas
  portas de entrada (`{ job: "followups" }` além do turno). Nunca foi
  commitado — **produção estava à frente**.

Nenhuma das duas era diferença de comportamento, mas as duas eram invisíveis
de qualquer lado que se olhasse sozinho.

**Antes de deployar, sempre:** ler o que está no ar
(`mcp__Supabase__get_edge_function`, projeto `hbmkgakzrqmdlsvszjeo`, slug
`turn`) e comparar com o repositório. O que só existe em produção precisa ser
recuperado para o repositório antes do deploy sobrescrever.

**Depois de deployar, sempre:** verificar por comportamento, não por leitura.
O deploy passa o conteúdo dos arquivos inline, então um erro de cópia é
silencioso. Duas sondas baratas cobrem o essencial — uma do que mudou, e uma
mensagem com acento que precisa cair no opt-out (`"não quero mais receber
nada"` → `{"status":"opted_out"}`), que prova que o `normalize("NFD")` +
faixa de diacríticos do `guardrails.ts` sobreviveu à viagem.

## O `diff` cru mente desde 2026-09-08

O `deploy_edge_function` recebe o conteúdo dentro de JSON, então todo escape unicode do
fonte (`\u2014`, `\u0300`, `\u201c`) chega em produção como o **caractere literal**.
Depois disso, produção e repositório ficam semanticamente idênticos e byte a byte
diferentes nessas linhas. Comparar sempre pelo sentido — um `diff` que acusa só
escape-vs-literal não é drift.

A conferência da v13 achou o inverso na mesma passada: duas linhas de comentário do
`guardrails.ts` tinham o texto literal `\u2014` em vez do travessão, escrito assim por
uma edição anterior. Se um `diff` mostrar escape do lado do repositório num **comentário**,
é o repositório que está errado.
