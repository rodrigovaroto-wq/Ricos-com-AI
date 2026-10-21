---
name: mcp-sql-trava-com-delete
description: O execute_sql/apply_migration do MCP do Supabase trava 60 s e não aplica nada quando o SQL contém `delete` (espera uma confirmação que não chega) — use a API de gerência com SUPABASE_ACCESS_TOKEN.
metadata:
  type: feedback
---
Em 2026-10-20 a migração 0028 (que recria `purge_expired()`, com `delete` no corpo) deu timeout duas vezes no `apply_migration`
e uma no `execute_sql`, sem aplicar nada; a parte sem `delete` (tabela, índice, RLS) passou no `execute_sql`. O que funcionou:
`POST https://api.supabase.com/v1/projects/<ref>/database/query` com `{"query": …}` e `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`
(a variável existe no container; o proxy NÃO injeta esse cabeçalho — sem ele dá 401). Registre a migração em
`supabase_migrations.schema_migrations` depois, e confira os objetos com uma consulta antes de seguir.
