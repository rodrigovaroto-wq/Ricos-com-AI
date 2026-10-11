---
name: fim-de-fase-personas-e-code-review
description: Ao terminar uma FASE inteira do plano prático (E1, E2… — nunca a cada E1.x), rodar o loop de autoaprimoramento, a bateria de personas com subagentes e depois o /code-review, antes de declarar a fase pronta.
metadata:
  type: feedback
---

Regra do operador (2026-10-11), para o plano prático de conversão (E0–E8): quando uma fase
completa termina — todas as tarefas de E1, por exemplo, e não uma E1.x sozinha — a sessão roda,
nesta ordem, antes de dizer que a fase está pronta:

1. **Loop de autoaprimoramento:** olhar o que a fase entregou contra o objetivo e o portão de
   saída dela, achar o que ficou fraco e consertar (com teste), repetindo até não achar mais nada
   relevante.
2. **Personas reais com subagentes:** a bateria dos agentes `persona-*` de `.claude/agents/`
   (mais as personas novas que a fase criou), pela porta local da `turn` com o modelo da
   produção (memória `proxy-sobrescreve-auth-do-supabase` antes de rodar); placar com
   `pnpm dev:placar`.
3. **`/code-review`** sobre o diff da fase inteira; os achados são consertados ou respondidos.

Só depois disso a fase vai para "executado" no quadro do `HANDOFF.md`.
