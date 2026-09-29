---
name: dev-n8n-sobrescreve-workflows
description: `pnpm dev:n8n` grava a versão ATIVA de cada workflow por cima de n8n/workflows/*.json; quando o main está à frente do n8n, um `git add -A` depois dele desfaz o main e o CI quebra.
metadata:
  type: feedback
---

Em 2026-09-29, rodei `pnpm dev:n8n` para conferir um workflow que acabara de publicar e
commitei com `git add -A`. O comando baixa a versão ativa de todos os workflows para
`n8n/workflows/`, e três deles (Turno, Relógio, WhatsApp envio) estavam atrás do `main` no
n8n. O commit levou as versões antigas e o CI quebrou em `n8n-workflows.test.ts` e
`n8n-whatsapp-send.test.ts`.

Depois de `pnpm dev:n8n`, rode `git diff --stat n8n/` e só adicione o arquivo do workflow
que você de fato publicou; restaure o resto (`git checkout -- n8n/workflows/<x>.json`).
