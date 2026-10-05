---
name: supabase-deploy-por-api
description: Deploye a Edge Function pela API de gerência com os arquivos do disco — a ferramenta MCP transcreve o conteúdo e não cabe mais numa mensagem.
metadata:
  type: architecture
---

O `deploy_edge_function` do MCP recebe o conteúdo dos arquivos **inline**, então o
pacote inteiro tem de ser reescrito dentro de uma mensagem. Em 2026-09-08 os oito
arquivos da função `turn` passaram de 138 KB e o deploy simplesmente não coube — e
o caminho tem outro custo antes disso: reescrever 138 KB à mão é uma chance de
errar um caractere numa regex que só a produção descobriria.

**Desde 2026-10-02 use `NODE_USE_ENV_PROXY=1 pnpm deploy:turn`** (`--dry-run` primeiro): lista
os `.ts` do diretório (nunca uma lista escrita à mão), grava a versão em `agent_versions` e no
segredo `AGENT_VERSION` antes de publicar (R18.5), e desfaz os dois se o deploy falhar. **Só depois
das migrações 0021 e 0022 aplicadas.** O `curl` abaixo fica como referência do que o script faz.

Use a API de gerência, que envia os arquivos **do disco**:

```bash
cd supabase/functions/turn
curl -X POST "https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=turn" \
  -H "Authorization: Bearer $SB_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"turn","verify_jwt":true};type=application/json' \
  -F "file=@index.ts" -F "file=@guardrails.ts" -F "file=@followups.ts" \
  -F "file=@sizing.ts" -F "file=@retry.ts" -F "file=@address.ts" \
  -F "file=@identity.ts" -F "file=@coinzz.ts" -F "file=@availability.ts" \
  -F "file=@state-machine.ts" -F "file=@prompt.ts"
```

**São onze arquivos, e a conta já mudou três vezes.** `availability.ts` entrou depois da
primeira versão desta receita; `state-machine.ts` entrou em 2026-09-22, quando o estágio
do funil passou a ser escrito (R11.8); `prompt.ts` entrou no mesmo dia, quando o system
prompt saiu do `index.ts` para ter teste (R11.9). Quem copiar o comando sem conferir `ls *.ts`
deploya uma função sem algum deles — e uma importação faltando derruba o boot inteiro,
não só a rota que a usa. **Confira a lista contra o diretório antes de rodar, sempre:
esta receita já ficou desatualizada três vezes e vai ficar de novo.**

Um detalhe do shell que custa uma tentativa: `SB_TOKEN=... curl -H "Bearer $SB_TOKEN"`
numa linha só manda o header vazio — a variável é expandida antes da atribuição valer.
`export` primeiro, `curl` depois.

O token é um Personal Access Token (`sbp_...`), criado em
https://supabase.com/dashboard/account/tokens. **Ele é do operador e some com a
sessão** — peça um novo e peça para revogar no fim; nunca escreva num arquivo.

Ganho colateral que vale a pena saber: enviado do disco, o que fica no ar é
**byte a byte** igual ao repositório. A ressalva de `\uXXXX` que a
[`edge-function-drift`](edge-function-drift.md) descreve só existe no caminho do
MCP, que converte os escapes em caractere literal.
