# Portal de análise de dados e otimização operacional: briefing da sessão que vai construí-lo

> Escrito em 2026-10-09, ao fechar o L2. O operador decidiu construir o portal **antes** do próximo teste
> real. Este arquivo junta o que já existe para a próxima sessão não precisar redescobrir. O pedido original,
> as métricas e as decisões abertas estão em [`10-execucao-mes-1.md` §8](10-execucao-mes-1.md#8-portal-no-vercel).

## O pedido (operador)

- Hospedado no Vercel, atualizado a cada 1 h.
- Períodos: dia, semana, mês, 3, 6, 9 e 12 meses.
- Um gráfico de linha por métrica e uma tabela comparando cada métrica com ela mesma entre os períodos (%).
- Seção "Quando pausar" com os seis critérios do L3.
- Métricas por criativo/copy e por região (proposta de 12 métricas no §8).

## Decisões abertas no §8 (recomendação entre parênteses), para fechar na primeira mensagem

1. Onde mora o código: repositório novo `encorpa-portal`, Next.js no Vercel. Este repositório não tem UI de
   propósito (`CLAUDE.md`).
2. Conta e token do Vercel (operador).
3. Dados do anúncio: token do usuário do sistema do BM com `ads_read` (sócio) e o id da conta de anúncio.
4. Comissões recebidas: fase 1 estimada a partir de `orders` + taxas do config.
5. Login: Supabase Auth por link mágico, lista de 2 e-mails; a chave do banco só no servidor.

## O que o banco já tem (Supabase `hbmkgakzrqmdlsvszjeo`, conferido em 2026-10-09)

Toda tabela tem RLS ligado e nenhuma policy: só a `service_role` lê. As views `eval_*` têm `security_invoker`.
**O portal lê só pelo servidor, nunca com a service_role no navegador.**

| Fonte | Colunas | Serve para |
|---|---|---|
| `eval_funnel` | day, origin, stage, stage_order, conversations | funil por dia e origem (anúncio × orgânico) |
| `eval_attribution` | ad, headline, leads, leads_ordered, leads_delivered, leads_opted_out | métricas por criativo, pelo `referral` do CTWA |
| `eval_turn_outcomes` | day, turns, sent, fallbacks, handoffs, deferred, stopped, opted_out, *_rate, avg_rewrites, cost_brl | saúde da Malu por dia (handoff, resposta pronta) |
| `eval_version_outcomes` | agent_version, … mesmas métricas | antes × depois de cada versão (`agent_versions`) |
| `eval_conversation_cost` | conversation_id, lead_id, stage, day, model_calls, tokens, cost_brl, agent_versions | custo de API por lead |
| `eval_gate_blocks` | day, gate, checks, blocks, warns, block_rate | o que a verificação da loja barra |
| `orders` | payment_method, size (pode ser nulo desde 0025), amount_brl, status, units, scheduled_for, created_at | pedidos, faturamento, entrega × antecipado, recusa |
| `leads` | source (referral do anúncio), opted_out_at, handoff_at, payment_choice, created_at | leads, opt-out, origem |
| `llm_calls` | purpose (interpret, reply, rewrite, transcribe, vision), model, tokens, cost_brl, agent_version | custo de API por propósito |
| `turn_outcomes` | outcome, reason, cost_brl, agent_version | cada resposta e por que parou |

Retenção: o dado de cliente expira em 90 dias (`expires_at`); o portal mostra agregados, nunca telefone.

## Atenção

- Números de dinheiro do negócio vêm do `BUSINESS_CONFIG` (segredo; o exemplo é `config/business.example.json`),
  nunca escritos no portal.
- Antes de 2026-10-09 os testes do operador e dos amigos estão no banco: filtrar ou marcar como teste. Os
  leads de teste conhecidos têm os finais 5983, 7967, 9393 e 7745.
- O custo da conversa por lead está em `conversations.cost_brl` e em `eval_conversation_cost`; o da
  transcrição e da imagem fica em `llm_calls` sem `conversation_id`.
