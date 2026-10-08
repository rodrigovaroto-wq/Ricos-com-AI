---
name: proxy-sobrescreve-auth-do-supabase
description: O proxy do container mexe no Authorization do Supabase — às vezes quebra (RLS 42501), às vezes injeta uma chave que escreve; sonde antes. A porta do proxy muda por sessão. O 302 da Coinzz era falta do cabeçalho XHR, não o container.
metadata:
  type: architecture
---

Em 2026-10-07 a rodada de personas pela porta `local` falhou três vezes antes de rodar:

1. Sem chave: o proxy não injetou `apikey` → `401 No API key found` / `Invalid API key`.
2. Com a service_role do operador no ambiente: o proxy **sobrescreveu** o `Authorization` com
   outra chave → `new row violates row-level security policy for table "leads"` (42501). O
   select devolvia `[]` (parecia funcionar); direto, sem proxy, a mesma chave lia as linhas.
3. O que funcionou: `NO_PROXY="$NO_PROXY,<ref>.supabase.co"` (e `no_proxy`) **nos dois
   processos** — a `turn` local (Deno) e o runner (Node com `NODE_USE_ENV_PROXY=1`) — com
   `SUPABASE_SERVICE_ROLE_KEY` real. A Meta continua pelo proxy (ele injeta a chave dela).

Teste rápido antes de gastar uma rodada: `curl` em `/rest/v1/leads?select=id&limit=2` com e
sem `--noproxy '*'` — se só o direto devolve linhas, é o proxy.

**Atualizado em 2026-10-07 (noite):** numa sessão nova o proxy já injetava uma chave que lê e
escreve (`placeholder` bastou; sondado com POST + DELETE de um lead `5500099…`). Teste antes,
não suponha nenhum dos dois casos. A porta do proxy muda por sessão: leia `$HTTPS_PROXY` e ponha
o host:porta dele no `--allow-net` da `turn` local (o runbook cita 44995; foi 46437).

O 302 da Coinzz (`stock-and-delivery-day`) **não era do container**: desde 24/09 o endpoint exige
o cabeçalho `X-Requested-With: XMLHttpRequest` — sem ele, 302 também em produção, e a região foi
nula em todo lead por duas semanas (grafo §66, C1). Com o cabeçalho, a rodada local consulta a
região de verdade.
E a rodada que mede a produção passa `CONVERSATION_MODEL`/`CONVERSATION_MODEL_PRICE` iguais
aos segredos (conferíveis pelo hash SHA-256 que `GET /v1/projects/<ref>/secrets` devolve).
