---
name: sem-gasto-de-api-sem-pedido
description: operador, 15/10 — depois da rodada da v26, NÃO rodar personas nem nada que gaste tokens da API do modelo (Meta) sem ele pedir de novo; vence a regra de fim de fase
metadata:
  type: feedback
---

Em 2026-10-15, depois de pedir a v26, o operador disse: "Depois dessa rodada toda que está fazendo não rode mais as personas ou
qualquer coisa que gaste tokens da API da IA". Vale até ele pedir de novo, e passa por cima da memória
`fim-de-fase-personas-e-code-review` (personas no fim de cada fase): pergunte antes.

O que gasta: `pnpm dev:personas*`, `pnpm hermes`/`hermes:calibrar`, qualquer `turn` local que chame `api.meta.ai`, smoke de modelo.
O que não gasta e segue livre: `pnpm test`, `dev:conversas`, `dev:gates`, `verificar:guardas`, `typecheck:function`, `deploy:turn`, o
`job:"health"` (consulta só a cobertura) e revisões por subagente do Claude (não é a API da Meta).
