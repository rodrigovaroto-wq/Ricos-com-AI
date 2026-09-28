---
name: ambiente-aponta-para-outro-projeto
description: No container de nuvem do Claude Code, SUPABASE_URL/SUPABASE_ACCESS_TOKEN/N8N_* e os conectores MCP são de OUTRO projeto (mrcab…, acoustic-perch) — nunca usar para a Encorpa (hbmkg…, encorpa-fashion).
metadata:
  type: reference
---

Conferido em 2026-09-28: as variáveis de ambiente desta máquina apontam para outro
Supabase (`mrcabcaotblleojxnsxc`) e outro n8n (`acoustic-perch.pikapod.net`). A Encorpa é
`hbmkgakzrqmdlsvszjeo` e `encorpa-fashion.pikapod.net`. O operador pediu no mesmo dia para
não usar os conectores (Supabase, GitHub, Docs) desta conta: são de outro projeto.

Por que importa: `pnpm hermes --source=supabase` lê `SUPABASE_URL` — aqui ele leria o banco
errado. `pnpm dev:painel` não lê `SUPABASE_URL` por isso (URL da Encorpa por padrão, e recusa
chave JWT cujo `ref` é outro projeto). `pnpm dev:n8n` usa `N8N_BASE_URL` se estiver setada.

Quando se aplica: antes de qualquer comando que fale com produção. Nesta máquina, produção da
Encorpa é do operador (Codespace); o Claude constrói e testa no repositório.
