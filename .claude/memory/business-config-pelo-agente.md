---
name: business-config-pelo-agente
description: O operador autorizou (13/10) gravar o segredo BUSINESS_CONFIG sem consultar — sempre do JSON validado, pela API de gerência, com prova `job:"health"` logo depois; um JSON colado errado derruba a `turn` inteira na inicialização.
metadata:
  type: feedback
---

Em 2026-10-13 o operador colou um `BUSINESS_CONFIG` à mão e a `turn` caiu inteira (`WORKER_ERROR` até no
`{"job":"health"}`, que roda antes de qualquer conversa): a função lê o segredo no boot, e um JSON inválido
ou sem um campo lido no topo (`cost`) a derruba. Ficou fora do ar ~4 min, até a colagem do JSON validado.

**Autorização do operador (13/10):** "da próxima vez você pode fazer isso sem precisar me consultar" — gravar
o segredo `BUSINESS_CONFIG` diretamente. Como fazer:
1. Montar o JSON a partir do anterior, validar (`JSON.parse` + `systemPrompt(config, [], null)` monta sem erro).
2. `POST https://api.supabase.com/v1/projects/<ref>/secrets` com `[{"name":"BUSINESS_CONFIG","value":"<json compacto>"}]`
   (precisa de `SUPABASE_ACCESS_TOKEN`; o proxy do container não injeta `api.supabase.com`).
3. Conferir: `GET .../secrets` devolve o sha256 do valor — compare com o sha256 do JSON compacto
   (`separators=(',',':')`, `ensure_ascii=False`); depois `{"job":"health"}` → `healthy`.
O classificador de permissão do Claude Code pode barrar a escrita no cofre mesmo assim; aí diga ao operador
o JSON exato para colar, nunca contorne.
