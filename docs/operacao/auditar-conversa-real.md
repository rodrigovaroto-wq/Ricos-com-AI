# Auditar uma conversa real da Malu (roteiro)

> Escrito em 2026-10-07, depois da auditoria da conversa da Leila
> ([`docs/agente-ia/10-auditoria/2026-10-06-teste-real-leila.md`](../agente-ia/10-auditoria/2026-10-06-teste-real-leila.md),
> que serve de modelo do relatório). Para cada conversa que o operador mandar (prints do
> WhatsApp), cruze o print com o banco: o print mostra o que ela viu; o banco mostra por quê.

## 1. Achar a conversa

Pelo final do telefone (os 4 últimos dígitos aparecem no print ou o operador informa):

```sql
select l.id lead_id, c.id conv_id, c.stage, l.size, l.handoff_at, l.identity, l.address,
       l.payment_choice, l.created_at
from leads l join conversations c on c.lead_id = l.id
where right(l.phone, 4) = '<FINAL>';
```

Conector: `mcp__Supabase__execute_sql` (projeto `hbmkgakzrqmdlsvszjeo`). Leitura funciona pelo
conector; **delete pelo conector trava** (pede confirmação que não chega) — use a API de gestão
com o `sbp_` do operador (ver memória `ambiente-aponta-para-outro-projeto` e HANDOFF).

## 2. As quatro leituras

```sql
-- Mensagens, no horário de Brasília
select to_char(created_at at time zone 'America/Sao_Paulo','HH24:MI:SS') t, direction d, body
from messages where conversation_id = '<CONV>' order by created_at;

-- Um resultado por turno: send / handoff / stopped (superseded, joined), reescritas, custo, versão
select to_char(created_at at time zone 'America/Sao_Paulo','HH24:MI:SS') t, outcome, reason,
       rewrites, round(cost_brl,3) cost, agent_version
from turn_outcomes where conversation_id = '<CONV>' order by created_at;

-- O que os gates barraram ou avisaram (o motivo volta ao modelo, que reescreve)
select to_char(created_at at time zone 'America/Sao_Paulo','HH24:MI:SS') t, gate, verdict,
       left(coalesce(detail::text,''),300) detail
from gate_traces where conversation_id = '<CONV>' and verdict <> 'pass' order by created_at;

-- Cada chamada ao modelo: interpret / reply / rewrite, tokens e custo
select to_char(created_at at time zone 'America/Sao_Paulo','HH24:MI:SS') t, purpose, model,
       input_tokens, output_tokens, round(cost_brl,4) cost
from llm_calls where conversation_id = '<CONV>' order by created_at;
```

Os toques da régua (lembretes): `select kind, status, run_at, sent_at from followups where
conversation_id = '<CONV>' order by run_at;`

## 3. O que procurar (lista da Leila, ampliada)

1. **Ritmo:** mais de uma resposta por rajada dela? (`turn_outcomes` com `send` seguidos sem
   inbound entre eles; `joined`/`superseded` mostram a rajada funcionando.)
2. **Ordem:** a resposta chegou fora de ordem no print? (comparar horários do banco com o print.)
3. **Repetição:** preço, nome dela, a roupa dela, o CEP pedido de novo, a mesma pergunta duas vezes.
4. **Contradição:** uma resposta desdiz a anterior.
5. **Contexto perdido:** uma pergunta antiga dela que a resposta nova devia ligar e não ligou.
6. **Promessa falsa:** comparar com `gate_traces` — o gate barrou? Se a frase saiu, por que passou?
7. **Fluxo de venda (desenho v2):** valor antes do preço; duas opções só com pagamento na entrega
   no CEP; tamanho, CEP, forma de pagamento, nome e CPF antes do link (~~e-mail~~: não se pede nem se guarda desde 2026-10-07, grafo §66); kit oferecido uma
   vez depois da escolha; link uma vez só.
8. **Identidade:** nunca se anuncia virtual sem pergunta; responde honesto quando perguntada.
9. **Custo:** custo por turno e total; reescritas caras; teto (R$ 1,00) atingido → handoff.
10. **Silêncio:** ela ficou sem resposta? (handoff sem pessoa respondendo, `stopped` sem sucessor.)

## 4. Do achado ao conserto

- Cada defeito vira teste de **comportamento** (função pura), com casos de negação, antes do código.
- Gate ou heurística de texto → Opus; `pnpm dev:gates --fail-on-loosen`.
- Espelho byte a byte `src/agent/X.ts` ↔ `supabase/functions/turn/X.ts`.
- Uma mutação por conserto em `src/dev/verify-guards.ts` (`from` aparece uma vez só); rodar
  `pnpm verificar:guardas` **depois do commit** (ele lê o HEAD).
- Revisão Opus até aprovar; entrada no grafo de decisões.
- Publicar: migrações primeiro; depois `SUPABASE_ACCESS_TOKEN=sbp_… NODE_USE_ENV_PROXY=1 pnpm
  deploy:turn --note="…"` (registra `agent_versions`, grava `AGENT_VERSION`, publica a `turn`).
  Só com o "pode publicar" do operador.
- Lead de teste do operador: apagar quando ele pedir, para testar a abertura do zero.
