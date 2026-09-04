# Máquina de estados da conversa

Precisamos saber em que ponto cada conversa parou — para retomar de onde estava, para
medir, e para o follow-up não recomeçar do zero.

Referência de **forma**, não de conteúdo: DeskcommCRM → `agent/lead-state.ts` :23
(`LEAD_STAGES`), :35 (`LEAD_STAGE_TRANSITIONS`), :45 (`isValidTransition`).
O funil dele é B2B com BANT. O nosso é COD B2C de R$ 129,90 — **os estágios são outros.**

## Proposta de estágios

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
[`../00-contexto/03-economia-cod.md`](../00-contexto/03-economia-cod.md).

## Aberto

- **Estágio para "abandonou no meio do pedido"** — é `perdido` ou um estado próprio de
  recuperação? Muda a régua de follow-up.
- **Recusa parcial** — recusou hoje mas aceita reagendar. NÃO IDENTIFICADO em nenhuma
  referência.
