---
name: ambiente-aponta-para-outro-projeto
description: O ambiente muda entre sessões — confira o projeto antes de usar. Em 28/09 o Supabase/n8n do container eram de OUTRO projeto (mrcab…); em 29/09 o conector Supabase listava só a Encorpa (hbmkgakzrqmdlsvszjeo). Nunca assuma: rode list_projects primeiro.
metadata:
  type: reference
---

Conferido em 2026-09-28: as variáveis de ambiente desta máquina apontavam para outro
Supabase (`mrcabcaotblleojxnsxc`) e outro n8n (`acoustic-perch.pikapod.net`). A Encorpa é
`hbmkgakzrqmdlsvszjeo` e `encorpa-fashion.pikapod.net`.

Conferido em 2026-09-29, em outra sessão: o conector MCP do Supabase listava **só** o projeto
"Encorpa Database" (`hbmkgakzrqmdlsvszjeo`), e o proxy injetava credencial para
`hbmkgakzrqmdlsvszjeo.supabase.co` e `encorpa-fashion.pikapod.net`. O operador confirmou o
acesso. O secret `BUSINESS_CONFIG` da Edge Function não é legível pelo conector (não há
ferramenta de secrets); o JSON vai para o operador colar.

Por que importa: `pnpm hermes --source=supabase` lê `SUPABASE_URL` — com o ambiente errado
leria o banco errado. `pnpm dev:painel` recusa chave JWT cujo `ref` é outro projeto.

Quando se aplica: antes de qualquer comando que fale com produção — `list_projects` (ou o
`ref` da URL) primeiro, e só então agir.
