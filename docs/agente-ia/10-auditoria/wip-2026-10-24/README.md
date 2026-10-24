# Trabalho parado a pedido do operador (2026-10-24, noite)

Dois patches **incompletos, não testados e não revisados**, salvos dos worktrees das duas frentes da onda 1 quando o operador mandou
parar. A base de ambos é o commit `4a2c5ea` (branch `claude/focused-cannon-lk2wim`). Nada disto está no código da branch, nem em produção.

| Patch | Frente | O que já tinha | O que faltava quando parou |
|---|---|---|---|
| `onda-1a-gates.patch` (só `src/agent/guardrails.ts`, +154 −28) | Falsos vetos da §4 de `personas-2026-10-24-revisao-final.md` | `shipping_promise` aceitando Pix/cartão **na porta** (`DOOR_MEANS`) e a negação do boleto; `installment_promise` aceitando "no antecipado: Pix ou até 12x" e o kit dividido; `delivery_promise` sem ler "*7 Dias de Garantia*" como prazo | espelho em `supabase/functions/turn/guardrails.ts` (não copiado); `charge_promise`, `size_claim`/`unverified_size`, `invented_testimonial`, `cep_insist`; os falsos negativos (quadril, postura, reserva, "apaguei seus dados"); arquivo de teste; `pnpm test`, `dev:gates`, mutações, revisão Opus, grafo §129 |
| `onda-1b-fluxo.patch` (22 arquivos, +330 −46) | Link, nome, oferta, CEP (A1–A9 da mesma auditoria) | pedido de link reconhecido ("sim, manda", "cadê o link", "pode agendar pra mim", "manda o link só aí eu vejo"); nome cortado no ponto final e na linha ("Gisele Rocha. resto…", "Vilma Torres\n…"); nome de duas palavras aceito; tamanho por peça ("um G pra mim e um M"); "vesto 44" e o número dentro da pergunta; cidade por apelido ("centro bh"); link de pagamento de terceiro detectado; motivo do antecipado pelo tamanho; testes antigos ajustados | arquivo de teste novo; prova de cada item; `pnpm test` completo, `dev:conversas`, `dev:gates`, `typecheck:function`; mutações; revisão Opus; grafo §130 |

Para retomar: `git apply docs/agente-ia/10-auditoria/wip-2026-10-24/onda-1a-gates.patch` (e o outro) numa branch nova a partir da base,
copiar os espelhos, e seguir o que falta. Os dois patches tocam arquivos diferentes e aplicam juntos sobre `4a2c5ea` (conferido com
`git apply --check`).
