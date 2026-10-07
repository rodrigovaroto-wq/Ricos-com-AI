---
name: proxy-sobrescreve-auth-do-supabase
description: No container, o proxy reescreve o Authorization do Supabase (RLS 42501 ou "Invalid API key") — rodada local de personas só anda com NO_PROXY no host do Supabase e a service_role no ambiente; a consulta de região (Coinzz) também falha daqui.
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

Também daqui: `app.coinzz.com.br/checkout/stock-and-delivery-day` responde 302 para qualquer
CEP (até São Paulo), então `region` fica nula em toda rodada local — o caminho "sem
pagamento na entrega" (Cleide) só se prova depois do deploy, pela porta de produção.
E a rodada que mede a produção passa `CONVERSATION_MODEL`/`CONVERSATION_MODEL_PRICE` iguais
aos segredos (conferíveis pelo hash SHA-256 que `GET /v1/projects/<ref>/secrets` devolve).
