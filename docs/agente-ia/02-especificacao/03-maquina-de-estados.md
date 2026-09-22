# Máquina de estados da conversa

> **Status em 2026-09-22 — leia antes de confiar nesta página.** Os dez estágios abaixo
> **existem em código** (`src/agent/state-machine.ts`: `STAGES`, `TRANSITIONS`,
> `canTransition`, `transition`) e são exercitados por `tests/state-machine.test.ts` e pelo
> simulador `src/dev/engine.ts`. **Mas o turno de produção nunca escreve o estágio.**
>
> `conversations.stage` nasce `'discovery'` (`0001_init.sql:22`) — valor que **não está**
> na lista — e permanece assim para sempre. O único `stage` que o handler grava é o de
> `gate_traces` (`"presale"` / `"logistics"`), que é outro campo com o mesmo nome.
>
> **Consequência: não existe funil.** Não dá para perguntar quantas conversas chegaram em
> `tamanho_definido` e morreram antes de `endereco_coletado`.
>
> Corrigir isso é o item **3.7** do
> [plano de execução](../05-plano/02-plano-de-execucao-ate-os-testes-reais.md), decidido em
> [R11.8](../../documentacao/decisoes/03-decisoes-tomadas.md#r118--instrumentação-antes-do-tráfego-o-funil-e-o-desfecho-do-turno),
> e é **urgente por prazo**: conversa que já aconteceu não se instrumenta depois.

Precisamos saber em que ponto cada conversa parou — para retomar de onde estava, para
medir, e para o follow-up não recomeçar do zero.

Referência de **forma**, não de conteúdo: DeskcommCRM → `agent/lead-state.ts` :23
(`LEAD_STAGES`), :35 (`LEAD_STAGE_TRANSITIONS`), :45 (`isValidTransition`).
O funil dele é B2B com BANT. O nosso é COD B2C de R$ 129,90 — **os estágios são outros.**

## Os estágios (em código desde 2026-09-07)

```
novo
  → conversando          (respondeu, ainda descobrindo)
  → tamanho_definido     (sabemos qual serve)
  → endereco_coletado    (endereço completo e confirmado)
  → pedido_criado        (existe order_id na operação)
  → em_rota              (despachado pela Logzz)
  → entregue_pago        ✅ + R$ 63,35
  → recusado             ❌ − R$ 14,98 ou − R$ 54,98
  → perdido              (sumiu antes do pedido — custa só o clique)
  → bloqueado            (opt-out inequívoco, irreversível pelo agente)
```

## Regras que a estrutura precisa garantir

1. **Sem regressão.** Estágio só avança. Um lead em `pedido_criado` não volta para
   `conversando` porque mandou "oi" de novo.
2. **Transições declaradas.** A tabela de transições válidas é dado, não `if` espalhado.
3. **Avanço exige evidência.** O agente registra por que avançou; sem evidência na
   conversa, não avança.
4. **`bloqueado` é terminal para o agente.** Só uma pessoa desfaz.

## Por que estes estágios e não outros

Cada um marca uma pergunta operacional diferente:

| Estágio | Pergunta que responde |
|---|---|
| `conversando` | Vale continuar gastando IA aqui? |
| `tamanho_definido` | A objeção de "e se não servir" já foi resolvida? |
| `endereco_coletado` | Dá para criar o pedido? |
| `pedido_criado` | A régua de acompanhamento começa agora |
| `em_rota` | Chegou a hora do aviso de véspera |
| `entregue_pago` / `recusado` | Qual dos dois lados da unidade econômica aconteceu |

Os dois últimos são os únicos que fecham a conta. Todo o resto é aposta em aberto — ver
[`../../documentacao/contexto-negocio/03-economia-cod.md`](../../documentacao/contexto-negocio/03-economia-cod.md).

## Aberto

- **Estágio para "abandonou no meio do pedido"** — é `perdido` ou um estado próprio de
  recuperação? Muda a régua de follow-up.
- **Recusa parcial** — recusou hoje mas aceita reagendar. NÃO IDENTIFICADO em nenhuma
  referência.
